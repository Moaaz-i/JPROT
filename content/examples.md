---
title: Examples
description: Copy-paste configurations, themes, and component examples.
order: 9
nav: Examples
---

Every example in the `examples/` folder is **copy-paste ready**. Copy it into your project and reload — no build, no restart.

## Themes (restyle in one step)

Any file below copies to `theme/custom.css`:

```bash
# Dark color scheme
cp examples/themes/dark-mode.css theme/custom.css
```

The available themes:

| File | Look |
|---|---|
| `dark-mode.css` | Dark background, light text, blue accent |
| `neon.css` | Dark theme with vivid pink accent and glow |
| `serif.css` | Editorial serif typography on a warm paper tone |

Example `dark-mode.css`:

```css
:root {
  --color-bg: #0f172a;
  --color-surface: #1e293b;
  --color-text: #e2e8f0;
  --color-muted: #94a3b8;
  --color-accent: #38bdf8;
  --color-accent-contrast: #0f172a;
  --color-border: #334155;
  --color-code-bg: #1e293b;
}
```

## Components (replace a whole part of the UI)

Copy any of these to `theme/components/`:

```bash
cp examples/components/Header.js theme/components/Header.js
```

| Example | What it adds |
|---|---|
| `Header.js` | Navbar with a "GitHub" link appended |
| `Footer.js` | Footer with a `site.social` links row |
| `Home.js` | A simpler homepage layout (hero + grid) |

Each file has a header comment explaining usage.

## Config

`examples/config/jprot.config.js` is a fully-commented config covering **every** option — hero, head, nav, markdown, social.

`examples/config/sections.js` is a ready **sections** array — copy it into your homepage config to add a full portfolio (stats, skills, experience, testimonials, gallery, contact):

```bash
cp examples/config/sections.js ./sections-example.js   # ← contains the sections[] array
```

## Portfolio sections

Sections are the fastest way to make a plain site a **portfolio** — see
[Configuration → Sections](configuration.md#sections-the-portfolio-builder). You
can combine any built-in component (`Stats`, `Skills`, `Experience`, `Education`,
`Services`, `Awards`, `Clients`, `Testimonials`, `Gallery`, `Contact`, `CTA`) or
write your own in `theme/components/`.

Example — two sections on your homepage:

```js
sections: [
  { component: 'Skills', title: 'Stack', items: [{ name: 'Node', level: 90 }] },
  { component: 'Contact', email: 'you@example.com', social: [{ label: 'GitHub', url: 'https://github.com/you' }] },
],
```

## Blog

Add a `content/blog/` folder, post Markdown files, and a `blog.md` listing page
with `layout: blog`. See [Customization → Blog](customization.md#7-blog).

## Shortcodes — components inside Markdown

A component can appear anywhere in a page body with a `:::Name` block; the inner
Markdown becomes its `children`. See
[Customization → Shortcodes](customization.md#6-shortcodes-components-inside-any-markdown).

```markdown
## Deploy with your stack

:::CTA title="Ship it" text="Export is one command away." label="Export now" url="/getting-started"

Run `jprot export --out dist` and copy `dist/` to any static host.
Everything below stays inside this Markdown page.

:::
```

Combine it with a freshly scaffolded component:

```bash
jprot g component SupportStrip --palette section
```

```markdown
:::SupportStrip title="Open hours: 9–5"
```
...and `:::SupportStrip` works on any page immediately. Type attrs as strings,
numbers, booleans, or JSON (`items='[{"day":"Sun","hours":8}]'`).

## Sidebar, search, resume, SEO

Right out of the box regular pages get a **docs sidebar** with on-page scroll
spy, and every page has a **search** button (try `Cmd/Ctrl + K`). A
`layout: resume` page gives you a printable CV, and `/sitemap.xml` +
`/feed.xml` are generated automatically. See [Customization](customization.md).

## Putting it all together — a dark, brand-colored site

```bash
cp examples/themes/dark-mode.css theme/custom.css
cp examples/components/Header.js theme/components/Header.js
```

Refresh the browser. Your site is now dark with a custom navbar — without touching any build tooling.

Next: [Publish your site](deploy.md).