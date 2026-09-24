---
title: Writing content
description: Markdown, frontmatter, projects, blog posts, and shortcodes — the full content model.
order: 3
nav: Write content
---

Content is plain Markdown plus a YAML frontmatter block. This page documents the
full content model. For a worked example, start with the
[Quick start](quick-start.md).

## How files become pages

Every Markdown file in `content/` becomes a page at a URL matching its path:

| File | URL | Purpose |
|---|---|---|
| `content/index.md` | `/` | Homepage |
| `content/about.md` | `/about` | Standalone page |
| `content/projects/x.md` | `/projects/x` | Project — also a card on the homepage |
| `content/blog.md` | `/blog` | Blog listing page (`layout: blog`) |
| `content/blog/x.md` | `/blog/x` | Blog post, newest first |

Sub-folders work: `content/blog/2026/first-post.md` → `/blog/2026/first-post`.

The file name becomes the URL path — a space stays a space (encoded as
`%20`), so use lowercase letters and dashes for clean, readable URLs. JPROT
converts dynamic content (like `jprot new post "My Title"`) to dashed slugs.

## Frontmatter

The block between two `---` lines at the top of a file holds the page's
settings. It is YAML: `key: value` lines.

```markdown
---
title: About me
order: 1
nav: About
hidden: false
---
```

### Common fields

| Field | Purpose |
|---|---|
| `title` | Page title (browser tab + headings) |
| `order` | Position in navigation / docs sidebar |
| `nav` | Different menu label (defaults to `title`) |
| `hidden` | `true` hides the page from navigation (URL still works) |
| `layout` | Force a layout: `home`, `blog`, `resume`, or a custom component |
| `draft` | Work in progress: hidden from production, search, feeds, exports |
| `noindex` | `true` → stays online but ignored by search engines |
| `excerpt` | One-line summary for cards, feeds, search |
| `image` | Top-of-page image; also used for link previews and feeds |
| `description` | SEO description (falls back to `excerpt`) |
| `hero` | Per-page hero block `{ title, subtitle, avatar, links }` |
| `sections` | Per-page portfolio sections (same shape as the homepage) |

If a page is missing from the menu, add `nav:` (label) and `order:` (position).

## Projects

A project is a Markdown file in `content/projects/`. Its frontmatter powers both
the project card and the page:

```markdown
---
title: Task Manager
order: 1
date: 2026-01-15
tags:
  - JavaScript
  - Node.js
excerpt: A command-line task manager.
cover: /img/task-manager.png
demo: https://example.com/demo
repo: https://github.com/you/task-manager
---
```

| Field | Shows up as |
|---|---|
| `title` | Card + page title |
| `date` | Date on the card |
| `tags` | Filter chips above the project grid |
| `excerpt` | Card description |
| `demo` / `repo` | **Live demo** / **Source** buttons |
| `cover` | Card image (a colored placeholder is drawn if absent) |
| `image` | Open Graph / link-preview image |
| `order` | Project sort order |

## Blog posts

Posts live in `content/blog/` (configurable via `blogDir`). The listing page is
`content/blog.md` with `layout: blog`; every other file in the folder is a post,
sorted **newest first**.

```markdown
---
title: Hello, JPROT
date: 2026-01-05
tags:
  - jprot
excerpt: What landed in this release.
---

Post body here...
```

`date`, tags, and `excerpt` flow into the listing, RSS feed, and sitemap
automatically. Create a draft instantly with `jprot new post "Title" --draft`.

### Date ordering

Dates may be written as `YYYY-MM-DD` or `YYYY-M-D`. Both normalize to a
zero-padded sort key, so `2026-1-5` sorts before `2026-10-1` correctly.
An invalid `date` is flagged by `jprot lint` and omits `<pubDate>` from the feed.

## Shortcodes

Any registered component can be placed inside a page with a `:::Name` block:

```markdown
:::CTA title="Join now" text="Start today" label="Get started" url="/about"

Inner Markdown is rendered and passed to the component as children.

:::

:::Stats items='[{"value":15,"label":"Projects"}]'
```

### Self-closing form

A component that takes no content can render on a single line — no closing
fence needed:

```markdown
:::AvatarHero avatar="/images/me.jpg" title="Mona Reyes"
```

### Attribute values

| Shape | Example | Passed as |
|---|---|---|
| string | `title="Hello world"` | `"Hello world"` |
| number | `level=90` | `90` |
| boolean | `draft=true` | `true` |
| JSON | `items='[{"name":"JS","level":90}]'` | real array/object |

### Rules

- The block opens with `:::Name` (name = component filename) and closes with a
  lone `:::` line.
- A `:::` line inside a fenced code block is literal — code fences are respected
  while scanning.
- Shortcodes nest; inner content is re-rendered as Markdown.
- Unknown names render a visible `.jprot-shortcode-missing` hint plus a terminal
  warning — a typo never 500s the page.

## The homepage file

`content/index.md` uses the `home` layout. A `hero` block can live in its
frontmatter instead of in `jprot.config.js`:

```markdown
---
title: Home
layout: home
hero:
  title: Hello
  subtitle: A short tagline
---
```

Content below the frontmatter renders under the hero, above the project cards.

## Supported Markdown

Headings, paragraphs (consecutive lines join into one paragraph), bold, italic
(including nested emphasis like `**bold _and_ nested**`), inline code, fenced
code blocks, ordered and unordered lists (nested lists included), GitHub-style
task lists, blockquotes and callouts, tables, images, links, reference-style
links, horizontal rules, and backslash escapes (`\*` renders a literal star).

Extras on top of CommonMark:

- **Footnotes** — reference with `[^1]`, define anywhere with `[^1]: text`.
  A notes section with backlinks is appended automatically. Turn off with
  `markdown.footnotes: false`.
- **Autolinks** — `<https://example.com>` and `<you@example.com>` become links
  automatically. Turn off with `markdown.autolinks: false`.
- **Task lists** — `- [ ] todo` and `- [x] done` render as disabled
  checkboxes. Turn off with `markdown.taskLists: false`.
- **Reference links** — write `[text][id]`, `[text][]` or `[text]` and define
  the target once with `[id]: https://example.com`. Labels are
  case-insensitive; definitions may appear anywhere (even after use).

Every toggle lives under the `markdown` key in `jprot.config.js`.

Next: [Configuration](configuration.md).