import { readFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const jprotRoot = dirname(dirname(fileURLToPath(import.meta.url)))

// Where the built-in default theme ships inside this package.
export const DEFAULT_THEME_DIR = join(jprotRoot, 'theme', 'default')

async function hasFile(path) {
  try { return (await stat(path)).isFile() } catch { return false }
}

// Unwraps a module namespace: `export default {...}` wins; otherwise a
// `export const config = {...}` is used and a hint is printed. Anything else
// is returned untouched so a callable config survives.
function unwrapConfig(mod) {
  if (!mod || typeof mod !== 'object') return mod
  if (mod.default !== undefined) return mod.default
  if ('config' in mod && mod.config !== undefined) {
    console.warn('[jprot] jprot.config.js uses `export const config` — prefer `export default {...}`.')
    return mod.config
  }
  return mod
}

// Imports jprot.config.js as ESM. Direct file import honours relative imports
// and file watching, but fails when the file lives in a folder that has no
// `"type": "module"` in package.json (e.g. a temp dir used by tests), because
// Node then treats `.js` as CommonJS and chokes on `export`. In that case we
// retry by reading the source and importing it as a data URL.
async function importConfigFile(jsPath, bust) {
  const fresh = (href) => (bust ? href + '?t=' + Date.now() : href)
  try {
    const mod = await import(fresh(pathToFileURL(jsPath).href))
    return { ok: true, mod }
  } catch (err) {
    const esmAsCjs = /Unexpected token 'export'|ERR_REQUIRE_ESM/.test(String(err.message))
    if (!esmAsCjs) throw err
    const code = await readFile(jsPath, 'utf8')
    const mod = await import('data:text/javascript,' + encodeURIComponent(code))
    return { ok: true, mod }
  }
}

// Loads the site configuration from (in order of precedence):
// an explicitly provided object/handler, jprot.config.js, or jprot.config.json.
//
// `withSource` additionally returns the file the config came from and its raw
// text, which is what lets `jprot check` report `jprot.config.js:18` for a bad
// value instead of just naming the key.
export async function loadSiteConfig(projectRoot, configOption, bust = false) {
  const { config } = await loadConfigWithSource(projectRoot, configOption, bust)
  return config
}

export async function loadConfigWithSource(projectRoot, configOption, bust = false) {
  if (typeof configOption === 'function') {
    const c = await configOption()
    return { config: unwrapConfig(c) || {}, file: '<inline config>', source: '' }
  }
  if (configOption) return { config: configOption, file: '<inline config>', source: '' }

  const fresh = (href) => (bust ? href + '?t=' + Date.now() : href)
  const jsPath = join(projectRoot, 'jprot.config.js')
  if (await hasFile(jsPath)) {
    try {
      const { mod } = await importConfigFile(jsPath, bust)
      const source = await readFile(jsPath, 'utf8').catch(() => '')
      return { config: unwrapConfig(mod) || {}, file: 'jprot.config.js', source }
    } catch (e) {
      console.warn('[jprot] Could not load jprot.config.js:', e.message)
    }
  }
  const jsonPath = join(projectRoot, 'jprot.config.json')
  if (await hasFile(jsonPath)) {
    try {
      const source = await readFile(jsonPath, 'utf8')
      return { config: JSON.parse(source), file: 'jprot.config.json', source }
    } catch (e) {
      console.warn('[jprot] Could not load jprot.config.json:', e.message)
    }
  }
  return { config: {}, file: 'jprot.config.js', source: '' }
}

// Reads theme/main.js so a theme can declare its default composition.
export async function loadThemeMeta(themeDir) {
  const p = join(themeDir, 'main.js')
  if (!(await hasFile(p))) return {}
  try {
    const mod = await import(pathToFileURL(p).href)
    return mod.default || mod
  } catch {
    return {}
  }
}
