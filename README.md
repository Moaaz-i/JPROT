# JPROT — Portfolio Site Generator Without a Build Step

**Zero dependencies. Zero build step. Full control.**

JPROT serves Markdown directly as a portfolio site with SSR, SPA navigation, dark mode, 4 built-in themes, animations, contact forms, SEO/JSON-LD, PWA support, TypeScript types, and a theme cycle button — all in ~30KB with zero `npm install`.

Project repository: [github.com/Moaaz-i/JPROT](https://github.com/Moaaz-i/JPROT).
JPROT requires Node.js 18 or newer.

The project documentation is published at
[Moaaz-i.github.io/JPROT](https://moaaz-i.github.io/JPROT/).

---

## Quick Start

```bash
npx jprot
# → http://127.0.0.1:4114
```

Or globally:

```bash
npm install -g jprot
jprot 8080
```

### CLI Options

| Command | Description |
|---------|-------------|
| `jprot` | Start dev server (default port 4114) |
| `jprot 8080` | Start on a specific port |
| `jprot init` | Scaffold a new site (`--portfolio`, `--docs`, `--resume`) |
| `jprot new <kind> "Title"` | Add `post` / `page` / `project` / `resume` (`--draft`, `--template <name>`) |
| `jprot g component <Name>` | Scaffold a theme component (`--palette section\|cards\|cta\|stats`) |
| `jprot g list` | List component palettes |
| `jprot lint` | Check content: broken links, missing metadata, oversized images |
| `jprot export [--out dist]` | Export the whole site to static HTML in `dist/` |
| `jprot --prod` | Serve with production caching; drafts return 404 |
| `jprot --no-watch` | Disable file watcher |
| `jprot --help` / `--version` | Show help / version |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4114 | Port to listen on |
| `HOST` | 127.0.0.1 | Host to bind |
| `NO_WATCH` | — | Set `1` to disable watcher |

---

## Full Documentation

This repository *is* a live documentation site. Read the pages below in your
browser (`npm start` → open the links) or directly on GitHub:

| Page | What it covers |
|------|----------------|
| [Getting Started](content/getting-started.md) | Run locally, scaffold, your first page |
| [Content](content/content.md) | Markdown, frontmatter, projects, shortcodes |
| [Configuration](content/configuration.md) | Every `jprot.config.js` / JSON option |
| [Customization](content/customization.md) | CSS variables, components, themes, blog, SEO |
| [Examples](content/examples.md) | Copy-paste themes, components and config |
| [Architecture](content/architecture.md) | How the code is organized |
| [Troubleshooting](content/troubleshooting.md) | Fixes for common issues |
| [FAQ](content/faq.md) | Commonly asked questions |
| [Changelog](CHANGELOG.md) | Release notes |

---

## Features

- **4 built-in themes** (default, minimal, creative, corporate) cycled with the ◈ button — state persists in `localStorage`.
- **Dark / light mode** (◐) with system-preference default.
- **Responsive, mobile-first** design with an automatic hamburger menu ≤ 640px and `prefers-reduced-motion` support.
- **Animations** — hero fade-in-up, scroll animations (`data-animate`, `data-stagger`).
- **Contact forms** via Formspree (`formspree` / `email` config).
- **SEO & structured data** — canonical, OG, Twitter, JSON-LD (Organization / Article / BlogPosting / Person + Breadcrumbs), file-backed SVG OG:image, hreflang, robots, `sitemap.xml` (git-aware `lastmod`), `feed.xml`, `llms.txt` + `llms-full.txt`, search index, PWA `manifest.json`.
- **Drafts** — hidden from nav, sitemap, search, RSS and exports; `404` in production.
- **Theme-aware 404** page.
- **Instant search** (`Cmd/Ctrl + K`) backed by a live-generated index over the full body text, code blocks, frontmatter and site config, with highlighted matches.
- **Printable resume** via `layout: resume`.
- **Deep type support** — `jprot.d.ts` for the programmatic API and config autocomplete.

## Configuration (`jprot.config.js`)

```js
export default {
  title: 'Your Name',
  tagline: 'Full Stack Developer',
  description: 'A short SEO description',
  url: 'https://yoursite.com',
  lang: 'en',
  dir: 'ltr',
  author: 'Your Name',
  email: 'you@example.com',
  themeColor: '#4f46e5',       // PWA + favicon color
  formspree: 'https://formspree.io/f/xxx',
  homeLayout: 'Home',
  defaultLayout: 'Page',
  sidebar: false,
  showNav: true,
  themePicker: true,           // show variant cycle button
  blogDir: 'blog',             // default: 'blog'
  projectsDir: 'projects',     // default: 'projects'

  hero: {
    title: 'Hello, I\'m Jane',
    subtitle: 'Full Stack Developer & Designer',
    avatar: '/img/avatar.jpg',
    links: [
      { label: 'GitHub', url: 'https://github.com/you' },
      { label: 'Contact', url: '/contact' },
    ],
  },

  labels: { /* every built-in UI string is overridable (i18n) — full list on the Configuration page */ },

  head: `<!-- extra <head> content -->`,
  nav: [
    { label: 'About', url: '/about' },
    { label: 'Blog', url: '/blog' },
  ],

  sections: [
    { component: 'Contact', title: 'Get in touch' },
  ],

  markdown: {
    tables: true,
    highlight: true,
  },
}
```

Or use JSON: `jprot.config.json`. Every option — including the SEO keys
(`searchUrl`, `twitter`, `ogLocale`, `sameAs`, `alternateLangs`, `logo`,
`ogImage`, `ogColor`, `ogTextColor`) and the complete `labels` table — is
documented on the [Configuration](content/configuration.md) page.

## Content

All content lives in `content/` as Markdown. Add, edit or remove a file and the site updates instantly — no build:

```
content/
  index.md              ← homepage
  about.md              ← standalone page
  projects/
    project-name.md     ← project card on homepage
  blog/
    my-post.md          ← blog post
```

Frontmatter controls layout, tags, ordering, drafts, per-page SEO and more.
See the [Content](content/content.md) page for the full option list.

## Radically Customize

Four levels, each independent — the complete guide is on [Customization](content/customization.md):

1. **CSS variables (easiest)** — redefine any variable in `theme/custom.css` (colors, fonts, radius, container width, dark palette).
2. **Replace components** — drop a file into `theme/components/` to override `Layout`, `Header`, `Footer`, `Home`, `Page` or any section component. Components are plain functions that receive `props` and return an HTML string.
3. **Shortcodes** — call any registered component inline in Markdown with a `:::Name` block; the inner Markdown is rendered and passed as `children`.
4. **Ready-made themes** — copy `examples/themes/*.css` into `theme/custom.css`.

Scaffold a self-contained component in seconds:

```bash
jprot g component Hobbies --palette cards   # works as a section AND a :::Hobbies shortcode
```

Theme variants can be configured with `themes` in `jprot.config.js`; each
variant object provides an `id`, optional label, and optional swatch. Components
receive the current `site`, `page`, navigation, projects, posts, and rendered
shortcode `children` through typed props. Malformed frontmatter is reported in
the server log with a line number instead of silently disappearing.

## Programmatic API

```ts
import { createJprot, renderPage, exportSite, runLint, scaffoldSite } from 'jprot'

const app = await createJprot({ root: '/path/to/project', port: 3000, watch: true })
await app.listen(3000)

// One-shot static export (same as `jprot export`)
await exportSite({ root: '/path/to/project', outDir: '/tmp/dist' })

// Content checks (same as `jprot lint`)
const issues = await runLint({ root: '/path/to/project' })

// Scaffold a site programmatically
await scaffoldSite({ root: '/tmp/new-site', type: 'portfolio' })
```

Runtime types for `createJprot`, `renderPage`, `exportSite`, `runLint`,
`scaffoldSite`, `scaffoldNew`, `scaffoldComponent`, `componentPaletteList`,
`renderUserTemplate`, `suggestConfigKey`, `writeSnippets`, plus every config and
component prop, live in `jprot.d.ts`. `jprot.config.js` files get autocomplete
with `/** @type {import('jprot').JprotConfig} */`.

## Project Layout

```
core/cli.js           CLI entry (server + init/new/g/export/lint)
core/server.js        Server + rendering + shortcodes + JSON-LD + OG + PWA
core/scaffold.js      jprot init/new/g scaffolds + snippets + config hints
core/export.js        Static export to dist/
core/lint.js          Content linting
lib/markdown.js       Markdown → HTML (no dependencies)
lib/frontmatter.js    YAML frontmatter parser
theme/default/        Built-in theme (components + styles)
theme/custom.css      Your CSS overrides
theme/components/     Your component overrides
content/              Your Markdown content
public/               Static assets (images, fonts, files)
examples/             Theme packs and component examples
test/                 Node's built-in test runner (npm test)
jprot.d.ts            TypeScript definitions
CHANGELOG.md          Release notes
```

---

## License

MIT — see [LICENSE](LICENSE).

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull request
guidance. Please report vulnerabilities privately according to
[SECURITY.md](SECURITY.md), not in a public issue.