---
title: Publishing
description: Export your JPROT site to static files and deploy to GitHub Pages, Netlify, Cloudflare Pages, or any host.
order: 6
nav: Publish
---

Publishing has two steps: **export** the site to static files, then **upload**
that folder to any host.

## 1. Verify before publishing

```bash
jprot lint
```

Reports missing frontmatter, broken internal links, missing descriptions,
images without alt text, and oversized local images. Fix what it lists, then
preview production behavior:

```bash
jprot --prod --no-watch
```

Production mode hides drafts and sends immutable cache headers. Stop with
`Ctrl+C` when done.

## 2. Export

```bash
jprot export --out dist
```

```text
Exported site to: .../dist
```

`dist/` contains everything the site needs: `index.html`, one folder per page,
`404.html`, RSS feed, sitemap, search index, PWA manifest, link-preview images,
and your `public/` files **minus drafts**. Never edit files inside `dist/` —
change `content/` and re-export.

### Project-site deployments (`--base-path`)

For `https://ACCOUNT.github.io/REPOSITORY/` (a project site), prefix exported
URLs:

```bash
jprot export --out dist --base-path /REPOSITORY
```

Or set it once in `jprot.config.js`:

```js
export default {
  basePath: '/REPOSITORY',
}
```

`basePath` is folded into every generated link:

- `manifest.json` `start_url`, `scope`, and icon paths are prefixed.
- Sitemap, RSS, `robots.txt`, `llms.txt`, canonical, and OG URLs use
  `site.url + basePath` automatically — so the exported output is
  deployment-correct without editing `url` by hand.
- `.nojekyll` is written for GitHub Pages.

A **user site** (`https://ACCOUNT.github.io/`) needs no `--base-path`.

Sanity-check before pushing:

```bash
test -f dist/index.html
test -f dist/404.html
find dist -name index.html | sort
```

## 3. Deploy

### GitHub Pages

Enable GitHub Pages in the repository settings and point it at the `dist/`
branch or folder.

### Netlify / Cloudflare Pages / Vercel

Upload `dist/` as-is, or connect the repository with:

- **Build command**: `jprot export`
- **Output directory**: `dist/`
- **Not-found page**: `404.html`

### Any static host

Remove the `dist/` directory and ensure the host serves `404.html` for unknown
addresses. If the host doesn't support clean URLs (`/about/index.html`), enable
them, or use the folder URLs as exported.

## Running as a server (Node hosting)

```bash
npm install
npm start -- --prod --no-watch
```

Public hosts usually need a host and port:

```bash
HOST=0.0.0.0 PORT=8080 npm start -- --prod --no-watch
```

## Before going live

Set the real `url` in `jprot.config.js`. `basePath` fixes file addresses;
`url` controls search-engine and link-preview metadata. Both are needed for a
project site.

Next: [Catalog elements](catalog.md).