---
title: Quick start
description: Run JPROT and create a working Markdown site in a few minutes.
order: 1
nav: Start here
---

# Quick start

JPROT turns a folder of Markdown files into a portfolio, documentation site,
or personal website. There is no build command and no dependency installation.

## 1. Check your Node.js version

JPROT supports Node.js 18 or newer:

```bash
node --version
```

If the command prints `v18` or higher, continue.

## 2. Create a site

Use an empty folder for a new site:

```bash
mkdir my-site
cd my-site
npx jprot init --portfolio
```

Expected output:

```text
✔ Site scaffolded into the current folder.
Run `jprot` to preview, `jprot new post "My First Post"` to add content.
```

JPROT creates a config file, starter content, a theme override folder, and
editor snippets. It never overwrites existing files.

## 3. Preview it

```bash
npm start
```

Open <http://127.0.0.1:4114>. Edit a Markdown file, save it, and refresh the
browser. The watcher reloads navigation, config, components, and styles.

## 4. Make your first change

Create `content/hello.md`:

```markdown
---
title: Hello
description: My first JPROT page.
---

# Hello

This page is live.
```

Refresh the browser and open `/hello`. Continue with
[Create your first site](getting-started.md) to understand the generated files,
then [write your first page](content.md).

## Common first-run problems

- **Port already in use:** run `jprot 5000` or `PORT=5000 npm start`.
- **Page is missing from navigation:** add a top-level Markdown file or set
  `nav:` in its frontmatter.
- **Draft returns 404:** drafts are visible in development but hidden by
  `jprot --prod` and static exports.
- **Changes look stale:** restart with `jprot --no-watch` only when you need to
  disable watching; normal development should keep the watcher enabled.
