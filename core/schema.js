// Runtime validation for jprot.config.js.
//
// `jprot.d.ts` gives editor autocomplete, but a type error only shows up when
// something is already broken at runtime — and JPROT is a *server*: a typo like
// `docs: "yes"` used to be silently accepted and then behave as if `docs` were
// off. This module is the runtime half of the same contract: a small, zero-
// dependency schema walked against the loaded config, producing errors that
// point at a file and a line.
//
//   ✗ Invalid configuration
//
//     docs
//     Expected: boolean
//     Received: string ("yes")
//
//     jprot.config.js:18
const KNOWN = {
  title: 'string',
  tagline: 'string',
  description: 'string',
  url: 'string',
  basePath: 'string',
  docs: 'boolean',
  lang: 'string',
  dir: 'string',
  author: 'string',
  avatar: 'string',
  email: 'string',
  themeColor: 'string',
  ogImage: 'string',
  logo: 'string',
  searchUrl: 'string',
  twitter: 'string',
  ogLocale: 'string',
  sameAs: ['string'],
  alternateLangs: [{ lang: 'string', url: 'string' }],
  ogColor: 'string',
  ogTextColor: 'string',
  icon: 'string',
  head: 'string',
  footerText: 'string',
  blogDir: 'string',
  projectsDir: 'string',
  defaultLayout: 'string',
  homeLayout: 'string',
  sidebar: 'boolean',
  showNav: 'boolean',
  themePicker: 'boolean',
  projectsTitle: 'string',
  formspree: 'string',
  social: [{ name: 'string', label: 'string', url: 'string' }],
  nav: [{ label: 'string', url: 'string' }],
  catalogUrl: 'string',
  hero: { title: 'string', subtitle: 'string', avatar: 'string', links: [{ label: 'string', url: 'string' }] },
  sections: '*', // component + arbitrary props, validated against the registry
  labels: '*',
  themes: ['string | { id: string }'],
  markdown: '*', // validated against MARKDOWN_DEFAULTS in lib/markdown
  lint: { ignore: ['string'] },
  plugins: ['string'],
}

export const CONFIG_KEYS = Object.keys(KNOWN)

