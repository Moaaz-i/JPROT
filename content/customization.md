---
title: Customize your site
description: Change the look, layout, components, sections, and search behavior without a build step.
order: 5
nav: Customize
---

This is where JPROT stands out: you can restyle the site **entirely** without touching a single component — or go further and replace whole layout components.

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

Now for the fun one. Every registered component is callable **inline** in any
page with a `:::Name` block — no config, no frontmatter, no page rewrite:

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

Next: [Publish your site](deploy.md).