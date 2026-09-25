---
title: Customize your site
description: Change the look, layout, components, sections, and search behavior without a build step.
order: 5
nav: Customize
---

JPROT can be restyled entirely from CSS variables, or pushed further by
replacing whole layout components.

For a documentation site, set `docs: true` and `sidebar: true` in
`jprot.config.js`. Regular pages then get breadcrumbs, an on-page table of
contents, and previous/next navigation. Portfolio sites can leave `docs` off.

Markdown callouts use a blockquote marker:

```markdown
> [!TIP] Keep your first site small while you learn the content model.
```

Use `NOTE`, `TIP`, `WARNING`, or `DANGER`. Fenced code blocks include a
client-side **Copy** button automatically.

## 1) Restyle with CSS variables (easiest)

Create or edit **`theme/custom.css`** (already exists in the project). It loads automatically after the theme. Redefine any variable:

```css
:root {
  --color-accent: #e11d48;
  --color-bg: #0f172a;
  --color-text: #e2e8f0;
  --color-surface: #1e293b;
  --color-border: #334155;
  --font-sans: "Inter", system-ui, sans-serif;
}
```

### All built-in variables (`theme/default/styles.css`)

| Variable | Default | Purpose |
|---|---|---|
| `--color-bg` | `#ffffff` | Page background |
| `--color-surface` | `#f7f7f9` | Cards & blockquote background |
| `--color-text` | `#1a1a1a` | Main text |
| `--color-muted` | `#6b7280` | Secondary text |
| `--color-accent` | `#4f46e5` | Brand color |
| `--color-accent-contrast` | `#ffffff` | Text on accent |
| `--color-border` | `#e5e7eb` | Borders & dividers |
| `--color-code-bg` | `#f3f4f6` | Code background |
| `--font-sans` | system | Body font |
| `--font-mono` | monospace | Code font |
| `--font-size` | `17px` | Base font size |
| `--container-width` | `920px` | Max content width |
| `--radius` | `12px` | Corner radius |

## 2) Add your own CSS rules

`custom.css` is plain CSS. You can add classes, override defaults, or target any element:

```css
.hero-title {
  font-weight: 800;
  letter-spacing: -0.02em;
}
```

## 3) Replace a component (full layout control)

Every part of the UI is a component. Drop a file with the same name into **`theme/components/`** to replace the built-in one:

```
theme/components/
  Header.js    ← top bar
  Footer.js    ← footer
  Layout.js    ← overall shell
  Home.js      ← homepage template
  Page.js      ← regular page template
```

### How a component works

Each component is a function that receives `props` and returns HTML as a string:

```js
// theme/components/Header.js
export default function Header({ site, nav, page }) {
  return `
    <header>
      <a href="/">${site.title}</a>
      <nav>
        ${nav.map(n => `<a href="/${n.url}">${n.label}</a>`).join('')}
      </nav>
    </header>
  `
}
```

### Available props

| Prop | Description |
|---|---|
| `site` | The whole `jprot.config.js` object |
| `page` | Current page: `data`, `body`, `slug`, `url` |
| `nav` | Navigation array: `[{ label, url, order }]` |
| `content` | Rendered HTML of the current page body |
| `projects` | Projects list for the homepage |
| `posts` | Blog posts list (on `blog` layout pages) |
| `sectionsHtml` | Already-rendered portfolio sections markup |
| `children` | Rendered Markdown of a `:::Name … :::` shortcode body (nested) |

## Example: a custom Footer

```js
// theme/components/Footer.js
export default function Footer({ site }) {
  return `<footer style="text-align:center;padding:1rem">
    © ${new Date().getFullYear()} ${site.title}
  </footer>`
}
```

Save it, refresh — done. See ready-made samples in the [Examples](examples.md)
page and the `examples/` folder.

## Everything is config-first

Before writing components, check if the behaviour you want is already a
config option — most built-in surfaces are:

