# JPROT

**A portfolio site generator without a build step.**

JPROT serves Markdown directly with SSR and SPA navigation — zero dependencies,
zero build, full control. It includes dark mode, four built-in themes, contact
forms, SEO/JSON-LD, PWA support, accessible SPA navigation (skip link, focus
management, live page announcements), TypeScript types, and a component system,
all running on Node.js 18+.

- Project: <https://github.com/Moaaz-i/JPROT>
- Live docs: <https://moaaz-i.github.io/JPROT/>

## Install

```bash
npm install -g jprot
```

Or run without installing:

```bash
npx jprot
```

## Quick start

```bash
npm create jprot@latest my-site   # scaffold + install, portfolio by default
cd my-site
npm start                         # → http://127.0.0.1:4114
```

Already have JPROT installed? `jprot init --portfolio` (or `--docs` / `--resume`)
scaffolds into the current folder.

Add a page by dropping a `.md` file into `content/`; save a file and refresh
the browser — there is no build step.

## CLI

| Command | Description |
|---------|-------------|
| `jprot` | Start dev server (default port 4114) |
| `jprot 8080` | Start on a specific port |
| `jprot init` | Scaffold a site (`--portfolio`, `--docs`, `--resume`) |
| `jprot new <kind> "Title"` | Add `post` / `page` / `project` / `resume` (`--draft`, `--template <name>`) |
| `jprot g component <Name>` | Scaffold a component (`--palette section\|cards\|cta\|stats`, `--format js\|md`) |
| `jprot g list` | List component palettes |
| `jprot search [query]` | List catalog elements, optionally filtered |
| `jprot add <Name>` | Install a catalog element into `theme/components/` |
| `jprot check` | Validate `jprot.config.js` and every plugin against the schema |
| `jprot lint` | Site-aware content checks: broken links, missing metadata, duplicate anchors |
| `jprot export [--out dist] [--clean]` | Export the whole site to static HTML (incremental; `--clean` forces a full rebuild) |
| `jprot --prod` | Production caching; drafts return 404 |
| `jprot --no-watch` | Disable the file watcher |
| `jprot --help` / `--version` | Show help / version |

Environment variables: `PORT` (default 4114), `HOST` (default 127.0.0.1),
`NO_WATCH=1`.

## Content

All content is Markdown with an optional YAML frontmatter block:

```markdown
---
title: My page
description: One line for SEO
---

# Hello

Write **Markdown** here.
```

