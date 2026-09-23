---
title: JPROT documentation
description: Build a Markdown site in minutes, customize it without a build step, and publish it anywhere.
layout: home
---

# JPROT

A zero-dependency, zero-build site generator. Write Markdown in `content/`,
serve it with Node.js, and publish static files anywhere.

```bash
jprot init --portfolio        # scaffold a site (or npx jprot init)
npm start                     # preview at http://127.0.0.1:4114
jprot export                  # static output to dist/
```

## Getting started

1. **[Quick start](quick-start.md)** — create and preview a site in ~5 minutes.
2. **[First site](getting-started.md)** — project structure and the daily workflow.
3. **[Write content](content.md)** — Markdown, frontmatter, projects, shortcodes.

## Configure & customize

- **[Configuration](configuration.md)** — site identity, nav, SEO, labels, markdown.
- **[Customization](customization.md)** — CSS variables, components, themes, sections.
- **[Publish](deploy.md)** — export to GitHub Pages, Netlify, Cloudflare, or any host.

## Reference

- **[Catalog elements](catalog.md)** — install ready-made components with `jprot add`.
- **[CLI reference](cli-reference.md)** — all commands and options.
- **[API reference](api-reference.md)** — Node.js and TypeScript usage.

## Guides

- **[Examples](examples.md)** — copy-paste themes, components, and config.
- **[Troubleshooting](troubleshooting.md)** — common problems and fixes.
- **[FAQ](faq.md)** — frequently asked questions.
- **[Architecture](architecture.md)** — internals for contributors.
- **[Comparison](comparison.md)** — JPROT versus VitePress.
- **[Showcase](showcase.md)** — every built-in section rendered with live data.
- **[Resume](resume.md)** — the printable `layout: resume` example.

---

## Why JPROT?

| Usual pain point                     | JPROT's answer                      |
| ------------------------------------ | ----------------------------------- |
| You must run "build" to see changes  | **No build** — save the file, refresh |
| Changing the design is a project     | Redefine **CSS variables**          |
| The layout is owned by the framework | Replace **components** with your own files |
| Content uses a special language      | Plain **Markdown** in `content/`    |
| Heavy dependencies and `node_modules`| Vanilla **Node.js**, zero packages  |

## Core features

- **Zero build.** One command serves everything.
- **Markdown content** with a small YAML frontmatter block.
- **Customizable** via CSS variables and drop-in components.
- **Instant projects** — files in `content/projects/` become homepage cards.
- **Static assets** served from `public/`.
- **Portable** — Node.js 18+ is the only requirement.