| You want to change | Use |
|---|---|
| Colors, fonts, spacing | CSS variables in `theme/custom.css` |
| Header/footer/homepage HTML | Replace `Header` / `Footer` / `Home` components |
| Docs sidebar | `sidebar: false` (global) or `sidebar: false` in a page's frontmatter |
| Any visible text / translate the UI | `labels` in `jprot.config.js` (see [Configuration](configuration.md#labels-every-built-in-text-is-overridable)) |
| Blog/projects folders | `blogDir`, `projectsDir` |
| Which layout a page uses | `layout:` in frontmatter, or `homeLayout` / `defaultLayout` |
| 404 page | Create `content/404.md` |
| Search placeholder / empty text | `labels.searchPlaceholder`, `labels.searchEmpty` |
| Nav links | `nav` array or per-page `nav` frontmatter |
| A component inside a Markdown page | A `:::Component` shortcode (see section 6) |
| A whole new component fast | `jprot g component <Name> --palette …` |
| Extra `<head>` tags | `head` config |
| Analytics, a custom endpoint, cross-page behaviour | A [plugin](#13-plugins) |

A theme can also ship a `theme/main.js` that declares `defaultHome`,
`defaultPage` and `name` — those set the default layouts used when the config
does not override them:

```js
// theme/main.js
export default { name: 'my-theme', defaultHome: 'Home', defaultPage: 'Page' }
```

## 4) Dark mode

The default theme ships with a **light/dark toggle** in the header (the ◐
button). It saves your choice locally and falls back to your OS preference.

To customize the dark palette, redefine the vars under `[data-theme="dark"]` in
your `custom.css`:

```css
[data-theme="dark"] {
  --color-bg: #0f1115;
  --color-accent: #7b8cff;
}
```

## 5) Portfolio sections

The homepage is composed of **sections** — see
[Configuration → Sections](configuration.md#sections-the-portfolio-builder).
Each section is a component, so you can restyle or replace any of them the
same way:

```
theme/components/
  Stats.js          ← number strip
  Skills.js         ← skill bars
  Experience.js     ← timeline
  Testimonials.js   ← quote cards
  Gallery.js        ← image grid
  Contact.js        ← contact bar
```

Or add your own and reference it by name from `jprot.config.js`:

```js
sections: [
  { component: 'Hobbies', title: 'Hobbies', items: ['Reading', 'Cycling'] },
],
```

```js
// theme/components/Hobbies.js
export default function Hobbies({ title, items }) {
  return `<section><h2>${title}</h2><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></section>`
}
```

Anything that returns an HTML string works — a section component is just a
function that receives its section config + shared props.

## 6) Shortcodes — components inside any Markdown

Every registered component is callable **inline** in any page with a
`:::Name` block — no config, no frontmatter, no page rewrite:

```markdown
:::CTA title="Join the beta" text="Shipping in February." label="Register" url="/beta"

Anything **Markdown** you write here is rendered and handed to the component
as the `children` prop. Shortcodes nest, and this one lives *inside* the body
of a post, not in the config.

:::

:::Stats items='[{"value":15,"label":"Projects shipped"},{"value":99,"label":"Satisfaction"}]'
```

### Attribute values

Attributes support the common shapes without quoting gymnastics:

| Shape | Example | Passed to the component as |
|---|---|---|
| string | `title="Hello world"` | `"Hello world"` |
| quote styles | `text='single ok'` or `text="double ok"` | string, quotes stripped |
| number | `level=90` | `90` (a real number) |
| boolean | `draft=true` | `true` |
| JSON | `items='[{"name":"JS","level":90}]'` | real array/object |

### Rules of thumb

- The block opens with `:::Name` (name = the component filename) and closes
  with a lone `:::` line.
- The inner body is Markdown-rendered and arrives as `children` — a section
  component that prints `p.children` gives you **layout inside Markdown**.
- Unknown `:::Names` render a visible `.jprot-shortcode-missing` hint on the
  page plus a terminal warning — a typo never 500s the page.
- Fenced code blocks are respected: a ``` `:::Noise` ``` inside a code fence
  stays literal.
- Homepage `sections` and `:::shortcodes` share the same component registry,
  so `jprot g component Hobbies` makes `:::Hobbies` work instantly.

### Scaffold a component (`jprot g component`)

```bash
jprot g list                            # palettes: section, cards, cta, stats
jprot g component Hobbies --palette cards   # → theme/components/Hobbies.js
```

The generated component is self-contained (own HTML escaping, no imports) and
works both as a config `section` and as a `:::Hobbies` shortcode immediately.

### Markdown components — no JavaScript

If a component is mostly its **values** (a title, some text, a list), you can
write it as a plain Markdown file instead of a JS function:

```bash
jprot g component Hobbies --palette section --format md   # → theme/components/Hobbies.md
```

```md
---
title: Section title
subtitle: A short descriptor.
items: []
---

## [title]

[subtitle]

[items]
```

How it works:

- The file's **frontmatter is the component's default values**; the body is Markdown.
- `[value]` placeholders are filled from those defaults, then overridden by the
  section config or the shortcode attributes at the point of use:

  ```js
  sections: [ { component: 'Hobbies', title: 'هواياتي', items: ['القراءة', 'التصوير'] } ],
  // or inline:
  :::Hobbies title="هواياتي" items='["القراءة", "التصوير"]'
  ```

- Arrays become bullet lists, objects become JSON, and Markdown does its normal
  rendering (escaping included) — no manual HTML to maintain.
- Every Markdown component is automatically wrapped in `<div class="md-component-<Name>">`,
  so you can style it entirely from `theme/custom.css` without touching HTML —
  see the styled `Spotlight` example in `examples/components/`.
- Rules that keep it predictable: only placeholders matching an actual key are
  replaced (a Markdown link like `[title](https://…)` is left alone), and a
  leading backslash escapes one: `\[title]` stays literal.
- `.md` and `.js` components share the same registry, so both work as sections
  and `:::Name` shortcodes; a `.js` file always wins over a `.md` file of the
  same name (`loadComponents` merges in that order).

## 7) Blog

Drop Markdown files into `content/blog/` and create a `blog` page
(`layout: blog`) to list them:

```
content/
  blog.md                            ← listing page (layout: blog)
  blog/
    hello-world.md                   ← a post, rendered at /blog/hello-world
```

Posts appear newest-first, with date, tags and excerpt from frontmatter.

## 8) Docs sidebar

On regular (non-home, non-blog) pages, JPROT renders a **sidebar** with the
site navigation plus an auto-generated "On this page" list pulled from your
headings (with live scroll-spy as you scroll). Disable it globally with
`sidebar: false` in the config, or per page with `sidebar: false` in
frontmatter.

With `docs: true` in the config, the sidebar uses a **full reading order** —
every content page including nested ones (e.g. `guide/nested.md`), sorted by
frontmatter `order` — and regular pages get breadcrumbs and previous/next
links. Blog posts and project entries are excluded from this tree. The compact
navbar stays user-controlled via `site.nav`.

Headings are auto-linked with slug ids, so anchors like `#section-4` just work.
On mobile the sidebar slides in via the ☰ button.

## 9) Header & mobile menu

The header sticks to the top and shows: brand, nav links, and the action
buttons (sidebar ☰, search, theme ◐, variant ◈). On screens up to **640px** the
nav links **automatically** collapse into a **hamburger menu** — a ☰ button in
the header opens a full-width dropdown below the bar. It closes when you pick a
link, tap outside the header, or press `Esc`. It's pure CSS + a few lines of
JS, needs zero config, and only appears when there are actually nav links to
show. Replace the `Header` component if you ever need a different layout.

## 10) Instant search

A **search** button (🔍) in the header opens a modal that indexes **every
byte** of every page — no config needed. Type to filter by title, excerpt, URL,
date, tags, **full page text (including code blocks)**, all frontmatter data, and
the site config. Matches are highlighted (`<mark>`) and show a contextual
snippet from the body.

- Built from `/@jprot/search.json` (generated on the fly; the homepage and
  config-driven text are included too).
- Keyboard: `Cmd/Ctrl + K` opens it, `Esc` closes.
- Search results are normal links, so they work as full page loads.

## 11) SEO & feeds

Everything is served automatically:

| Route | What it provides |
|---|---|
| Canonical + `<meta name="robots">` | On every page; `noindex` per page via frontmatter |
| `/sitemap.xml` | Sitemap of every page (`site.url`, git-aware `lastmod`, `<image:image>`) |
| `/feed.xml` (`/rss.xml`) | RSS feed of your blog posts |
| `/robots.txt`, `/llms.txt`, `/llms-full.txt` | Crawlers + LLM-friendly indexes (homepage + every page, full Markdown in the `-full` variant) |
| `/@jprot/search.json` + `/manifest.json` | Client search index, PWA manifest |
| No extra route | Open Graph + Twitter card meta tags (+ `og:logo`, hreflang, JSON-LD) |
| 404 → `/` | A styled, themed 404 page |

Set `url` in the config to a canonical domain to fill in sitemap/OG URLs. Mark
a page `draft: true` to keep it out of every public surface (plus `404` in
`--prod`/exports); `noindex: true` to keep it online but invisible to search.
Customize further with `searchUrl`, `twitter`, `ogLocale`, `sameAs`,
`alternateLangs`, `logo`, `ogImage` — see [Configuration](configuration.md).

## 12) Printable Resume

Create a page with `layout: resume` and fill its frontmatter — JPROT renders a
clean CV with a **Download / Print** button:

```md
---
title: Resume
layout: resume
name: Jordan A. Developer
role: Senior Web Developer
email: jordan@example.com
experience:
  - title: Senior Developer
    company: Acme Inc.
    period: 2022 — Now
education:
  - title: MSc Computer Science
    school: University of Technology
    period: 2016 — 2018
---
```

Body Markdown appears below the header; frontmatter fields map to blocks.

## 13) Plugins

A plugin is **one file** that exports a `setup(jprot)` function. It is the escape
hatch for anything the config and components don't cover — analytics, a custom
endpoint, a new Markdown rule, wrapping a built-in component.

```js
// plugins/analytics.js
export default {
  name: 'analytics',
  setup({ on }) {
    on('html:head', (html) =>
      html.replace('</head>',
        `  <script defer src="/_analytics.js" data-site="me"></script>\n</head>`))
  },
}
```

```js
// jprot.config.js
export default { plugins: ['./plugins/analytics.js'] }
```

Save, refresh — the plugin runs on the next state build. `jprot check` verifies
it loads; see the [CLI reference](cli-reference.md#validating-configuration-check).

### What a plugin can do

`setup(jprot)` receives one object. Everything a plugin can reach is a method on
it, which is what lets JPROT promise the surface across major versions.

| Method | What it does |
|---|---|
| `addComponent(name, fn)` | Register a component, used by `sections`, layouts, **and** `:::Name` shortcodes. Applied after the theme's own, so re-using a built-in name intentionally overrides it. |
| `addRoute(path, handler)` | Serve a response at an exact path, ahead of the content router. A plugin can never shadow a content page by accident. |
| `extendMarkdown({ defaults, extensions })` | Patch Markdown feature flags and add extra renderers. |
| `on(hook, handler)` | Subscribe to a build or render event. |
| `config` | The loaded `jprot.config.js`, for reading the plugin's own options. |

### Hooks

```js
setup({ on }) {
  on('html:page', (html, page) => html)      // transform a finished page
  on('html:head', (html, page) => html)      // inject into <head>
  on('html:body-end', (html, page) => html)  // inject before </body>
  on('endpoint:json', (data, path) => data)  // add keys to search.json / manifest.json
  on('components:load', (components) => {}) // add or wrap components
  on('state:build', (state) => {})          // inspect the render state
  on('build', () => {})                     // any state build, before rendering
  on('export', (dest) => {})                // a static export finished writing
}
```

`html:*` and `endpoint:*` handlers **return** the new value. The rest are
fire-and-forget. A misspelled hook name fails immediately:

```
[jprot] plugin "analytics": unknown hook "htlm:head" — available hooks: state:build, components:load, …
```

### A component plugin

```js
// plugins/reading-time.js
export default {
  name: 'reading-time',
  setup({ addComponent }) {
    addComponent('ReadingTime', ({ content }) => {
      const words = String(content || '').replace(/<[^>]+>/g, ' ').split(/\s+/).length
      return `<p class="muted">${Math.max(1, Math.round(words / 200))} min read</p>`
    })
  },
}
```

```md
<!-- any page -->
:::ReadingTime
:::
```

Because it goes through `addComponent`, it is a `:::Name` shortcode, a
`sections[].component`, and a `layout:` — all three, with no extra wiring.

### A custom endpoint

```js
// plugins/feed-alt.js
export default {
  name: 'feed-alt',
  setup({ addRoute }) {
    addRoute('/alt-feed.json', (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ generated: true }))
    })
  },
}
```

The handler is your standard `http` response pair, so you keep full control of
status, headers, and body.

### A Markdown plugin

```js
// plugins/strike.js
export default {
  name: 'strike',
  setup({ extendMarkdown }) {
    extendMarkdown({ extensions: [(source) => source] })
  },
}
```

`defaults` patches feature flags, e.g. `{ defaults: { footnotes: false } }`.

### Two guarantees

**A broken plugin never takes the site down.** Import and `setup()` are both
wrapped. A plugin that throws is reported and skipped, the other plugins still
load, and the site still serves:

```
[jprot] plugin "feed-alt" threw during setup(): Cannot read properties of undefined
```

`jprot check` turns that into a non-zero exit code so CI catches it before a
blank page does.

**A plugin is all-or-nothing.** Each one writes into a private staging area that
is committed only when `setup()` returns. A plugin that registers a component, a
route, and two hooks and *then* throws leaves none of them behind — there is no
such thing as a half-installed plugin.

### When not to write a plugin

A plugin can add components. If what you need is only a different **rendering** of
one, drop a file into `theme/components/` instead — no config change, no
`plugins` array, nothing to uninstall. Use a plugin when the behaviour spans
components: multiple pages, the `<head>`, or a new endpoint.

Next: [Publish your site](deploy.md).