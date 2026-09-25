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
//
// A component may be exported in two shapes:
//
//   export default function (props) { return html }          // simple
//   export default { name, props, render(props) { … } }       // declared
//
// The declared shape is optional sugar for advanced components: it attaches a
// prop schema so `jprot lint` can report a missing or misspelled prop, while
// rendering stays exactly as simple. Both are normalized to a function here so
// the renderer only ever deals with one thing.
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
      const component = normalizeComponent(name, mod.default || mod)
      if (!component) {
        console.warn(`[jprot] component "${name}" in ${file} does not export a component function; skipping`)
        continue
      }
      loaded[name] = component
    } catch (e) {
      console.warn(`[jprot] could not load component "${name}" from ${file}: ${e.message}`)
    }
  }
  return loaded
}

// Props JPROT itself passes to every component. A declared schema must never
// flag them, otherwise every component would report the same false positives.
export const SHARED_PROPS = ['site', 'page', 'nav', 'docsNav', 'projects', 'posts', 'children', 'content', 'sectionsHtml', 'header', 'footer', 'sidebar']

// `{ title: 'string', count: { type: 'number', required: true } }` → a flat
// map of prop name → descriptor.
export function propSchema(value) {
  if (!value || typeof value !== 'object') return null
  const out = {}
  for (const [key, spec] of Object.entries(value)) {
    out[key] = typeof spec === 'string' ? { type: spec, required: false } : { ...(spec || {}) }
    if (!out[key].type) out[key].type = 'any'
  }
  return out
}

// Turns either supported export shape into a render function, keeping the
// declared schema on the function for lint. Returns null when the value is not
// a component at all.
export function normalizeComponent(name, value) {
  if (typeof value === 'function') {
    value.componentName = name
    return value
  }
  if (value && typeof value === 'object' && typeof value.render === 'function') {
    const fn = async (props) => value.render(props)
    fn.componentName = value.name || name
    fn.props = propSchema(value.props)
    return fn
  }
  return null
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

function typeMatches(spec, value) {
  const actual = typeOf(value)
  if (spec === 'any' || !spec) return true
  if (spec === 'array') return actual === 'array'
  if (spec === 'object') return actual === 'object' || actual === 'array'
  if (spec === 'number') return actual === 'number' || actual === 'bigint'
  if (spec === 'boolean') return actual === 'boolean'
  if (spec === 'string') return actual === 'string' || actual === 'number' || actual === 'boolean'
  return actual === spec
}

/**
 * Check the props a component was called with against its declared schema.
 *
 * @param {Function|object} component  a loaded component or its raw export
 * @param {object} values              the props it was invoked with
 * @param {object} [options]
 * @param {string[]} [options.extra]   additional prop names to ignore
 * @returns {Array<{prop: string, level: 'error'|'warning', message: string}>}
 */
export function validateProps(component, values = {}, { extra = [] } = {}) {
  const fn = typeof component === 'function' ? component : null
  const schema = (fn && fn.props) || propSchema(component && component.props)
  if (!schema) return []
  const allowed = new Set([...SHARED_PROPS, ...extra])
  const issues = []
  for (const [prop, spec] of Object.entries(schema)) {
    const value = values[prop]
    if (value === undefined) {
      if (spec.required) {
        issues.push({ prop, level: 'error', message: `missing required prop \`${prop}\` (${spec.type})` })
      }
      continue
    }
    if (!typeMatches(spec.type, value)) {
      issues.push({ prop, level: 'error', message: `prop \`${prop}\` should be ${spec.type}, got ${typeOf(value)}` })
    }
  }
  for (const prop of Object.keys(values)) {
    if (allowed.has(prop) || schema[prop]) continue
    const hint = suggestKey(Object.keys(schema), prop)
    issues.push({
      prop,
      level: 'warning',
      message: `unknown prop \`${prop}\`${hint ? ` — did you mean \`${hint}\`?` : ''}`,
    })
  }
  return issues
}

// Cheap "did you mean" for a misspelled prop name.
function suggestKey(keys, input) {
  const target = String(input).toLowerCase()
  let best = null
  let bestScore = Infinity
  for (const key of keys) {
    const score = distance(target, key.toLowerCase())
    if (score < bestScore) { bestScore = score; best = key }
  }
  return bestScore <= Math.max(2, Math.floor(target.length / 3)) ? best : null
}

function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
    }
  }
  return rows[a.length][b.length]
}
