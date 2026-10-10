// Scaffolding: `jprot init`, `jprot new`, `jprot g component` and the editor
// snippet bundles. Everything here is zero-dependency and writes plain files.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { editDistance, slugify } from '../../lib/utils.js'
import { CONFIG_KEYS } from '../content/schema.js'
import {
  aboutTemplate, componentPalette, configTemplate, indexTemplate, mdPalette,
  pageTemplate, postTemplate, projectTemplate, resumeTemplate,
} from './templates.js'

// Suggest the nearest known config key for a typo.
//
// CONFIG_KEYS is the single source of truth: core/schema.js validates against
// the same list, so the hint checker can never suggest a key `jprot check`
// would reject (or miss one it accepts). `sections` is a scaffold-only key.
const HINT_KEYS = CONFIG_KEYS.includes('sections') ? CONFIG_KEYS : [...CONFIG_KEYS, 'sections']

export function suggestConfigKey(key) {
  if (HINT_KEYS.includes(key)) return null
  let best = null
  let bestDist = Infinity
  for (const k of HINT_KEYS) {
    const d = editDistance(key.toLowerCase(), k.toLowerCase())
    if (d < bestDist) { bestDist = d; best = k }
  }
  return bestDist <= 2 ? best : null
}


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
    ['package.json', '{\n  "private": true,\n  "type": "module",\n  "scripts": {\n    "start": "jprot"\n  }\n}\n'],
    ['jprot.config.js', configTemplate({ type })],
    ['content/index.md', indexTemplate({ type })],
    ['content/about.md', aboutTemplate],
    ['content/resume.md', resumeTemplate],
    ['content/blog.md', '---\ntitle: Blog\ndescription: Writing about development, design and the tools I use daily.\nlayout: blog\n---\n\nWriting about development, design and the tools I use daily.\n'],
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
    throw new Error(`jprot new: unknown kind "${kind}" (use post | page | project | resume)`)
  }
  if (kindKey === 'resume') {
    const file = join(contentDir, 'resume.md')
    await mkdir(dirname(file), { recursive: true })
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


export async function scaffoldComponent({ root, palette, name, format = 'js' }) {
  const projectRoot = root || process.cwd()
  const tpl = (format === 'md' ? mdPalette : componentPalette)[palette]
    || (format === 'md' ? mdPalette : componentPalette).section
  const file = join(projectRoot, 'theme', 'components', name + (format === 'md' ? '.md' : '.js'))
  if (await existsFile(file)) throw new Error(`jprot g component: ${file} already exists`)
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
        'export default function ${1:ComponentName}({ title = ${2:""}, ${3:/* props */} }) {',
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
  const jsonBody = JSON.stringify({ ...snippets }, null, 2)
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

