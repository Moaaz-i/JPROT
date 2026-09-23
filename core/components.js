import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_THEME_DIR } from './config.js'
import { parseFrontmatter } from '../lib/frontmatter.js'
import { createMarkdown } from '../lib/markdown.js'
import { slugify } from './utils.js'

async function listComponents(sourceDir) {
  const names = []
  try {
    const entries = await readdir(sourceDir)
    for (const n of entries) {
      if (n.endsWith('.js') || n.endsWith('.md')) names.push([n.replace(/\.(js|md)$/, ''), join(sourceDir, n)])
    }
  } catch { /* dir missing */ }
  // .md first, .js last, so a JavaScript component always wins over the
  // Markdown variant of the same name.
  return names
    .filter(([, f]) => f.endsWith('.md')).sort((a, b) => a[0].localeCompare(b[0]))
    .concat(names.filter(([, f]) => f.endsWith('.js')).sort((a, b) => a[0].localeCompare(b[0])))
}

// Fills `[value]` placeholders in a Markdown component body from the given map.
// Only names that actually exist are replaced, so `[text](url)` links and other
// literal `[...]` prose stay untouched unless the key is present. A leading
// backslash escapes a placeholder: `\[key]` renders as a literal `[key]`.
// Whole `[...](...)` link/image spans are protected first, so a `[key]` that
// appears inside link text or inside a target URL is never substituted.
// Arrays become Markdown list lines; objects become JSON.
export function interpolateMdValues(template, data = {}) {
  let s = String(template ?? '')
  s = s.replace(/\\\[/g, '\u0001OPEN')
  const spans = []
  s = s.replace(/!\[[^\]]*\]\([^)\n]*\)|\[[^\]]*\]\([^)\n]*\)/g, (m) => {
    spans.push(m)
    return `\u0002SPAN${spans.length - 1}\u0002`
  })
  s = s.replace(/\[([A-Za-z0-9_-]+)\](?![(\[])/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return match
    const value = data[key]
    if (Array.isArray(value)) {
      if (!value.length) return ''
      return value.map((item) => {
        if (item !== null && typeof item === 'object') return `- ${JSON.stringify(item)}`
        return `- ${String(item)}`
      }).join('\n')
    }
    if (value !== null && typeof value === 'object') return JSON.stringify(value)
    return String(value ?? '')
  })
  s = s.replace(/\u0002SPAN(\d+)\u0002/g, (m, i) => spans[Number(i)])
  s = s.replace(/\u0001OPEN/g, '[')
  return s
}

// Turns a Markdown component file into a render function. Frontmatter is the
// component's own default values; props passed in at render time (section
// config or shortcode attributes) override them. The rendered Markdown is
// wrapped in a `.md-component-<name>` div so it can be styled entirely from CSS.
async function loadMdComponent(name, file, markdown) {
  const raw = await readFile(file, 'utf8')
  const { data, body } = parseFrontmatter(raw)
  return function mdComponent(props = {}) {
    const merged = { ...data, ...props }
    const rendered = interpolateMdValues(body, merged)
    const inner = markdown.render(rendered, [])
    return `<div class="md-component-${slugify(name)}">\n${inner}</div>\n`
  }
}

// Loads every *.js / *.md component from the built-in theme dir plus user
// overrides. User components with the same name override the built-ins.
export async function loadComponents(userThemeDir, bust = false, markdown) {
  const md = markdown || createMarkdown()
  const candidates = [
    ...(await listComponents(join(DEFAULT_THEME_DIR, 'components'))),
    ...(await listComponents(join(userThemeDir, 'components'))),
  ]
  const loaded = {}
  for (const [name, file] of candidates) {
    if (file.endsWith('.md')) {
      try {
        loaded[name] = await loadMdComponent(name, file, md)
      } catch (e) {
        console.warn(`[jprot] could not load component "${name}" from ${file}: ${e.message}`)
      }
      continue
    }
    const href = pathToFileURL(file).href + (bust ? '?t=' + Date.now() : '')
    try {
      const mod = await import(href)
      const value = mod.default || mod
      if (typeof value !== 'function') {
        console.warn(`[jprot] component "${name}" in ${file} does not export a component function; skipping`)
        continue
      }
      loaded[name] = value
    } catch (e) {
      console.warn(`[jprot] could not load component "${name}" from ${file}: ${e.message}`)
    }
  }
  return loaded
}