function typeName(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

function describe(value) {
  const t = typeName(value)
  if (t === 'string' || t === 'number' || t === 'boolean') return `${t} (${JSON.stringify(value)})`
  if (t === 'array') return `array (${value.length} item${value.length === 1 ? '' : 's'})`
  return t
}

function primitiveType(spec) {
  return String(spec).split('|')[0].trim()
}

function matchesPrimitive(spec, value) {
  const t = typeName(value)
  if (t === 'null') return true // `null` unsets an optional value
  return String(spec).split('|').some((s) => {
    const name = s.trim()
    if (name === 'any') return true
    if (name === 'array') return t === 'array'
    if (name === 'object') return t === 'object' || t === 'array'
    if (name === 'number') return t === 'number'
    if (name === 'boolean') return t === 'boolean'
    if (name === 'string') return t === 'string' || t === 'number' || t === 'boolean'
    return t === name
  })
}

function isObjectSchema(schema) {
  return schema && typeof schema === 'object' && !Array.isArray(schema)
}

/**
 * Validate a loaded config object against the schema.
 *
 * @param {object} config
 * @param {object} [options]
 * @param {string} [options.file]  config file name used in messages
 * @param {string} [options.source] the file's source text, to resolve line numbers
 * @param {string[]} [options.known] extra keys to accept (e.g. plugin keys)
 * @returns {{errors: Array, warnings: Array, ok: boolean}}
 */
export function validateConfig(config, { file = 'jprot.config.js', source = '', known = [] } = {}) {
  const errors = []
  const warnings = []
  const lines = source ? source.split(/\r?\n/) : []
  const add = (bucket, path, message) => {
    const line = findLine(lines, path)
    bucket.push({ level: bucket === errors ? 'error' : 'warning', path, message, file, line })
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    add(errors, '<root>', 'config must export an object, e.g. `export default { … }`')
    return { errors, warnings, ok: false }
  }

  for (const [key, value] of Object.entries(config)) {
    const schema = KNOWN[key]
    if (schema === undefined) {
      if (known.includes(key)) continue
      const hint = suggestConfigKey(key)
      add(warnings, key, `unknown config key${hint ? ` — did you mean "${hint}"?` : ''}`)
      continue
    }
    if (schema === '*') continue
    if (Array.isArray(schema)) {
      if (!Array.isArray(value)) {
        add(errors, key, `Expected: ${Array.isArray(schema[0]) ? 'array of objects' : primitiveType(schema[0])}\nReceived: ${describe(value)}`)
        continue
      }
      value.forEach((item, i) => {
        if (Array.isArray(schema[0]) && isObjectSchema(schema[0][0]) && !isObjectSchema(item)) {
          add(errors, `${key}[${i}]`, `Expected: object\nReceived: ${describe(item)}`)
        }
      })
      continue
    }
    if (isObjectSchema(schema)) {
      if (typeName(value) !== 'object' || Array.isArray(value)) {
        add(errors, key, `Expected: object\nReceived: ${describe(value)}`)
        continue
      }
      for (const [childKey, childSpec] of Object.entries(schema)) {
        const child = value[childKey]
        if (child === undefined) continue
        if (isObjectSchema(childSpec)) {
          if (typeName(child) !== 'object') {
            add(errors, `${key}.${childKey}`, `Expected: object\nReceived: ${describe(child)}`)
            continue
          }
          for (const [grandKey, grandSpec] of Object.entries(childSpec)) {
            if (typeof grandSpec !== 'string') continue
            const grand = child[grandKey]
            if (grand === undefined) continue
            if (!matchesPrimitive(grandSpec, grand)) {
              add(errors, `${key}.${childKey}.${grandKey}`, `Expected: ${grandSpec}\nReceived: ${describe(grand)}`)
            }
          }
          continue
        }
        if (Array.isArray(childSpec)) {
          if (!Array.isArray(child)) {
            add(errors, `${key}.${childKey}`, `Expected: array\nReceived: ${describe(child)}`)
            continue
          }
          // An array of declared objects (`[{ label, url }]`) checks each item;
          // an array of primitives (`['string']`) checks the items too, so
          // `sameAs: [1, 2]` is reported as the wrong element type.
          const itemSpec = childSpec[0]
          if (isObjectSchema(itemSpec)) {
            child.forEach((item, i) => {
              if (typeName(item) !== 'object') {
                add(errors, `${key}.${childKey}[${i}]`, `Expected: object\nReceived: ${describe(item)}`)
                return
              }
              for (const [field, fieldSpec] of Object.entries(itemSpec)) {
                if (typeof fieldSpec !== 'string') continue
                if (item[field] === undefined) continue
                if (!matchesPrimitive(fieldSpec, item[field])) {
                  add(errors, `${key}.${childKey}[${i}].${field}`, `Expected: ${fieldSpec}\nReceived: ${describe(item[field])}`)
                }
              }
            })
            continue
          }
          if (typeof itemSpec === 'string') {
            child.forEach((item, i) => {
              if (!matchesPrimitive(itemSpec, item)) {
                add(errors, `${key}.${childKey}[${i}]`, `Expected: ${itemSpec}\nReceived: ${describe(item)}`)
              }
            })
          }
          continue
        }
        if (!matchesPrimitive(childSpec, child)) {
          add(errors, `${key}.${childKey}`, `Expected: ${childSpec}\nReceived: ${describe(child)}`)
        }
      }
      continue
    }
    if (!matchesPrimitive(schema, value)) {
      add(errors, key, `Expected: ${schema}\nReceived: ${describe(value)}`)
    }
  }

  // Value rules a type cannot express.
  if (config.url && !/^https?:\/\//i.test(String(config.url))) {
    add(warnings, 'url', 'should be an absolute URL including the scheme, e.g. https://example.com')
  }
  if (config.basePath && !/^\/[^?#]*$/.test(String(config.basePath))) {
    add(errors, 'basePath', 'must start with "/" and contain no query or hash, e.g. "/my-repo"')
  }
  if (config.dir && !['ltr', 'rtl'].includes(String(config.dir))) {
    add(errors, 'dir', `must be "ltr" or "rtl" (received ${describe(config.dir)})`)
  }
  if (config.lang === '') {
    add(errors, 'lang', 'must not be empty — use `dir: "rtl"` for right-to-left scripts')
  }
  for (const [i, item] of (config.nav || []).entries()) {
    if (typeof item === 'string') continue
    if (!item || typeof item.url !== 'string') {
      add(errors, `nav[${i}]`, 'each nav entry needs a `url` (and usually a `label`)')
    } else if (!/^(?:\/|#|https?:|mailto:)/.test(item.url)) {
      add(warnings, `nav[${i}].url`, `nav targets should be root-relative ("/about") or absolute, received "${item.url}"`)
    }
  }
  for (const [i, section] of (config.sections || []).entries()) {
    if (!section || typeof section !== 'object' || !(section.component || section.type)) {
      add(errors, `sections[${i}]`, 'each section needs a `component`, e.g. { component: "Contact" }')
    }
  }
  for (const [i, plugin] of (config.plugins || []).entries()) {
    if (typeof plugin !== 'string' || !plugin.trim()) {
      add(errors, `plugins[${i}]`, 'plugins are paths or package names, e.g. "./plugins/analytics.js"')
    }
  }

  return { errors, warnings, ok: errors.length === 0 }
}

// Find the 1-based line a `key: value` pair starts on, so the message can
// point the author at the exact line. Nested paths (`hero.links[0].url`) fall
// back to the last segment.
function findLine(lines, path) {
  if (!lines.length) return 0
  const key = String(path).split('.').pop().replace(/\[\d+\]/g, '')
  const re = new RegExp(`^\\s*["']?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*:`, 'm')
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1
  }
  return 0
}

// Levenshtein ≤ 2 — the same "did you mean" rule the server uses.
function suggestConfigKey(key) {
  const target = String(key).toLowerCase()
  let best
  let bestScore = Infinity
  for (const candidate of CONFIG_KEYS) {
    const score = distance(target, candidate.toLowerCase())
    if (score < bestScore) { bestScore = score; best = candidate }
  }
  return bestScore <= 2 ? best : undefined
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

/** Render a validation result for the terminal. */
export function formatConfigIssues(result) {
  const lines = []
  for (const issue of [...result.errors, ...result.warnings]) {
    const where = issue.line ? `${issue.file}:${issue.line}` : issue.file
    lines.push(`  ${issue.level === 'error' ? '✗' : '⚠'} ${issue.path} — ${issue.message.replace(/\n/g, ' ')}`)
    lines.push(`    ${where}`)
  }
  return lines.join('\n')
}
