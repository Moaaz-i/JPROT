---
title: Quick start
description: Create and preview a JPROT site in about five minutes.
order: 1
nav: Start here
---

JPROT turns a folder of Markdown files into a website with no build step.
Node.js 18+ is the only requirement.

## Prerequisites

```bash
node --version   # v18 or newer
```

Install Node.js from <https://nodejs.org> if needed (use the LTS release).

## 1. Scaffold a site

```bash
mkdir my-site
cd my-site
npx jprot init --portfolio
```

`--portfolio` creates a portfolio starter. Alternatives: `--docs` (documentation
site), `--resume` (CV-style site).

```text
✔ Site scaffolded into the current folder.
   Run `jprot` to preview, `jprot new post "My First Post"` to add content.
```

`jprot init` never overwrites existing files, so re-running it is safe.

## 2. Run the preview server

```bash
npm start
```

(The scaffolded project includes a `start` script that runs the `jprot`
command-line tool. If you only ran JPROT via `npx` without a global install,
use `npx jprot` instead — same server.)

Open <http://127.0.0.1:4114>. If the port is busy, JPROT picks the next free port;
start on a specific port with `jprot 5000`. Stop the server with `Ctrl+C`.

## 3. Add a page

Create `content/hello.md`:

```markdown
---
title: Hello
description: My very first JPROT page.
---

# Hello

This page is alive!
```

Open <http://127.0.0.1:4114/hello>. There is no build step — save the file and
refresh. Every file in `content/` becomes a page at its path:

| File                              | URL                     |
|-----------------------------------|-------------------------|
| `content/index.md`                | `/`                     |
| `content/about.md`                | `/about`                |
| `content/blog/first-post.md`      | `/blog/first-post`      |

## What's next

- [Create your first site](getting-started.md) — project structure and workflow.
- [Write content](content.md) — Markdown, frontmatter, projects, shortcodes.
- [Publish](deploy.md) — export to GitHub Pages or any static host.