Pages live in `content/` and map directly to URLs. Project and blog posts also
follow the folder conventions (`projectsDir`, `blogDir`).

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
  basePath: '',            // '/repo' for a GitHub Pages project site
  themeColor: '#4f46e5',
  hero: {
    title: "Hello, I'm Jane",
    subtitle: 'Full Stack Developer & Designer',
    links: [
      { label: 'GitHub', url: 'https://github.com/you' },
      { label: 'Contact', url: '/contact' },
    ],
  },
  sections: [
    { component: 'Contact', title: 'Get in touch' },
  ],
  nav: [
    { label: 'About', url: '/about' },
    { label: 'Blog', url: '/blog' },
  ],
}
```

JSON is supported too (`jprot.config.json`). Every option and the full `labels`
table are documented on the [Configuration](content/configuration.md) page.

## Customization

Five levels, each independent:

1. **CSS variables** — redefine any variable in `theme/custom.css`.
2. **Component overrides** — drop a file into `theme/components/` to replace
   `Layout`, `Header`, `Footer`, `Home`, `Page`, or any section.
3. **Markdown components** — write a component as a `.md` file: frontmatter
   defaults + `[value]` placeholders, no JavaScript.
4. **Ready-made themes** — copy `examples/themes/*.css` into `theme/custom.css`.
5. **Plugins** — one file that adds components, routes, Markdown rules, or
   hooks (see below).

Scaffold a component:

```bash
jprot g component Hobbies --palette cards   # JS component
jprot g component Hobbies --format md       # Markdown component
```

## Plugins

For behaviour that spans components — several pages, the `<head>`, or a brand
new endpoint — a plugin is one file exporting a `setup(jprot)` function:

```js
// plugins/analytics.js
export default {
  name: 'analytics',
  setup({ on }) {
    on('html:head', (html) =>
      html.replace('</head>', `  <script defer src="/_a.js"></script>\n</head>`))
  },
}
```

```js
// jprot.config.js
export default { plugins: ['./plugins/analytics.js'] }
```

`setup` receives `addComponent`, `addRoute`, `extendMarkdown`, `on`, and the
config — and nothing else, so the surface stays small enough to promise across
major versions. A plugin that throws is reported and skipped without taking the
site down, and a plugin is never left half-installed. `jprot check` runs every
plugin's `setup()` so CI catches a broken one. See
[Plugins](content/customization.md#13-plugins).

## Programmatic API

```ts
import { createJprot, exportSite, runLint, runCheck, checkConfig, scaffoldSite } from 'jprot'

const app = await createJprot({ root: '/path/to/project', port: 3000, watch: true })
await app.listen(3000)

// Incremental by default: unchanged pages are reused, not re-rendered.
// Pass `clean: true` to force a full rebuild.
await exportSite({ root: '/path/to/project', outDir: '/tmp/dist' })
await exportSite({ root: '/path/to/project', outDir: '/tmp/dist', onProgress: console.log })
const code = await runLint({ root: '/path/to/project' })
const exitCode = await runCheck({ root: '/path/to/project' })
const report = await checkConfig({ root: '/path/to/project' })
await scaffoldSite({ root: '/tmp/new-site', type: 'portfolio' })
```

`runLint` and `runCheck` print and return an **exit code**; `analyzeSite` and
`checkConfig` return the findings without printing.

All five are exported from the package root. Also available: `renderPage`,
`analyzeSite`, `parseFrontmatter`, `createMarkdown`, `loadSiteConfig`,
`contentGraph`, `validateConfig`, `HOOKS`, `runPlugins`, and the escaping
helpers `esc` / `safeHref` / `safeColor` — the last three are what a custom
component should use, and `test/integration/theme-escaping.test.js` enforces it.

A config that exists but cannot be parsed is **fatal**: `createJprot()` throws
`ConfigLoadError` rather than starting an unconfigured site. Run
`jprot check` to get the same failure with a file and line.

TypeScript types ship in `jprot.d.ts`; add `/** @type {import('jprot').JprotConfig} */`
to a config file for autocomplete.

## Editor tooling

**JPROT for Visual Studio Code** — a grammar + snippets extension living in
`jprot-vscode/`, with **no runtime code**: nothing to start, nothing to
configure. Build its VSIX and install it:

```bash
cd jprot-vscode
npm run package                             # → jprot-vscode-0.2.2.vsix
code --install-extension jprot-vscode-*.vsix
```

What you get:

- **JPROT Markdown highlighting** — frontmatter tokenized as YAML, plus
  `:::Component` shortcodes and `[value]` placeholders. It is an *injection*
  into the built-in `text.html.markdown` grammar, so headings, emphasis, links
  and fenced code keep the highlighting they already had.
- **Snippets** for pages, posts, projects, resumes and `jprot.config.js`
  (`jprot-page`, `jprot-post`, `jprot-project`, `jprot-resume`, `jprot-config`,
  `jprot-shortcode`, …).

0.1.0 also advertised a live preview that followed the file you were editing.
That preview could not work inside VS Code, and was removed in 0.2.0 rather
than half-fixed — `jprot-vscode/CHANGELOG.md` records why.

## Showcase — JPROT in production

Two live sites built with JPROT, covering the two deployment shapes it supports:

| Site | Hosting | What it demonstrates |
|------|---------|----------------------|
| [نُور — Noor](https://moaaz-i.github.io/Noor/) | GitHub Pages | Arabic-first bilingual site: `lang: 'ar'` + `dir: 'rtl'`, a language chooser at the project root (`basePath: '/Noor'`), custom components, site search, dark mode, generated `sitemap.xml` |
| [moaaz-i.vercel.app](https://moaaz-i.vercel.app/) | Vercel | Full developer portfolio at the domain root: hero + `sections` homepage, projects, a printable `layout: resume`, a blog, a `/repos` page driven by a custom component, and component overrides in `theme/components/` |

Both are pure static output — Markdown in `content/`, one `jprot.config.js`,
then:

```bash
jprot export --out dist   # what those two sites deploy
```

No build pipeline, no server code. Shipped something with JPROT? Open a pull
request and add it to the table.

## Documentation

| Page | Covers |
|------|--------|
| [Quick start](content/quick-start.md) | Create and preview a site in minutes |
| [First site](content/getting-started.md) | Generated files and workflow |
| [Write content](content/content.md) | Markdown, frontmatter, shortcodes |
| [Configure](content/configuration.md) | Identity, nav, SEO, labels |
| [Customize](content/customization.md) | CSS, themes, components, sections |
| [Plugins](content/plugins.md) | Hooks, components, routes, Markdown extensions |
| [Publish](content/deploy.md) | Export and static hosting |
| [CLI reference](content/cli-reference.md) | All commands and options |
| [API reference](content/api-reference.md) | Node.js and TypeScript usage |
| [Troubleshooting](content/troubleshooting.md) | Common issues |
| [FAQ](content/faq.md) | Common questions |
| [Changelog](CHANGELOG.md) | Release notes |

## Project layout

```
core/cli.js           CLI entry (server + init/new/g/check/lint/export)
core/server.js        HTTP server, routing, virtual endpoints, SEO, public API
core/graph.js         The Content Graph — one parsed index of every page
core/render.js        Shortcode AST + section rendering
core/components.js    Component loading and the component contract
core/plugins.js       The plugin API
core/schema.js        Config schema + validation (the CONFIG_KEYS source of truth)
core/check.js         jprot check (config + plugins)
core/lint.js          jprot lint (site-aware content checks)
core/deploy.js        Where the site lives (basePath, canonical URLs)
core/export.js        What gets written to dist/
core/watch.js         Dependency-aware file watcher
core/scaffold.js      init/new/g scaffolds + snippets + hints
core/catalog.js       The remote component catalog (jprot search / jprot add)
core/config.js        Locating and loading jprot.config.js / .json
core/http.js          Security headers, CSP, nonces — the whole header policy
core/state.js         Per-request state via AsyncLocalStorage
core/urls.js          URL resolution and canonicalization
core/utils.js         esc / safeHref / safeColor / slugify / editDistance / MIME
lib/markdown/         Markdown → HTML, split by concern
lib/frontmatter.js    YAML frontmatter parser
lib/markdown.js       Back-compat shim; prefer lib/markdown/index.js
theme/default/        Built-in theme (components + styles)
theme/custom.css      Your CSS overrides
theme/components/     Your component overrides
content/              Your Markdown content
public/               Static assets (images, fonts, files)
examples/             Theme packs and component examples
test/unit/            Pure-logic tests
test/integration/     End-to-end tests + HTML/JSON snapshots
jprot.d.ts            TypeScript definitions
jprot-vscode/         VSCode extension (highlighting + snippets, no runtime)
CHANGELOG.md          Release notes
```

## Authoring contract

Two rules a custom component has to follow, both enforced by
`test/integration/theme-escaping.test.js`:

1. **Escape every interpolation.** `esc()` for text and attribute values,
   `safeHref()` for anything that becomes an `href`/`src`/`action`. `esc()`
   alone stops the quote breakout but still lets `javascript:` through;
   `safeHref()` alone does not escape. Frontmatter, `sections:` entries and
   `key="value"` shortcode attributes are all author-controlled, and a
   component that interpolates any of them raw is a stored XSS.
2. **Use the shared helpers.** `esc` and `safeHref` are imported from
   `core/utils.js`. Do not reimplement either locally: three copies of
   `safeHref` existed and had already drifted from each other.

`safeColor()` is the third, for brand colors that land inside a `<style>` block
or an SVG attribute — there, escaping is not enough, because `}` and `/*` are
still live.

### Known limits of the Markdown engine

JPROT's renderer is a deliberately small CommonMark subset, not GFM. Worth
knowing before you migrate content:

- Inline parsing is regex-based, so `~~a~~ and ~~b~~` on one line and nested
  emphasis are not rendered the way GitHub would.
- Frontmatter is a YAML subset: scalars, quoted strings, arrays and one level of
  nesting. Block scalars (`|` and `>`), anchors, aliases and multi-line flow
  collections are not supported.
- Link destinations are matched with a non-greedy regex, so a URL containing
  balanced parentheses — `[x](https://en.wikipedia.org/wiki/Foo_(bar))` — stops
  at the first `)` and leaves the remainder as text.

### Raw HTML in Markdown

Raw HTML in a Markdown body is **passed through, not escaped**. That is a
deliberate choice, and it is safe only because of the Content-Security-Policy
that every document response carries:

```
script-src 'self' 'nonce-…'
```

There is no `unsafe-inline` in `script-src`, so an injected `<script>` without
the per-response nonce and an `onerror=`/`onclick=` handler are both refused by
the browser. The `nonce` is the actual security boundary here, not escaping.

Two consequences worth knowing:

- If you embed JPROT output in a page you control, do not weaken that CSP
  (`unsafe-inline` in `script-src`) — doing so turns every content file into a
  script-execution vector.
- Markup *is* injectable even though script is not. A content file from an
  untrusted source can add layout, a phishing form, or an off-site tracking
  pixel (`img-src` allows `https:`), and `text/html` framing of a single
  exported page loses the CSP that protected it. Treat content files as
  trusted input, exactly as you would a theme component.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture map, testing
conventions, and pull request guidance. Newcomers can start from issues labelled
[`good first issue`](https://github.com/Moaaz-i/JPROT/labels/good%20first%20issue).

Participation is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md). Please report vulnerabilities privately
according to [SECURITY.md](SECURITY.md), not in a public issue.

## License

MIT — see [LICENSE](LICENSE).