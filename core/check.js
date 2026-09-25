// `jprot check` — validate the project's own configuration before it becomes a
// runtime surprise.
//
// `jprot.d.ts` catches type errors in the editor; this catches them in CI, at
// the exact line, and additionally verifies the things a type *cannot* express:
// that the config actually loads, that every section names a component that
// exists (including the ones a plugin adds), and that every declared plugin is
// resolvable, importable and has a `setup()` that runs without throwing.
//
// It is the cheap half of `jprot lint` (which reads content) and is meant to
// run first: a bad config makes every other check meaningless.
import { join } from 'node:path'
import { loadConfigWithSource } from './config.js'
import { loadComponents, normalizeComponent } from './components.js'
import { formatConfigIssues, validateConfig } from './schema.js'
import { runPlugins } from './plugins.js'

/**
 * Analyze a project's configuration.
 *
 * @param {object} [options]
 * @param {string} [options.root]  project root (defaults to cwd)
 * @param {object} [options.config] an explicit config object/handler to check
 * @param {boolean} [options.strict] treat warnings as errors
 * @returns {Promise<{ok: boolean, errors: Array, warnings: Array, sections: Array,
 *                    plugins: Array, config: object, file: string}>}
 */
export async function checkConfig({ root, config: configOption, strict = false } = {}) {
  const projectRoot = root || process.cwd()
  const { config, file, source } = await loadConfigWithSource(projectRoot, configOption, true)
  const result = validateConfig(config, { file, source })
  const errors = [...result.errors]
  const warnings = [...result.warnings]

  // Sections and plugins are cross-references: the schema cannot know which
  // component names actually exist in this project's theme, and a plugin may
  // add more. Running `setup()` here is the point — it is the same call the
  // server makes, so a plugin that throws surfaces here rather than as a blank
  // page in production.
  let components = {}
  try {
    components = await loadComponents(join(projectRoot, 'theme'), true)
  } catch (e) {
    errors.push({
      level: 'error',
      path: 'theme/',
      message: `could not load components — ${e.message}`,
      file: 'theme/',
      line: 0,
    })
  }

  const { registry, plugins } = await runPlugins({ projectRoot, config, bust: true, quiet: true })
  for (const { name, component } of registry.components) {
    const normalized = normalizeComponent(name, component)
    if (normalized) components[name] = normalized
  }

  const known = new Set(Object.keys(components))
  const sections = []
  for (const [i, section] of (Array.isArray(config.sections) ? config.sections : []).entries()) {
    const name = section && (section.component || section.type)
    if (!name) continue
    const exists = known.has(name)
    sections.push({ index: i, name, exists })
    if (!exists) {
      errors.push({
        level: 'error',
        path: `sections[${i}]`,
        message: `no component named "${name}" — available: ${[...known].sort().join(', ') || '(none found)'}`,
        file,
        line: 0,
      })
    }
  }

  for (const plugin of plugins) {
    if (plugin.error) {
      errors.push({
        level: 'error',
        path: `plugins["${plugin.name}"]`,
        message: plugin.error,
        file: plugin.file,
        line: 0,
      })
      continue
    }
    const adds = []
    if (plugin.components?.length) adds.push(`components ${plugin.components.join(', ')}`)
    if (plugin.routes?.length) adds.push(`routes ${plugin.routes.join(', ')}`)
    if (plugin.hooks?.length) adds.push(`hooks ${plugin.hooks.join(', ')}`)
    warnings.push({
      level: 'warning',
      path: `plugins["${plugin.name}"]`,
      message: adds.length ? `registers ${adds.join('; ')}` : 'loaded, registers nothing',
      file: plugin.file,
      line: 0,
    })
  }

  return {
    ok: errors.length === 0 && (!strict || warnings.length === 0),
    errors,
    warnings,
    sections,
    plugins,
    config,
    file,
  }
}

/** CLI entry point: prints the report and returns the process exit code. */
export async function runCheck({ root, strict = false } = {}) {
  const report = await checkConfig({ root, strict })
  const { errors, warnings, file } = report

  if (!errors.length && !warnings.length) {
    console.log(`✔ check: ${file} is valid`)
    return 0
  }

  if (errors.length) {
    console.log(`✖ check: ${errors.length} error(s) in ${file}`)
    console.log(formatConfigIssues({ errors, warnings: [] }))
  } else {
    console.log(`⚠ check: ${file} is valid with ${warnings.length} warning(s)`)
  }
  if (warnings.length) {
    if (errors.length) console.log('  ── warnings')
    console.log(formatConfigIssues({ errors: [], warnings }))
  }
  return report.ok ? 0 : 1
}
