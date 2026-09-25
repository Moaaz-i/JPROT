---
title: Architecture
description: Learn how JPROT resolves content, renders components, and exports a site.
order: 13
nav: Architecture
---

JPROT is deliberately small. The whole engine fits in a handful of source files with **zero external dependencies**.

## Project layout

```
core/
  cli.js          CLI entry point — server + init/new/g/check/lint/export
  server.js       HTTP server, routing, virtual endpoints, component invocation
  graph.js        The Content Graph — one parsed index of every page
  content.js      Thin facade over the graph (readContentSite, getPage, …)
  render.js       Shortcode AST + section rendering
  components.js   Component loading and the component contract
  plugins.js      The plugin API (setup, hooks, registries)
  schema.js       Config schema, validation, "did you mean…?" hints
  check.js        jprot check — config + plugin validation
  lint.js         jprot lint — site-aware content checks
  deploy.js       Everything about *where* the site lives
  export.js       Everything about *what* gets written to dist/
  watch.js        Dependency-aware file watcher
  catalog.js      The component catalog client
  scaffold.js     init/new/g scaffolds, editor snippets, config-key hints
  http.js         Security headers, caching, ETags
  urls.js         URL canonicalization and internal link resolution
  config.js       Config discovery and loading
  state.js        The small module-level state store
  utils.js        Shared helpers
lib/
  markdown/       Markdown → HTML, split by concern (see below)
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

## The layers

Each file owns one question, and only that question:

| Layer | File | Question it answers |
|---|---|---|
| Content | `graph.js` | What pages exist, and how do they link to each other? |
| Render | `render.js`, `lib/markdown/` | How does a Markdown file become HTML? |
| Components | `components.js` | What is a component, and is this one valid? |
| Extensibility | `plugins.js` | What can a plugin do, without touching internals? |
| Location | `deploy.js` | Where does this site live once published? |
| Output | `export.js` | What gets written to disk? |
| Confidence | `check.js`, `lint.js` | Is this site actually correct? |

`content.js` stays as a **facade** so existing imports keep working, but it holds
no logic of its own — it re-exports the graph. That is what keeps the dependency
arrows pointing one way (`server → content → graph`) with no import cycle.

## The Content Graph

`core/graph.js` is the single place that reads `content/`. One pass produces
every derived structure the rest of the server needs:

```
loadContentGraph()
  ├── pages[]            every page, with frontmatter parsed once
  ├── posts[]            sorted blog entries
  ├── projects[]         sorted project entries
  ├── navigation[]       header links
  ├── docsNavigation[]   sidebar order in docs mode
  ├── orphans()          pages nothing links to
  └── extractLinks() / extractHeadings()   the same analysis `jprot lint` uses
```

Every consumer — routing, the search index, the sitemap, the RSS feed,
`jprot lint`, the export — reads the graph instead of walking the filesystem
itself. That is why "is this link broken" has exactly one implementation, and why
lint can catch a duplicate heading anchor that a browser would never notice.

The graph is cached, keyed by the content directories plus a
`file:mtime:size` signature per file. A rebuild that changes nothing re-parses
nothing; editing one page re-reads one page.

`resolveInternalTarget()` resolves a link against the **served URL** (not the
file path), so `../guide.md` from `/docs/intro` lands on `/guide.md` — exactly
what the browser does, and what the server's own 301s assume.

## How a request flows

1. **`cli.js`** calls `createJprot()` and listens on the port.
2. **`server.js`** calls `buildState()`, which runs every plugin's `setup()`,
   merges the component registries, and asks the graph for the current content.
3. On each request the server:
   - Resolves the path through the content graph.
   - Parses **frontmatter** (`lib/frontmatter.js`).
   - Renders the body to HTML — first expanding `:::Component` **shortcodes**
     into an AST (`core/render.js`), then running the classic Markdown pass
     (`lib/markdown/`).
   - Picks the matching **component** (`Home`, `Page`, or a custom layout).
   - In `docs` mode, the graph's `docsNavigation` supplies the sidebar and the
     previous/next links.
   - Runs the `html:*` plugin hooks over the finished page.
4. The `Layout` component wraps `Header` + content + `Footer` into a full HTML page with `styles.css` links injected.

## The Markdown subsystem

`lib/markdown/` is split by concern rather than sitting in one 700-line file:

| File | Owns |
|---|---|
| `index.js` | The public `renderMarkdown()` entry and the pass order |
| `definitions.js` | Link reference definitions (`[text]: url`) |
| `blocks.js` | Headings, fences, lists, tables, quotes, `hr` |
| `inline.js` | Emphasis, code spans, strikethrough, autolinks |
| `links.js` | `href` rewriting, `.md` stripping, external detection |
| `footnotes.js` | Footnote collection and rendering |
| `sanitize.js` | Escaping and raw-HTML policy |
| `slugify.js` | Heading anchors, including the `-2` disambiguation suffix |

`lib/markdown.js` remains as a back-compat re-export, so existing imports keep
working. The anchor scheme is shared with the Content Graph, which is what lets
`jprot lint` verify that every `#anchor` in a link actually exists on the page.

