---
title: JPROT documentation
description: Build a Markdown site in minutes, customize it without a build step, and publish it anywhere.
layout: home
---

# Build your site in minutes

> [!NOTE]
> **Working template.** This homepage doubles as the live template shipped with
> `jprot init`. Every section below — sample projects, stats, experience,
> testimonials — is real, replaceable content from `jprot.config.js` and
> `content/`. Fork it and make it yours.

**You don't need to know HTML, CSS, or JavaScript.** You write simple text
files in a format called **Markdown**, and jprot turns them into a real
website — for free, with no build step, no servers, and nothing to install
beyond Node.js.

## Get started in 3 steps

1. **Create a site** — from any empty folder, run
   `npx jprot init --portfolio`.
2. **Preview it** — run `npm start` and open <http://127.0.0.1:4114>.
3. **Add a page** — drop a `.md` file into `content/` and open its address.

That's the entire core workflow. The pages below go deeper, only when you want
them to.

## Choose your next step

- **[Quick start](quick-start.md)** — a 5-minute, beginner-friendly walkthrough
  from "what is Markdown?" to a live first page.
- **[Create your first site](getting-started.md)** — what the starter files do,
  and how to add posts and projects fast.
- **[Write your first page](content.md)** — the full toolkit: Markdown,
  frontmatter, images, links, and component blocks.
- **[Basic configuration](configuration.md)** — change the title, tagline,
  colors, URL, and navigation.
- **[Publish your site](deploy.md)** — put it online for free with GitHub Pages
  or any static host.
- **[Customize your site](customization.md)** — themes, CSS, components,
  sections, and search.

Reference pages exist for the [CLI](cli-reference.md),
[configuration](configuration.md), and [Node.js API](api-reference.md). If
anything goes wrong, see [Troubleshooting](troubleshooting.md) and the
[FAQ](faq.md).

---

## ✨ Why JPROT?

Most generators force you to run a build and accept a fixed theme. JPROT flips
that:

| Usual pain point                          | JPROT's answer                          |
| ----------------------------------------- | --------------------------------------- |
| You must run "build" to see changes       | **No build** — save the file, refresh   |
| Changing the design is a project          | Redefine **CSS variables** and watch it change |
| The layout is owned by the framework      | Replace **components** with your own files |
| Writing content uses a special language   | Plain **Markdown** in a `content/` folder |
| Heavy dependencies and `node_modules`     | Vanilla **Node.js**, zero packages      |

---

## 🧩 Core features

- **Zero build.** One command serves everything.
- **Markdown content** with a tiny settings block (title, tags, order, hidden).
- **Truly customizable** via CSS variables and drop-in components (`Header`,
  `Footer`, `Layout`, `Home`, `Page`).
- **Instant projects** — drop files in `content/projects/` and cards appear on
  the homepage.
- **Static assets** served straight from `public/`.
- **Portable** — Node.js 18+ is the only requirement.

---

## Reference and help

- [Examples](examples.md) — copy-paste themes, components, and config.
- [Troubleshooting](troubleshooting.md) — fix common problems step by step.
- [FAQ](faq.md) — common questions, answered simply.
- [Architecture](architecture.md) — internals for contributors and theme authors.
- [Comparison](comparison.md) — JPROT versus VitePress.