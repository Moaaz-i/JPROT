# JPROT

**A portfolio site generator without a build step.**

JPROT serves Markdown directly with SSR and SPA navigation — zero dependencies,
zero build, full control. It includes dark mode, four built-in themes, contact
forms, SEO/JSON-LD, PWA support, TypeScript types, and a component system, all
running on Node.js 18+.

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
| `jprot export [--out dist]` | Export the whole site to static HTML |
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
import { createJprot, exportSite, runLint, runCheck, scaffoldSite } from 'jprot'

const app = await createJprot({ root: '/path/to/project', port: 3000, watch: true })
await app.listen(3000)

await exportSite({ root: '/path/to/project', outDir: '/tmp/dist' })
const code = await runLint({ root: '/path/to/project' })
const report = await runCheck({ root: '/path/to/project' })
await scaffoldSite({ root: '/tmp/new-site', type: 'portfolio' })
```

TypeScript types ship in `jprot.d.ts`; add `/** @type {import('jprot').JprotConfig} */`
to a config file for autocomplete.

## Editor tooling

**JPROT for Visual Studio Code** — install from the Marketplace (or build the
VSIX in `jprot-vscode/`). It gives you a live side-by-side preview of your site,
JPROT Markdown highlighting (frontmatter, `:::Component` shortcodes,
`[value]` placeholders) and snippets for pages, posts, projects, resumes and
`jprot.config.js` — all by driving the project's own jprot server:

```bash
code --install-extension jprot-vscode-0.1.0.vsix   # from jprot-vscode/
```

Open any JPROT project, press the **JPROT** activity-bar panel, and the preview
follows the Markdown file you're editing — save and it re-renders instantly.

## Documentation

| Page | Covers |
|------|--------|
| [Quick start](content/quick-start.md) | Create and preview a site in minutes |
| [First site](content/getting-started.md) | Generated files and workflow |
| [Write content](content/content.md) | Markdown, frontmatter, shortcodes |
| [Configure](content/configuration.md) | Identity, nav, SEO, labels |
| [Customize](content/customization.md) | CSS, themes, components, sections |
| [Publish](content/deploy.md) | Export and static hosting |
| [CLI reference](content/cli-reference.md) | All commands and options |
| [API reference](content/api-reference.md) | Node.js and TypeScript usage |
| [Troubleshooting](content/troubleshooting.md) | Common issues |
| [FAQ](content/faq.md) | Common questions |
| [Changelog](CHANGELOG.md) | Release notes |

## Project layout

```
core/cli.js           CLI entry (server + init/new/g/check/lint/export)
core/server.js        HTTP server, routing, virtual endpoints, SEO
core/graph.js         The Content Graph — one parsed index of every page
core/content.js       Facade over the graph (kept for existing imports)
core/render.js        Shortcode AST + section rendering
core/components.js    Component loading and the component contract
core/plugins.js       The plugin API
core/schema.js        Config schema + validation
core/check.js         jprot check (config + plugins)
core/lint.js          jprot lint (site-aware content checks)
core/deploy.js        Where the site lives (basePath, canonical URLs)
core/export.js        What gets written to dist/
core/watch.js         Dependency-aware file watcher
core/scaffold.js      init/new/g scaffolds + snippets + hints
lib/markdown/         Markdown → HTML, split by concern
lib/frontmatter.js    YAML frontmatter parser
theme/default/        Built-in theme (components + styles)
theme/custom.css      Your CSS overrides
theme/components/     Your component overrides
content/              Your Markdown content
public/               Static assets (images, fonts, files)
examples/             Theme packs and component examples
test/unit/            Pure-logic tests
test/integration/     End-to-end tests + HTML/JSON snapshots
jprot.d.ts            TypeScript definitions
jprot-vscode/         VSCode extension (preview, highlighting, snippets)
CHANGELOG.md          Release notes
```

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull request
guidance. Please report vulnerabilities privately according to
[SECURITY.md](SECURITY.md), not in a public issue.

## License

MIT — see [LICENSE](LICENSE).