## Shortcodes: one registry, two call sites

The same component map that renders `site.sections` is also the shortcode
registry. A `:::Name` block in any page body is parsed into a small
**AST** (`parseDocument`) rather than being rewritten with string surgery:

- Fence-aware — a `:::Name` inside a code block stays literal.
- Attributes are typed — numbers, booleans, and JSON are parsed, not strings.
- Shortcodes **nest**: an inner `:::Name` is rendered to HTML first and handed
  to the outer component as `children`.
- **One failure is one failure**: if a component throws or a shortcode names
  something unregistered, that block renders as a visible marker and the rest of
  the page still renders.

User components loaded from `theme/components/` are auto-registered into both
systems.

## The component contract

`core/components.js` normalizes every component into one shape, so a component
can be written in whichever form reads best:

```js
export default function Card(props) { return '<div>…</div>' }

export default {
  name: 'Card',
  props: { title: 'string', count: 'number', items: 'array' },
  render(props) { return '<div>…</div>' },
}
```

Declaring `props` is optional but valuable — it is what turns a misspelled
section key into a lint warning instead of a silently empty component. A bare
string is a type name; the object form adds `required`:

```js
props: {
  title:  'string',                                  // optional
  count:  { type: 'number', required: true },       // must be supplied
  items:  'array',
  links:  { type: 'array', required: false },
}
```

Supported type names: `string`, `number`, `boolean`, `array`, `object`, `any`,
or any `typeof` result (`undefined`, `function`, …). `string` is permissive —
a number or boolean is accepted and stringified, which is what makes
`{ title: 2026 }` in a config file a non-error.

The shared props (`site`, `page`, `nav`, `content`, `children`, …) are always
available and never need declaring.

## Plugins

