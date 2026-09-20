---
title: Publish your site
description: Put your JPROT site online for free — GitHub Pages, Netlify, Cloudflare Pages, or any static host.
order: 6
nav: Publish
---

**You will learn:** how to turn your site into a folder of finished files
(called an **export**) and how to put that folder online for free.

> [!TIP]
> New here? Everything you need to write content is in
> [Write your first page](content.md). This page is only about the final step:
> showing your site to the world.

## What "publishing" means

While you develop, your site only exists on your own computer (the local
preview). Publishing has two steps:

1. **Export** — jprot produces a folder of ready-made HTML files (no server
   needed to read them).
2. **Upload** — you drop that folder on a hosting service, and anyone with the
   address can visit it.

## 1. Check your site before publishing

From your site folder, run:

```bash
jprot lint
```

`jprot lint` scans your content for broken links and missing descriptions. Fix
whatever it reports:
- `frontmatter missing title` → add a `title:` line.
- `broken internal link → …` → the page you linked to doesn't exist; check the
  spelling or remove the link.

Then preview the way visitors will see it (production mode hides drafts):

```bash
jprot --prod --no-watch
```

Open the preview, click through your pages, and check images and menus. Stop it
with `Ctrl+C`.

## 2. Export your site to files

```bash
jprot export --out dist
```

Expected output:

```text
Exported site to: .../dist
```

A new `dist/` folder appears next to your files. It contains everything the
site needs: `index.html`, one folder per page, `404.html`, the RSS feed, the
sitemap, link-preview images, and your `public/` files. **Drafts are not
included** — that's the "work in progress" protection working.

> [!NOTE]
> `dist` = "distribution". It's a common name for the final, publishable
> files. You never edit files inside `dist/` — you always edit in `content/`
> and re-run the export.

## 3. Upload it

### GitHub Pages (free, most popular)

If your address will be `https://ACCOUNT.github.io/REPOSITORY/` (a
**project site**, hosted inside a repository), tell jprot the extra folder
during export:

```bash
jprot export --out dist --base-path /REPOSITORY
```

Or save it once in `jprot.config.js` so you never forget:

```js
export default {
  basePath: '/REPOSITORY',
}
```

Then enable **GitHub Pages** in your repository settings and point it at the
`dist/` folder. jprot already wrote a `.nojekyll` file for you, which keeps
GitHub Pages from interfering with generated files.

If your address is `https://ACCOUNT.github.io/` (a **user site**), skip
`--base-path` entirely.

**Before you push, double-check the files exist:**

```bash
test -f dist/index.html
test -f dist/404.html
test -f dist/search.json
find dist -name index.html | sort
```

### Netlify / Cloudflare Pages / Vercel

Upload the `dist/` folder as-is, or connect the service to your repository and
tell it: **build command** = `jprot export`, **output directory** = `dist/`.
If the service has a "not found page" setting, point it at `404.html`.

### Any other static host

Upload `dist/` as-is and make sure the host serves `404.html` for unknown
addresses. If the host doesn't support "clean URLs" (folders like
`/about/index.html`), enable them — or just use the folder URLs as exported.

## Running as a server instead (Node hosting)

jprot can also run as a continuous server. Copy the project to your server and:

```bash
npm install
npm start -- --prod --no-watch
```

Some platforms need a public host and a port number they give you:

```bash
HOST=0.0.0.0 PORT=8080 npm start -- --prod --no-watch
```

## Before you go live

Set your real `url` in `jprot.config.js`. The `--base-path` fixes file
addresses; `url` controls search-engine and link-preview metadata. Both matter
— one fixes the files, the other fixes how the internet describes your site.

Next: [CLI reference](cli-reference.md).