---
title: Architecture
description: Learn how JPROT resolves content, renders components, and exports a site.
order: 12
nav: Architecture
---

JPROT is deliberately small. The whole engine fits in a handful of source files with **zero external dependencies**.

## Project layout

```
core/
  cli.js          CLI entry point — server + init/new/g/export/lint
  server.js       HTTP server, content discovery, shortcodes, component invocation
  scaffold.js     init/new/g scaffolds, editor snippets, config-key hints
  export.js       Static export to dist/
  lint.js         Content checks
lib/
  markdown.js     Markdown → HTML converter (no libraries)
  frontmatter.js  Minimal YAML frontmatter parser
theme/
  default/        Built-in components + styles.css
  custom.css      Your override (auto-loaded)
  components/     Your component overrides (drop-in)
content/          Your Markdown content
public/           Static assets served at /
examples/         Copy-paste samples
jprot.config.js   Site configuration
test/             Node's built-in test runner (npm test)
```

## How a request flows

1. **`cli.js`** calls `createJprot()` and listens on the port.
2. **`server.js`** reads `jprot.config.js` into `site` and scans `content/` into a navigation list.
3. On each request the server:
   - Resolves the path to a Markdown file (`content/`).
   - Parses **frontmatter** (`lib/frontmatter.js`).
   - Renders the body to HTML — first expanding `:::Component` **shortcodes**
     (`core/server.js`), then running the classic Markdown pass
     (`lib/markdown.js`).
   - Picks the matching **component** (`Home`, `Page`, or a custom layout).
4. The `Layout` component wraps `Header` + content + `Footer` into a full HTML page with `styles.css` links injected.

## Component resolution

The server merges built-in components with user overrides, with **user files winning**:

```
theme/default/components/*.js   ← built-in defaults
theme/components/*.js           ← your overrides (take precedence)
```

If a user drops `Header.js` into `theme/components/`, it fully replaces the default.

## Shortcodes: one registry, two call sites

The same component map that renders `site.sections` is also the shortcode
registry. A `:::Name` block in any page body is parsed fence-aware (code
blocks stay literal), its attributes are typed (numbers, booleans, JSON), and
the inner Markdown is re-rendered recursively and passed to the component as
`children`. User components loaded from `theme/components/` are auto-registered
into both systems.

## The state object

Running state (content dir, theme dir, site config, loaded components, prod
flag) is held in a small module-level store so the handler functions stay clean
and reusable — hot-reload rebuilds this store in place.

## Config sources (priority order)

1. `config` passed programmatically to `createJprot()`
2. `jprot.config.js`
3. `jprot.config.json`
4. Empty defaults

Right after loading, the server validates the config and prints **startup
hints**: unknown `sections[].component` names (with the available list) and
config keys that look like typos (with a did-you-mean suggestion).

## Server behavior

Every request flows through the same pipeline in dev, production (`--prod`) and
`jprot export` — the exported site is literally the recorded output of this
server, so a preview always matches what gets deployed.

**URL canonicalization** — duplicate URL forms collapse to one:

- `/page.md` → `301 /page` (`.md` links keep working from READMEs/editors
  without serving duplicate content)
- `/page/` → `301 /page` (trailing slashes collapse; `/`, `/index.html` and the
  homepage stay untouched)
- internal links in rendered pages have their `.md` stripped automatically

**Status codes** — `200` for pages, `404` for misses (a `content/404.md` can
customize it while keeping the status), `304` when an `ETag` matches, `405` with
an `Allow` header for unsupported methods.

**Security headers** — every response carries `X-Content-Type-Options`,
`Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, COOP/CORP, and a
Content-Security-Policy: nonce-based scripts, `'self'` by default, with
Formspree endpoints whitelisted into `connect-src` and `form-action`.

**Caching** — pages and feeds are `no-cache` (they reflect content instantly);
content-hashed assets (`/@jprot/css/<sha>.css`, OG images) are served
`public, max-age=31536000, immutable` in production and export.

**Virtual routes** — no files behind them, generated on the fly:

| Route | Serves |
|---|---|
| `/@jprot/css/<sha>.css` | theme + custom stylesheets, content-hashed |
| `/@jprot/search.json` | the instant-search index (also read by `export`) |
| `/@jprot/og/<sha>.svg` | auto-generated Open Graph images |
| `/manifest.json`, `/favicon.svg` | PWA manifest and favicon |
| `/feed.xml`, `/rss.xml` | RSS feed of blog posts |
| `/sitemap.xml`, `/robots.txt` | discovery files |
| `/llms.txt`, `/llms-full.txt` | AI/LLM-readable site summary |

**Drafts** — previewable in dev only. In production and exports they are hidden
from the navigation, sitemap, search index, RSS feed, and resolved as `404`.

**Lifecycle** — the dev server watches `content/`, `theme/`, `public/` and
`jprot.config.js`, rebuilds the site state in place on change, and tells open
pages to reload. `export` reuses the same HTTP pipeline and materializes the
whole tree, including hashed assets, the static search index, and redirects.

## Why this design

- **No build** → the "pipeline" is a request handler, not a precompiled artifact.
- **Overrides over config** → you don't fight a theme object; you replace components.
- **Few files** → easy to read, fork, and extend with your own layouts.
- **One component system** → sections, shortcodes and layouts call the same functions.

Next: [Comparison](comparison.md).