A plugin is one file exporting `setup(jprot)`. See
[Plugins](customization.md#13-plugins) for the user-facing guide; the shape is:

```js
export default {
  name: 'analytics',
  setup({ addComponent, addRoute, on, extendMarkdown, config }) {
    on('html:head', (html) =>
      html.replace('</head>', `  <script defer src="/_a.js"></script>\n</head>`))
  },
}
```

Every hook is listed with its arguments in `HOOKS` (`core/plugins.js`), so the
docs, `jprot.d.ts` and the error message for a typo all come from one source.
`on('htlm:head')` fails at setup time, loudly, rather than silently never firing.

Two guarantees make plugins safe to add:

- **A broken plugin never takes the site down.** Import and `setup()` are both
  wrapped; the failure is reported through `jprot check` so CI catches it
  instead of a blank page.
- **A plugin is all-or-nothing.** Each plugin writes into a private staging
  area that is committed only when `setup()` returns. A plugin that throws
  halfway through leaves no half-registered component, route, or hook behind.

## The state object

Running state (content dir, theme dir, site config, loaded components, plugin
registries, prod flag) is held in a small module-level store so the handler
functions stay clean and reusable — hot-reload rebuilds this store in place.

## Config sources (priority order)

1. `config` passed programmatically to `createJprot()`
2. `jprot.config.js`
3. `jprot.config.json`
4. Empty defaults

Right after loading, the server validates the config against the schema in
`core/schema.js` and prints **startup hints**: unknown `sections[].component`
names (with the available list) and config keys that look like typos (with a
did-you-mean suggestion).

`jprot check` runs the same validation from the command line, with file:line
positions, and additionally verifies each declared plugin resolves, imports, and
completes `setup()`. `jprot.d.ts` catches type errors in the editor; `jprot
check` catches them in CI.

## Export vs. deploy

These used to be one file, and mixing them is how a base-path bug survives for
months. They are now separate questions:

- **`core/deploy.js` — where does the site live?** `normalizeBasePath()`,
  `deployUrlFor()`, and a `createDeployment()` object that knows how to rewrite
  HTML, the search index, and the PWA manifest for a given base path and origin.
- **`core/export.js` — what gets written?** It asks for the page URLs from the
  deployment and writes them out.

Changing where you publish no longer means auditing the export walk.

## Server behavior

Every request flows through the same pipeline in dev, production (`--prod`) and
`jprot export` — the exported site is literally the recorded output of this
server, so a preview always matches what gets deployed.

**URL canonicalization** — duplicate URL forms collapse to one:

- `/page.md` → `301 /page` (`.md` links keep working from READMEs/editors
  without serving duplicate content)
- `/page/` → `301 /page` (trailing slashes collapse; `/`, `/index.html` and the
  homepage stay untouched)
- Redirect `Location` headers are root-relative, so they stay on whatever
  origin the visitor used (dev server, proxy, IPv6 literal) instead of leaking
  the production `site.url`
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

## The watcher

The dev server does not rebuild because *something* changed — it classifies the
change first, so the answer to "rebuild or not?" is a tested function rather than
a guess inside a callback:

| Change | Rebuild? | Why |
|---|---|---|
| `jprot.config.js` | yes, full | The whole state derives from it |
| `theme/**` | yes | Components and CSS |
| `content/**` | yes | Re-parse through the graph |
| `public/**`, `content/**` assets | no | Served straight from disk |
| `dist/`, `node_modules/`, `.git/`, `.next/`, `coverage/` | no | Build output, dependencies, VCS metadata |

Excluding `dist/` is not cosmetic: without it, `jprot export` writes files that
wake the watcher, which rebuilds, which writes more files.

## Testing

`npm test` runs `node --test` over two suites plus committed snapshots:

```
test/
  unit/          graph, deploy, watch, plugins, markdown, render, frontmatter…
  integration/   server, export, lint, scaffold, catalog, snapshots
  helpers/       makeSite(), page(), captureLogs(), matchSnapshot()
  snapshots/     7 pages + 7 endpoints, committed and reviewed
  fixtures/      shared sample content
```

`matchSnapshot()` normalizes the things that legitimately change between runs —
the CSP nonce, the dev-server origin port, `<lastmod>`, `<lastBuildDate>`, and
`"date":"YYYY-MM-DD"` — so a nightly run does not fail on a clock tick. Review a
snapshot diff the way you would review any other change; `npm run test:update`
rewrites them when a change is intended.

## Why this design

- **No build** → the "pipeline" is a request handler, not a precompiled artifact.
- **One graph** → routing, search, sitemap, feed and lint can never disagree
  about what pages exist.
- **Overrides over config** → you don't fight a theme object; you replace components.
- **A small plugin surface** → everything a plugin can reach is something we can
  promise across a major version.
- **Few files, one question each** → easy to read, fork, and extend with your own
  layouts.
- **One component system** → sections, shortcodes and layouts call the same functions.

Next: [Comparison](comparison.md).
