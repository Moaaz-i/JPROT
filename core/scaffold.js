// Scaffolding: `jprot init`, `jprot new`, `jprot g component` and the editor
// snippet bundles. Everything here is zero-dependency and writes plain files.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { slugify } from './utils.js'

const CONFIG_KEYS = [
  'title', 'tagline', 'description', 'url', 'lang', 'dir', 'author', 'avatar',
  'email', 'themeColor', 'ogImage', 'ogColor', 'ogTextColor', 'logo', 'searchUrl',
  'twitter', 'ogLocale', 'sameAs', 'alternateLangs', 'icon', 'head', 'footerText',
  'blogDir', 'projectsDir', 'defaultLayout', 'homeLayout', 'sidebar', 'showNav',
  'themePicker', 'projectsTitle', 'formspree', 'social', 'nav', 'hero', 'sections',
  'themes', 'labels', 'markdown',
]

function escSnippet(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\<')
}

// levenshtein ≤ 2 → warn "did you mean …"
function editDistance(a, b) {
  if (!a.length) return b.length
  if (!b.length) return a.length
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) m[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = a[i - 1] === b[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j], m[i][j - 1], m[i - 1][j - 1]) + 1
    }
  }
  return m[a.length][b.length]
}

// Suggest the nearest known config key for a typo.
export function suggestConfigKey(key) {
  if (CONFIG_KEYS.includes(key)) return null
  let best = null
  let bestDist = Infinity
  for (const k of CONFIG_KEYS) {
    const d = editDistance(key.toLowerCase(), k.toLowerCase())
    if (d < bestDist) { bestDist = d; best = k }
  }
  return bestDist <= 2 ? best : null
}

/* ============================================================
   Template strings
   ============================================================ */

const configTemplate = ({ type }) => `// jprot config — see https://github.com/Moaaz-i/JPROT for the schema
/** @type {import('jprot').JprotConfig} */
export default {
  title: 'Your Name',
  tagline: 'Designer & developer crafting the web since 20##.',
  description: 'a short line used in SEO and Open Graph',
  // Replace this with your public site URL before deploying.
  url: 'https://yoursite.com',
  lang: 'en',
  email: 'you@example.com',
  themeColor: '#4f46e5',
  // Add only social profiles you own; these are intentionally left configurable.
  social: [
${type === 'docs'
    ? "  // { label: 'GitHub', url: 'https://github.com/your-account/your-repository' }"
    : "  // { name: 'GitHub', label: 'GitHub', url: 'https://github.com/your-account/your-repository' }"},
  ],
  hero: {
    title: 'Hello, I build for the web.',
    subtitle: '${type === 'docs' ? 'Documentation for the things I make and use.' : type === 'resume' ? 'Experienced builder open to new opportunities.' : 'Developer, designer, problem-solver.'}',
    links: [
${type === 'resume'
    ? "      { label: 'Resume', url: '/resume' }"
    : "      { label: 'Projects', url: '/projects' },\n      { label: 'Blog', url: '/blog' }"},
    ],
  },
  // sections // TODO: uncomment to compose your homepage
  // sections: [
  //   { component: 'Projects', title: 'Selected work' },
  //   { component: 'Blog', title: 'Latest posts' },
  //   { component: 'Contact', title: 'Get in touch' },
  // ],
}
`

const indexTemplate = ({ type }) => `---
title: Home
description: Welcome.
---

${type === 'docs'
  ? '# Welcome to the docs\n\nStart with [[getting-started]] continued…\n\n- [Getting Started](/getting-started)\n- [Reference](/reference)\n- [FAQ](/faq)'
  : type === 'resume'
    ? '# Hello, I build for the web.\n\nFocused, dependable, remote-friendly. See my [full resume](/resume).'
    : '# Hello, I build for the web.\n\nPortfolio of selected work, writing and experiments — all built with JPROT.'}
`

const aboutTemplate = `---
title: About
description: About your name.
---

Write a few paragraphs about yourself: background, tools, values and how to
work with you. Use # headings, **bold**, images and \`code\` freely.
`

const pageTemplate = ({ title, slug, date, draft }) => `---
title: ${title}
description: One line about this page.
date: ${date}
${draft ? 'draft: true\n' : ''}---

Write the body here. jprot supports **bold**, *italic*, [links](https://example.com),
\`inline code\`, fenced code blocks, tables, blockquotes and headings.
`

const postTemplate = ({ title, slug, date, draft }) => `---
title: ${title}
date: ${date}
tags: []
excerpt: One sentence for search, feeds and cards.
${draft ? 'draft: true\n' : ''}---

# ${title}

Start writing…
`

const projectTemplate = ({ title, slug, date, draft }) => `---
title: ${title}
description: What it does, in one line.
date: ${date}
# Replace the URLs below with your own links, or remove either field.
demo: https://example.com
repo: https://github.com/your-account/${slug}
tags: []
${draft ? 'draft: true\n' : ''}---

## Problem

## Solution

## Result
`

