---
title: JPROT documentation
description: Build a Markdown site in minutes, customize it without a build step, and publish it anywhere.
layout: home
---

# Build your site in minutes

JPROT is a **Markdown-first portfolio and documentation generator**. Start
locally in one command, edit a file, refresh the browser, and publish static
HTML when you are ready. There is no build step and no framework lock-in.

```bash
npx jprot init --portfolio
npm start
```

Open <http://127.0.0.1:4114> and make your first change.

## Choose your next step

- **[Quick start](quick-start)** — create a working site in a few minutes.
- **[Create your first site](getting-started)** — understand the starter files
  and daily workflow.
- **[Write your first page](content)** — use Markdown, frontmatter, projects,
  posts, and shortcodes.
- **[Basic configuration](configuration)** — set the title, URL, navigation,
  layouts, SEO, and labels.
- **[Customize your site](customization)** — change CSS, themes, components,
  sections, and the search experience.
- **[Publish your site](deploy)** — export to GitHub Pages or any static host.

Reference pages are available for the [CLI](cli-reference),
[configuration](configuration), and [Node.js API](api-reference).

You write plain **Markdown** files. The server reads them and serves HTML instantly. Every part of the presentation — layout, header, footer, homepage, colors, fonts — is **yours to override** with simple CSS variables and drop-in components. No bundler, no framework lock-in, no compile step.

---

## ✨ Why JPROT?

Most generators force a build step and a fixed theme. JPROT flips this:

| Pain point                        | JPROT answer                                     |
| --------------------------------- | ------------------------------------------------ |
| Must run a build to see changes   | **No build** — save, refresh, done               |
| Theme is hard to change           | Redefine **CSS variables** in `theme/custom.css` |
| Layout is locked by the framework | Replace **components** with your own files       |
| Write content in a special DSL    | Plain **Markdown** in `content/`                 |
| Heavy dependencies & node_modules | Vanilla **Node.js**, zero external packages      |

---

## 🧩 Core features

- **Zero build.** A single `node core/cli.js` command serves everything.
- **Markdown content** with YAML frontmatter (titles, tags, ordering, hidden).
- **Radically customizable** via CSS variables and override components (`Header`, `Footer`, `Layout`, `Home`, `Page`).
- **Instant projects**: drop files into `content/projects/` and cards appear on the homepage.
- **Static assets** served from `public/`.
- **Portable**: runs on Node.js 18+ with nothing else.

---

## Reference and help

- [Examples](examples) — copy-paste themes, components, and config.
- [Troubleshooting](troubleshooting) — fix common setup and deployment issues.
- [FAQ](faq) — common questions.
- [Architecture](architecture) — internals for contributors and theme authors.
- [Comparison](comparison) — JPROT versus VitePress.
