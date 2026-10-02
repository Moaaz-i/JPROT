---
title: Plugins and hooks
description: Extend JPROT with a plugin file. Every hook, copy-pasteable examples, and how a failing plugin is handled.
order: 6
nav: Plugins
---

A plugin is one JavaScript file. It runs at startup, and everything it does —
registering a hook, adding a component, declaring extra Markdown — happens before
the first page is rendered. There is no plugin API to learn beyond the list of
hooks below, and no plugin in the shipped examples does more than register a hook
or two.

Plugins are optional. Everything on a JPROT site works with none installed.

## Enable a plugin

Point `plugins` at a file in `jprot.config.js`. Paths are relative to the
project root, and the file may be anywhere outside `content/`:

```js
// jprot.config.js
export default {
  title: 'My site',
  url: 'https://example.com',
  plugins: ['./plugins/obsidian-sync.js'],
}
```

`plugins` is an array of specifiers. A bare string is **not** shorthand — the
loader reads `Array.isArray(config.plugins)`, so a lone string is ignored
silently. Use `plugins: ['./plugins/one.js']`, with the brackets.

Each specifier can be a project-relative path, a bare package name, an absolute
path, or a `file:` URL. A `plugins/` directory at the project root is not
scanned implicitly — every plugin is listed, so the set of code that runs is
visible in one place.

A plugin that throws while loading, or while running `setup()`, is reported and
skipped. The rest still load and the site still serves:

```
[jprot] plugin "./plugins/obsidian-sync.js" threw during setup(): ReferenceError: OBSIDIAN_VAULT is not defined
```

## A complete plugin

This is the whole file, and it does something real: it adds a reading-time
`<meta>` to every page's `<head>`, and echoes a reading time the page declared in
its own front matter as a comment at the end of `<body>`.

```js
// plugins/build-meta.js
const WORDS_PER_MINUTE = 220

/**
 * Prose word count for a page's *rendered* HTML, so it is the reading time a
 * reader actually experiences. Fenced code and inline spans are dropped because
 * nobody reads a code block at 220 words a minute.
 */
function readingTime(html) {
  const words = String(html || '')
    .replace(/<pre[\s\S]*?<\/pre>/g, ' ')  // a code block is not prose
    .replace(/<code[\s\S]*?<\/code>/g, ' ') // nor is an inline span
    .replace(/<[^>]+>/g, ' ')              // nor is markup
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`
}

export default function buildMeta({ on }) {
  // `html:head` and `html:body-end` both receive `(html, page)`, where `page` is
  // this page's entry: `page.url`, `page.data` (its front matter), `page.body`
  // (its rendered HTML) and `page.src` (its path in `content/`). `html:head` runs
  // before `html:body-end`, so a value one computes for the other has to be
  // stashed on the page or in module scope.
  on('html:head', (html, page) => {
    const meta = `  <meta name="reading-time" content="${readingTime(page.body)}">\n`
    return html.replace('</head>', `${meta}</head>`)
  })

  on('html:body-end', (html, page) => {
    // `page.data` is the front matter. Only say this on a page that opted in, so
    // the site does not end up with the line on every index and 404.
    if (!page.data?.readingTime) return
    const line = `\n  <!-- reading time: ${page.data.readingTime} -->\n`
    return html.includes('</body>') ? html.replace('</body>', `${line}</body>`) : html
  })
}
```

Two things to notice.

**A hook that returns nothing is fine for `html:head` and `html:body-end`.** They
are injection points: the default split still happens. A returned string is only
used if it contains the closing tag, so a handler that returns a fragment cannot
accidentally delete the rest of the document.

**`html:page` is different.** It can replace the whole document, so it is used
when you need to build a page shell yourself.

The values above are the page entry's own fields, so they depend on the entry
being passed as `page`. If you need the whole site graph instead, register a
`state:build` handler — that one receives the full render state, including
`state.graph.searchIndex` and the resolved `state.contentDir`.

## Every hook

| Hook | Arguments | Return | When it runs |
| --- | --- | --- | --- |
| `state:build` | `state` | — | Before the state is frozen. Inspect or extend it. |
| `components:load` | `components` | — | After plugins have added components, before the theme registry wins. |
| `html:page` | `html`, `page` | `html` | A rendered page, before it is written out. Can replace the document. |
| `html:head` | `html`, `page` | `html` | Injection point inside `<head>`. |
| `html:body-end` | `html`, `page` | `html` | Injection point before `</body>`. |
| `endpoint:json` | `data`, `path` | `data` | `search.json`, `manifest.json`. |
| `build` | `state` | — | A state build finished, after the state is frozen. |
| `export` | `dest` | — | `jprot export` finished writing to `dest`. |

`state:build` and `build` get the same object. The difference is timing:
`state:build` runs before the state is frozen and installed, `build` after. Use
`state:build` when later hooks need to see your change.

A handler that throws is caught, reported as
`[jprot] plugin "html:page" hook failed: …`, and skipped. One bad plugin does not
take the site down, and it does not stop the other plugins' hooks from running.

## Three things worth copying

### Mirror blog posts into an Obsidian vault

Useful when you write elsewhere and publish here, or want your posts searchable
in a notes app. The `export` hook runs once, after the static export finishes, so
it can see what was actually written.

```js
// plugins/obsidian-mirror.js
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'

