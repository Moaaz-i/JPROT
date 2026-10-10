# Architecture

JPROT is two halves: a **pure layer** that turns text into HTML, and a
**runtime** that reads a project from disk, assembles pages, and serves them.
Everything else in this document is a consequence of keeping those two apart.

```
lib/   Markdown → HTML, frontmatter, and the shared text helpers
core/  reading content/, building pages, serving them, and the commands
```

## The rule

Three invariants, each one a thing that is easy to break by accident:

1. **`lib/` never imports `core/`.** It takes nothing from the filesystem but
   its own files, holds no config and no request state. This is why the spec
   suite and the round-trip harness can exercise the engine directly.
2. **A layer imports only itself and the layers below it.** No cycles, ever —
   a cycle makes module initialization order unknowable, which is the sort of
   bug that only appears in production and never in the file that caused it.
3. **`theme/` reaches `lib/` and nothing else.** A theme is *user* code. The
   moment it can reach into `core/`, the runtime's internals become public API.

All three are enforced by `test/unit/architecture.test.js`. They fail the build
rather than waiting to be rediscovered.

## The layers

| Layer | Folder | May import |
|---|---|---|
| pure | `lib/` | `node:` builtins and itself |
| foundation | `core/foundation/` | `lib/` |
| runtime | `core/runtime/` | `foundation/`, `lib/` |
| content | `core/content/` | `foundation/`, `lib/` |
| site | `core/site/` | `tooling/`, `content/`, `runtime/`, `foundation/`, `lib/` |
| tooling | `core/tooling/` | `content/`, `runtime/`, `foundation/`, `lib/` |
| entry | `core/*.js` | anything |
| theme | `theme/` | `lib/` |

Read the table as a promise about *reading order*: if you open a file in
`core/content/`, nothing it imports will pull in an HTTP server, a watcher, or a
CLI.

### What is in each folder

**`core/foundation/`** — the things every other layer needs and nothing else
decides: `urls.js`, `state.js` (per-request state via `AsyncLocalStorage`),
`http.js` (the entire header/CSP policy), `config.js`, `version.js`. Small files
that import only `lib/`.

**`core/runtime/`** — machinery that runs alongside a request rather than
answering it: `plugins.js` (the hook API), `plugins-api.js`, `watch.js`
(dependency-aware file watcher), `scripts/` — the four client-side scripts
(`scroll`, `theme`, `search`, `spa`), one file each, exported through an index
so callers name the page concern rather than the file.

**`core/content/`** — reading a project and understanding it:
`scan.js` (directory walk plus the mtime/size cache), `extract.js` (what one
file yields: links, headings, slug, date, excerpt), `graph.js` (assembling those
into the Content Graph), `render.js` (shortcodes and sections), `components.js`
(the `:::Name` contract), `schema.js` (config validation), `jsonld.js`.

**`core/site/`** — answering requests: `app.js` (the request lifecycle),
`page.js` (one file → one complete HTML document), `endpoints.js` (sitemap,
robots, llms.txt, RSS), `assets.js`, `og.js`, `notfound.js`.

**`core/tooling/`** — what a command does: `scaffold.js` (`init`/`new`/`g`),
`templates.js` (the strings those commands *write*, as pure data), `lint.js`,
`check.js`, `deploy.js`, `catalog.js`.

**`core/` (entry points)** — `cli.js`, `server.js`, `export.js`. Only wiring.

## Entry points

```js
import { createJprot, exportSite, runLint } from 'jprot'   // → core/server.js
```

`core/server.js` is the package's **barrel**: it re-exports the public API and
holds no implementation. It used to hold the server as well, and that is the
only reason this codebase ever had an import cycle — `export.js` needs
`createJprot` to run a server in-process while `server.js` re-exported
`exportSite`, so the entry point imported its own export path. The request
lifecycle now lives in `core/site/app.js`, and a barrel that nothing imports
cannot form a cycle.

`export.js` therefore imports `createJprot` from `./site/app.js`, not from
`./server.js`.

## A request, start to finish

```
GET /docs/getting-started/
  core/site/app.js        route, security headers, nonce, CSP          (foundation/http.js)
      │
      ├─ endpoints.js     if the path is sitemap.xml / robots / llms / RSS
      ├─ assets.js        if it is a file under public/ or a fingerprinted CSS
      └─ page.js          otherwise: one file → one HTML document
            ├─ content/graph.js     which file, and everything already known about it
            │    ├─ scan.js         read + parse, cached by mtime/size
            │    └─ extract.js      links, headings, slug, excerpt, tags
            ├─ content/render.js    sections + :::Name shortcodes
            ├─ lib/markdown.js      Markdown → HTML
            ├─ runtime/scripts/     scroll / theme / search / spa, if the page wants them
            ├─ content/jsonld.js    schema.org
            └─ site/og.js           the share card
```

Every arrow points downward in the layer table, which is why the diagram has no
crossings.

## Change this → edit that

| You want to… | Start in |
|---|---|
| change how paragraphs, lists or fences are parsed | `lib/markdown/blocks.js` |
| change emphasis, code spans, inline links | `lib/markdown/inline.js`, `links.js` |
| change HTML escaping or URL safety | `lib/markdown/sanitize.js`, `lib/utils.js` |
| change the `---` frontmatter fence | `lib/frontmatter.js` |
| change what `:::Name attr="v"` does | `content/render.js` + `content/components.js` |
| change the Content Graph or a query over it | `content/graph.js` (then `scan.js` / `extract.js`) |
| change the HTML shell or `<head>` | `site/page.js` + `theme/` |
| add a machine endpoint (a feed, a manifest) | `site/endpoints.js` |
| add a config key | `content/schema.js` (`CONFIG_KEYS`) — validation and hints read one list |
| change CLI commands | `tooling/scaffold.js`, `lint.js`, `check.js`, `deploy.js` |
| change what `jprot init` writes | `tooling/templates.js` |
| change a page's JavaScript | `runtime/scripts/<name>.js` |
| change headers, CSP, frame policy | `foundation/http.js` — one place, by design |
| add a plugin hook | `runtime/plugins.js` (`HOOKS`) — the test in `unit/plugins.test.js` requires it to be fired |

## Why the files are where they are

Non-obvious placements, so they are not "fixed" later:

- **`lib/utils.js`, not `core/foundation/utils.js`.** `esc`, `safeHref` and
  `slugify` are shared by `lib/`, `core/` *and* `theme/`. Keeping them in `core/`
  would have made `lib/` depend on `core/`, so they moved down a layer. One
  definition, three consumers, no upward arrow.
- **`server.js` is 50 lines.** Not a mistake — see *Entry points* above.
- **`site/app.js` may import `tooling/`.** The dev server reports config hints
  and lint results over HTTP. `tooling/` never imports `site/`, so this is a
  one-way link and cannot cycle.
- **Templates are data.** `tooling/templates.js` holds no control flow, so a
  scaffolded file can be read without reading the scaffolding around it.
- **`scripts/` is a folder, not a file.** Four independent template strings
  shared only the `nonce` convention; at 470 lines they were the hardest thing
  in the server to review.

## Guarantees worth knowing

- **No file is over 500 lines.** The largest is `core/site/app.js` at 491.
- **Zero import cycles** in `core/` and `lib/`, checked on every run.
- **`jprot check`** validates the project's own config; `npm test` covers
  unit, integration and the architecture rules above.

If you add a file, put it in the folder whose row in the table above matches
what it imports — not what it is *called*. The test will tell you if you guessed
wrong.
