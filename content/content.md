---
title: Write your first page
description: Learn how Markdown files, frontmatter, projects, posts, and shortcodes become pages.
order: 3
nav: Write content
---

Everything on your site is written as **Markdown** files under `content/`.
Adding, editing, or removing a file changes the site immediately.

## How files map to pages

| File | URL | Purpose |
|---|---|---|
| `content/index.md` | `/` | Homepage |
| `content/about.md` | `/about` | A standalone page |
| `content/projects/x.md` | `/projects/x` | A project (card on homepage) |

## Frontmatter

Each file can start with a `---` block of YAML. Anything inside becomes metadata you can style or use.

```markdown
---
title: About me
order: 1
nav: About
hidden: false
---
```

### Common fields

| Field | Meaning |
|---|---|
| `title` | Page title (used in `<title>` and headings) |
| `order` | Sort position in the navigation |
| `nav` | A different label shown in the navigation bar |
| `hidden` | Set `true` to hide the page from the navigation |
| `layout` | Force a layout (`home` → Home component, or a custom name) |
| `draft` | Work-in-progress: hidden from nav, sitemap, search, RSS and exports; `404` in production (`jprot --prod`), still visible in dev preview. `jprot new post "X" --draft` creates one |
| `noindex` | `true` → `robots noindex,nofollow`; page stays online but is not indexed |
| `canonical` | Override the canonical URL with an absolute URL |
| `excerpt` | One-line summary for cards, feeds and search results |
| `lastmod` | Freeze the sitemap `lastmod` (otherwise git commit date, falling back to the file's mtime) |
| `image` | Top-of-page image → `og:image`, `twitter:image`, sitemap `<image:image>` and feeds |
| `description` | SEO meta description (falls back to `excerpt`) |
| `hero` | Per-page `{ title, subtitle, avatar, links }` when you keep the hero in the file |
| `sections` | Per-page portfolio sections (same `{ component, ...props }` shape as the config) |

### Shortcodes (`:::Component`)

Any registered component works inline inside a page body — no config needed:

```markdown
:::CTA title="Join now" text="Start today" label="Get started" url="/about"

Inner Markdown is rendered and passed to the component as **children**.

:::

:::Stats items='[{"value":15,"label":"Projects"}]
:::
```

Attribute values support numbers, `true`/`false`, double- or single-quoted
strings, and JSON arrays/objects. Shortcodes nest, so a `:::Section` can wrap
another `:::Stats`. An unknown `:::Name` shows a visible hint instead of
breaking the page — on the terminal the server also warns you.

## Project files

A project is just a Markdown file in `content/projects/`. Its frontmatter drives the homepage card:

```markdown
---
title: Task Manager
order: 1
date: 2026-01-15
tags:
  - JavaScript
  - Node.js
excerpt: A command-line task manager.
---

Full project description here...
```

Supported project fields:

| Field | Meaning |
|---|---|
| `title` | Card title |
| `order` | Sort position among projects |
| `date` | Shown as a date on the card |
| `tags` | Shown as tag chips (list or `[a, b]` syntax) |
| `excerpt` | Short description for the card (defaults to the body) |
| `image` | `og:image` / sitemap image for the project page |
| `demo` / `repo` | Links on the project page/card |

## The homepage file

`content/index.md` uses the `Home` layout by default. Its frontmatter can also carry a `hero` block if you place your hero data in the file instead of the config:

```markdown
---
title: Home
layout: home
hero:
  title: Hello
  subtitle: A short tagline
---
```

By default the homepage hero is driven by `jprot.config.js`. Any extra body content renders below the project cards.

## Supported Markdown

Headings, paragraphs, **bold**, *italic*, `inline code`, fenced code blocks, ordered & unordered lists, blockquotes, tables, images, links, and horizontal rules.

Example table:

| Feature | Status |
|---|---|
| Markdown | ✓ |
| Frontmatter | ✓ |
| Images | ✓ |

Next: [Basic configuration](configuration).