export default function obsidianMirror({ on }) {
  // The render state is not an argument to `setup`, so a hook that needs it takes
  // it here and keeps it. `state:build` runs before the state is frozen, which is
  // the point to capture it.
  let state = null
  on('state:build', (s) => { state = s })

  on('export', async (dest) => {
    const vault = process.env.OBSIDIAN_VAULT
    // No vault configured is the normal case, not an error — the plugin is inert
    // until someone sets the variable, so nobody has to remove it from `plugins`.
    if (!vault) {
      console.warn('[obsidian-mirror] OBSIDIAN_VAULT is not set; nothing mirrored')
      return
    }

    // `state.blogDir` is the resolved `content/blog` path, so there is no path
    // guessing here and it follows the site config if `blogDir` is moved.
    const posts = state.blogDir
    const out = join(vault, 'Published')
    await mkdir(out, { recursive: true })

    for (const name of await readdir(posts)) {
      if (!name.endsWith('.md')) continue
      const body = await readFile(join(posts, name), 'utf8')
      // Obsidian wants YAML front matter, which is what the source already has.
      await writeFile(join(out, basename(name, '.md') + '.md'), body, 'utf8')
    }

    console.log(`[obsidian-mirror] mirrored ${dest} to ${out}`)
  })
}
```

Note what this does *not* do: it does not intercept the page renderer. Writing
files once, at the end, is cheaper than a per-page hook and cannot slow down a
page load.

### Redirect old URLs

The other thing plugins are genuinely good for: a site outlives its URL scheme.
`addRoute` matches its path exactly and sits ahead of the content router, so a
route can only ever shadow a page on purpose.

```js
// plugins/redirects.js
// Old path -> new path. Keep this file; delete entries as the old URLs age out.
const MOVED = {
  '/blog': '/writing',
  '/posts/hello-world': '/writing/hello-world',
  '/docs/install': '/quick-start',
}

export default function redirects({ addRoute }) {
  for (const [from, to] of Object.entries(MOVED)) {
    addRoute(from, (req, res) => {
      res.writeHead(301, { location: to })
      res.end()
    })
  }
}
```

`301` is permanent and is what search engines want for a moved page. Use `302` if
the move is temporary — a redirect you later undo is much easier to walk back
from as a temporary one.

### A custom 404 page is content, not a plugin

Worth saying plainly, because it is the most common plugin that does not need to
exist. Create **`content/404.md`** and JPROT serves it, with a `404` status, in
place of the built-in page. It goes through the normal page pipeline, so front
matter, sections, components and every hook above apply to it.

```markdown
---
title: Page not found
description: That page is not here.
---

