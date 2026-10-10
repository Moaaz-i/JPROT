// Everything `jprot init` and `jprot g component` *write*, as data.
//
// Keeping the strings out of the scaffolding logic is the point: a template
// can be read — and edited — without reading control flow around it, and the
// functions that place them can be read without scrolling past 300 lines of
// embedded JavaScript. The one thing it takes from elsewhere is `slugify`,
// which turns a component name into its CSS class.
import { slugify } from '../../lib/utils.js'

/* ============================================================
   Template strings
   ============================================================ */

export const configTemplate = ({
  type,
}) => `// jprot config — see https://github.com/Moaaz-i/JPROT for the schema
/** @type {import('jprot').JprotConfig} */
export default {
  title: 'Your Name',
  tagline: 'Designer & developer crafting the web since 20##.',
  description: 'a short line used in SEO and Open Graph',
  // Replace this with your public site URL before deploying.
  url: 'https://yoursite.com',
  basePath: '${type === "docs" ? "/your-repository" : ""}',
  docs: ${type === "docs"},
  lang: 'en',
  email: 'you@example.com',
  sidebar: ${type === "docs"},
  themeColor: '#4f46e5',
  // Catalog used by jprot search / jprot add. Point it at your own mirror
  // or leave it as the JPROT Catalog.
  catalogUrl: 'https://moaaz-i.github.io/jprot-catalog',
  // Add only social profiles you own; these are intentionally left configurable.
  social: [
${
  type === "docs"
    ? "  // { label: 'GitHub', url: 'https://github.com/your-account/your-repository' }"
    : "  // { label: 'GitHub', url: 'https://github.com/your-account/your-repository' }"
},
  ],
  hero: {
    title: 'Hello, I build for the web.',
    subtitle: '${type === "docs" ? "Documentation for the things I make and use." : type === "resume" ? "Experienced builder open to new opportunities." : "Developer, designer, problem-solver."}',
${
  type === "portfolio"
    ? "    badge: 'Available for new projects',\n    // avatar: '/images/me.jpg',"
    : "    // badge: 'Available for new projects',\n    // avatar: '/images/me.jpg',"
},
    links: [
${
  type === "resume"
    ? "      { label: 'Resume', url: '/resume' }"
    : "      { label: 'Projects', url: '/projects' },\n      { label: 'Blog', url: '/blog' }"
},
    ],
  },
  // sections // TODO: uncomment to compose your homepage
  // sections: [
  //   { component: 'Projects', title: 'Selected work' },
  //   { component: 'Blog', title: 'Latest posts' },
  //   { component: 'Contact', title: 'Get in touch' },
  // ],
}
`;

export const indexTemplate = ({ type }) => `---
title: Home
description: Welcome.
---

${type === 'docs'
  ? '# Welcome to the docs\n\nStart with getting-started continued…\n\n- [Getting Started](/getting-started)\n- [Reference](/reference)\n- [FAQ](/faq)'
  : type === 'resume'
    ? '# Hello, I build for the web.\n\nFocused, dependable, remote-friendly. See my [full resume](/resume).'
    : 'Selected work, writing and experiments — all built with JPROT.\n\nEverything below is driven by `content/` and `jprot.config.js`: feature your projects in the “Projects” section above, post to the [Blog](/blog), and compose a richer homepage with `sections`.'}
`

export const aboutTemplate = `---
title: About
description: About your name.
---

Write a few paragraphs about yourself: background, tools, values and how to
work with you. Use # headings, **bold**, images and \`code\` freely.
`

export const pageTemplate = ({ title, slug, date, draft }) => `---
title: ${title}
description: One line about this page.
date: ${date}
${draft ? 'draft: true\n' : ''}---

Write the body here. jprot supports **bold**, *italic*, [links](https://example.com),
\`inline code\`, fenced code blocks, tables, blockquotes and headings.
`

export const postTemplate = ({ title, slug, date, draft }) => `---
title: ${title}
date: ${date}
tags: []
excerpt: One sentence for search, feeds and cards.
${draft ? 'draft: true\n' : ''}---

# ${title}

Start writing…
`

export const projectTemplate = ({ title, slug, date, draft }) => `---
title: ${title}
description: What it does, in one line.
date: ${date}
# The card cover image on the homepage (optional, can be a local or remote URL).
# cover: /images/example.png
# Replace the URLs below with your own links, or remove either field.
demo: https://example.com
repo: https://github.com/your-account/${slug}
tags: []
${draft ? 'draft: true\n' : ''}---

## Problem

## Solution

## Result
`

export const resumeTemplate = `---
title: Resume
layout: resume
description: Professional summary.
name: Your Name
role: Designer & developer
email: you@example.com
location: Your City, Country
social:
  - label: GitHub
    url: https://github.com/your-account
experience:
  - title: Your Role
    company: Company
    period: 20## — present
    description: What you delivered and the impact you had.
education:
  - title: Degree
    school: School
    period: 20## — 20##
    description: Focus area.
skills:
  - title: Skill
    description: Level or tools.
---

Write a short summary about yourself — it appears below the header.
`

export const componentPalette = {
  section: {
    desc: 'Title, subtitle and a block for children (good for ::section shortcodes)',
    body: (name) => `const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default function ${name}({ title = '', subtitle = '', children = '', items = [] }) {
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

export default function ${name}({ title = '', items = [], projects = [] }) {
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

export default function ${name}({ title = '', text = '', label = 'Learn more', url = '/' }) {
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

export default function ${name}({ items = [] }) {
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

// Markdown palettes: a `.md` component is frontmatter defaults + a body with
// `[value]` placeholders — no JavaScript, rendered through the Markdown engine.
export const mdPalette = {
  section: {
    desc: 'Markdown: title, subtitle and a list — no JS',
    body: (name) => `---
title: Section title
subtitle: A short descriptor.
items: []
---

## [title]

[subtitle]

[items]
`,
  },
  cards: {
    desc: 'Markdown: title, one-line description and a list',
    body: (name) => `---
title: Cards
description: One line about these.
items: []
---

## [title]

[description]

[items]
`,
  },
  cta: {
    desc: 'Markdown: heading, text and a url',
    body: (name) => `---
title: Join the beta
text: Shipping in February.
url: /beta
---

## [title]

[text]

[url]
`,
  },
  stats: {
    desc: 'Markdown: a list of numbers, one per line',
    body: (name) => `---
items: []
---

> [items]
`,
  },
}
