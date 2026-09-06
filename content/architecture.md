---
title: Architecture
order: 6
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

## Why this design

- **No build** → the "pipeline" is a request handler, not a precompiled artifact.
- **Overrides over config** → you don't fight a theme object; you replace components.
- **Few files** → easy to read, fork, and extend with your own layouts.
- **One component system** → sections, shortcodes and layouts call the same functions.

Next: [Comparison](comparison.md).