# That page is not here

It may have moved, or the link may have a typo in it.

[Back to the home page](/)
```

The one thing a plugin cannot reach is the *built-in* fallback. When there is no
`content/404.md`, that document is written straight to the response rather than
rendered as a page, so no `html:*` hook runs for it. If you need to change it,
provide the content file.

## Adding to the API

`on()` is the whole event API. The rest of the plugin argument is for the things
that are not events:

```js
export default function myPlugin({ on, addComponent, addRoute, extendMarkdown, config }) {
  // Declare a hook.
  on('html:body-end', (html) => html)

  // Add a layout component, used from `content/` as {{MyCard}}.
  addComponent('MyCard', { title: 'Untitled', body: '' })

  // Change the Markdown feature flags.
  extendMarkdown({ defaults: { footnotes: false } })

  // Serve a custom endpoint ahead of the content router. The handler gets
  // (request, response, url); the path is matched exactly, so a plugin can never
  // shadow a content page by accident.
  addRoute('/feed.xml', (req, res) => {
    res.writeHead(200, { 'content-type': 'application/xml' })
    res.end('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>')
  })
}
```

### Markdown extensions

`extendMarkdown` takes two things.

`defaults` patches the feature flags: `footnotes`, `autolinks`, `taskLists`.
Any flag set to `false` switches that feature off for the whole site.

`extensions` is a list of functions that each receive the page's **Markdown
source** and return the source to render instead. They run in registration order
and before the source is split into lines, so a rewrite can change structure — a
heading level, a list marker — and not just inline text.

```js
// Expand `[[wiki-page]]` into a link before anything reads it.
extendMarkdown({
  extensions: [
    (source) => source.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, target, label) => `[${label || target}](/wiki/${target.toLowerCase()})`),
  ],
})
```

An extension that throws is reported as
`[jprot] markdown extension failed: …` and skipped, and the extensions after it
still run. An extension that returns something other than a string is ignored
with a warning, so the common slip of `s => { doSomething() }` — which returns
`undefined` — cannot replace the document with the word "undefined".

This is the one plugin capability that is not an `on()` hook. It has no
`state:build` timing to reason about, and it runs once per page render, before
any `html:*` handler.

## Checking a site

`jprot check` reports each plugin and what its `setup()` registered:

```
⚠ check: jprot.config.js is valid with 2 warning(s)
  ⚠ plugins["build-meta"] — registers hooks html:head, html:body-end
    /srv/site/plugins/build-meta.js
  ⚠ plugins["obsidian-mirror"] — registers hooks state:build, export
    /srv/site/plugins/obsidian-mirror.js
```

A plugin that registered nothing is listed as `loaded, registers nothing`, which
is the fast way to find the file you meant to point at but did not. A plugin that
failed to load is an **error** rather than a warning, and `check` exits non-zero:

```
✖ check: 1 error(s) in jprot.config.js
  ✗ plugins["broken"] — nope
    /srv/site/plugins/broken.js
```

So a broken plugin shows up in a check rather than only in a build log.

## When a plugin is not the right tool

Reach for a plugin only when the thing you want cannot be expressed as content,
configuration, or a theme override. Most "customizations" are one of:

- **Content** — a page in `content/`, with front matter.
- **A section** — a configured block on the home page, not a hook.
- **A component** — a partial you override in `theme/`, which needs no code.
- **CSS** — a variable in `theme/custom.css`.

Hooks run on every page render, so a plugin in the request path is the most
expensive place to do work. `export` runs once; `html:page` runs per page. If the
job is per-page, prefer `html:head` over `html:page`, and prefer either over a
Markdown extension.

See also [Customization](customization.md) for the no-code path, and
[API reference](api-reference.md) for using JPROT directly from Node.