const resumeTemplate = `---
title: Your Name
layout: resume
description: Professional summary.
email: you@example.com
---

## Experience

### Your Role — Company
20## — present
- Achievement one

## Education

### Degree — School
- Focus area

## Skills

- •
`

/* ============================================================
   `jprot init`
   ============================================================ */

export async function scaffoldSite({ root, type = 'portfolio' } = {}) {
  const projectRoot = root || process.cwd()
  const contentDir = join(projectRoot, 'content')
  const blogDir = join(contentDir, 'blog')
  const projectsDir = join(contentDir, 'projects')
  const themeDir = join(projectRoot, 'theme')

  const files = [
    ['package.json', '{\n  "private": true,\n  "type": "module"\n}\n'],
    ['jprot.config.js', configTemplate({ type })],
    ['content/index.md', indexTemplate({ type })],
    ['content/about.md', aboutTemplate],
    ['content/resume.md', resumeTemplate],
    ['content/blog.md', '---\ntitle: Blog\n---\n\nWriting about development, design and the tools I use daily.\n'],
    ['content/blog/hello-world.md', postTemplate({ title: 'Hello World', slug: 'hello-world', date: today(), draft: true })],
    ['content/projects/example.md', projectTemplate({ title: 'Example Project', slug: 'example', date: today() })],
    ['theme/custom.css', '/* Custom overrides — loaded after the default theme */\n'],
  ]

  for (const [rel, body] of files) {
    const full = join(projectRoot, rel)
    try { await stat(full); continue } catch { /* not present → write */ }
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, body, 'utf8')
  }

  await writeSnippets(projectRoot)
  return projectRoot
}

/* ============================================================
   `jprot new`
   ============================================================ */

export async function scaffoldNew({ root, kind, title, draft = false, template } = {}) {
  const projectRoot = root || process.cwd()
  const contentDir = join(projectRoot, 'content')

  let config = {}
  try { config = await readConfig(projectRoot) } catch { /* defaults */ }
  const blogDir = config.blogDir || 'blog'
  const projectsDir = config.projectsDir || 'projects'

  const kinds = { post: 'post', blog: 'post', page: 'page', project: 'project', resume: 'resume' }
  const kindKey = kinds[kind?.toLowerCase()]
  if (!kindKey) {
    throw new Error(`jprot new: unknown kind "${kind}" (use post | page | project)`)
  }
  if (kindKey === 'resume') {
    const file = join(contentDir, 'resume.md')
    if (await existsFile(file)) throw new Error(`jprot new: ${file} already exists`)
    await writeFile(file, resumeTemplate, 'utf8')
    return file
  }

  const name = title || kind
  const slug = slugify(name)

  // built-in templates, overridable by a file in <root>/templates
  const builtins = {
    post: ({ title }) => postTemplate({ title, slug, date: today(), draft }),
    page: ({ title }) => pageTemplate({ title, slug, date: today(), draft }),
    project: ({ title }) => projectTemplate({ title, slug, date: today(), draft }),
  }
  let body
  if (template) {
    body = await renderUserTemplate({ projectRoot, template, vars: { title, slug, date: today() } })
    if (draft && !body.includes('draft:')) body = body.replace(/^---\n/, '---\ndraft: true\n')
  } else {
    body = builtins[kindKey]({ title: name })
  }

  const rel = kindKey === 'project'
    ? join(projectsDir, slug + '.md')
    : kindKey === 'post'
      ? join(blogDir, slug + '.md')
      : join(slug + '.md')
  const file = join(contentDir, rel)
  if (await existsFile(file)) throw new Error(`jprot new: ${file} already exists`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, body, 'utf8')
  return file
}

// Renders author-provided `templates/<name>.md` with {{title}}, {{slug}},
// {{date}} substitution — used by `jprot new --template`.
export async function renderUserTemplate({ projectRoot, template, vars }) {
  const file = join(projectRoot, 'templates', template.endsWith('.md') ? template : template + '.md')
  try {
    const raw = await readFile(file, 'utf8')
    return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m))
  } catch {
    throw new Error(`jprot new: template "${template}" not found in templates/ (saw ${basename(file)})`)
  }
}

async function existsFile(p) {
  try { await stat(p); return true } catch { return false }
}

async function readConfig(root) {
  const file = join(root, 'jprot.config.js')
  // parse only the leaf keys we need via a safe regex (config is a plain object literal)
  const raw = await readFile(file, 'utf8')
  const blogDir = raw.match(/blogDir:\s*['"]([^'"]+)['"]/)
  const projectsDir = raw.match(/projectsDir:\s*['"]([^'"]+)['"]/)
  return {
    blogDir: blogDir ? blogDir[1] : undefined,
    projectsDir: projectsDir ? projectsDir[1] : undefined,
  }
}

/* ============================================================
   `jprot g component` + snippets
   ============================================================ */

