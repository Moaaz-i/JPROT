---
title: Publish your site
description: Export JPROT to static files and publish them on GitHub Pages or any static host.
order: 6
nav: Publish
---

# Publish your site

JPROT can run as a Node server or export a production-ready static site. Use
the export for GitHub Pages, Netlify, Cloudflare Pages, or any host that serves
HTML and assets.

## Check before publishing

Run these commands from your site folder:

```bash
jprot lint
jprot --prod --no-watch
```

Open the production server and check the home page, navigation, images, and
draft behavior. Stop it with `Ctrl+C`.

## Export static files

```bash
jprot export --out dist
```

Expected output:

```text
Exported site to: .../dist
```

The export contains `index.html`, one directory per page, `404.html`, feeds,
the sitemap, generated Open Graph images, fingerprinted CSS, and files from
`public/`. Drafts are excluded.

## GitHub Pages project sites

For a repository site at `https://ACCOUNT.github.io/REPOSITORY/`, include the
repository path when exporting:

```bash
jprot export --out dist --base-path /REPOSITORY
```

The base path is applied to internal links, assets, and the client search
request. Deploy the contents of `dist/` with GitHub Pages. For a user site at
`https://ACCOUNT.github.io/`, omit `--base-path`.

Before publishing, verify the generated paths:

```bash
test -f dist/index.html
test -f dist/404.html
test -f dist/search.json
find dist -name index.html | sort
```

Set the production `url` in `jprot.config.js` as well. `--base-path` fixes
relative browser paths; `url` controls canonical and discovery metadata.

## Other static hosts

Upload the `dist/` directory as-is. Configure the host to serve `404.html` for
unknown routes. If your host does not support directory indexes, keep the
exported `page/index.html` structure and enable clean URLs in the host.

## Node hosting

For a server deployment, copy the project and run:

```bash
npm install
npm start -- --prod --no-watch
```

Set `HOST=0.0.0.0` when the platform needs a public interface and set `PORT`
from the platform environment.

Next: [CLI reference](cli-reference).