const componentPalette = {
  section: {
    desc: 'Title, subtitle and a block for children (good for ::section shortcodes)',
    body: (name) => `const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function ${name}({ title = '', subtitle = '', children = '', items = [] }) {
  return \`
    <section class="${slugify(name)}-section">
      \${title ? \`<h2 class="section-title">\${esc(title)}</h2>\` : ''}
      \${subtitle ? \`<p class="section-subtitle">\${esc(subtitle)}</p>\` : ''}
      \${children}
    </section>
  \`
}
`,
  },
  cards: {
    desc: 'Renders a grid of cards from { items } or { projects }',
    body: (name) => `const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function ${name}({ title = '', items = [], projects = [] }) {
  const list = (items.length ? items : projects).filter(Boolean)
  const cards = list.map((it) => {
    const t = typeof it === 'object' ? it.title : it
    const d = typeof it === 'object' ? it.description || it.excerpt || '' : ''
    const u = typeof it === 'object' ? it.url : ''
    return \`
      <div class="${slugify(name)}-card">
        \${u ? \`<a href="\${esc(u)}">\` : ''}\${esc(t)}\${u ? '</a>' : ''}
        \${d ? \`<p>\${esc(d)}</p>\` : ''}
      </div>\`
  }).join('')

  return \`
    <section class="${slugify(name)}-grid">
      \${title ? \`<h2 class="section-title">\${esc(title)}</h2>\` : ''}
      <div class="${slugify(name)}-cards">\${cards}</div>
    </section>
  \`
}
`,
  },
  cta: {
    desc: 'A call-to-action banner with a button',
    body: (name) => `const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function ${name}({ title = '', text = '', label = 'Learn more', url = '/' }) {
  return \`
    <div class="${slugify(name)}-banner">
      \${title ? \`<h3 class="${slugify(name)}-title">\${esc(title)}</h3>\` : ''}
      \${text ? \`<p>\${esc(text)}</p>\` : ''}
      <a class="btn" href="\${esc(url)}">\${esc(label)}</a>
    </div>
  \`
}
`,
  },
  stats: {
    desc: 'Numeric strip, one row per { value, label } in { items }',
    body: (name) => `const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function ${name}({ items = [] }) {
  const cells = items.map((it) => {
    const value = typeof it === 'object' ? it.value : it
    const label = typeof it === 'object' ? it.label : ''
    return \`
      <div class="${slugify(name)}-item">
        <span class="${slugify(name)}-value">\${esc(value)}</span>
        \${label ? \`<span class="${slugify(name)}-label">\${esc(label)}</span>\` : ''}
      </div>\`
  }).join('')
  if (!cells) return ''
  return \`<section class="${slugify(name)}-strip">\${cells}</section>\`
}
`,
  },
}

export async function scaffoldComponent({ root, palette, name }) {
  const projectRoot = root || process.cwd()
  const tpl = componentPalette[palette] || componentPalette.section
  const file = join(projectRoot, 'theme', 'components', name + '.js')
  try { await stat(file) } catch { /* ok to write */ }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, tpl.body(name), 'utf8')
  return file
}

export function componentPaletteList() {
  return Object.entries(componentPalette).map(([id, t]) => ({ id, ...t }))
}

/* ============================================================
   Editor snippet bundles (.vscode + UltiSnips)
   ============================================================ */

export async function writeSnippets(projectRoot) {
  const vsc = join(projectRoot, '.vscode', 'jprot.code-snippets')
  await mkdir(dirname(vsc), { recursive: true })
  const snippets = {
    'jprot: frontmatter': {
      prefix: 'jf',
      body: ['---', 'title: ${1:Page title}', 'description: ${2:one-line SEO description}', '---'],
      description: 'JPROT page frontmatter',
    },
    'jprot: post': {
      prefix: 'jp',
      body: ['---', 'title: ${1:Post title}', 'date: ${CURRENT_YEAR}-${CURRENT_MONTH}-${CURRENT_DATE}', 'tags: []', 'excerpt: ${2:one sentence for feeds}', '---'],
      description: 'JPROT blog post',
    },
    'jprot: section config': {
      prefix: 'js',
      body: ["{ component: '${1:ComponentName}', title: '${2:Section title}' },",],
      description: 'JPROT homepage section entry',
    },
    'jprot: component': {
      prefix: 'jc',
      body: [
        'export default async function ${1:ComponentName}({ title = ${2:""}, ${3:/* props */} }) {',
        '  return `',
        '    <section class="${4:section}">',
        '      ${5:<!-- markup -->}',
        '    </section>',
        '  `',
        '}',
      ],
      description: 'JPROT component skeleton',
    },
  }
  // escape snippet $ as \$ for the JSON body string
  const jsonBody = JSON.stringify({ ...snippets }, null, 2).replace(/\$\{/g, '\\${')
  await writeFile(vsc, jsonBody + '\n', 'utf8')

  const ulti = join(projectRoot, 'snippets', 'jprot.snippets')
  await mkdir(dirname(ulti), { recursive: true })
  const lines = []
  for (const [label, s] of Object.entries(snippets)) {
    lines.push(`snippet ${s.prefix} "${label}"`, s.body.join('\n'), 'endsnippet', '')
  }
  await writeFile(ulti, lines.join('\n'), 'utf8')
  return [vsc, ulti]
}

function today() {
  return new Date().toISOString().slice(0, 10)
}