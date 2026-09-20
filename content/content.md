---
title: Write your first page
description: Learn how Markdown files, frontmatter, projects, posts, and shortcodes become pages.
order: 3
nav: Write content
---

**You will learn:** how to turn a plain text file into a real webpage, what
**frontmatter** is, and how pages become posts, projects, and homepage
sections.

> [!TIP]
> New here? The [Quick start](quick-start.md) already made one tiny page. This
> page shows you the *full* toolkit for writing rich content.

## Your first page, step by step

Let's build one real page and see every piece come together. Create a file
`content/mountains.md` with this content:

```markdown
---
title: My Favorite Mountain
description: Why Cerro Torre is my favorite peak.
---

# My Favorite Mountain

I love mountains. My favorite is **Cerro Torre** in Patagonia.

You can read more on the [Wikipedia page](https://en.wikipedia.org/wiki/Cerro_Torre).

## Why it's my favorite

- It is incredibly steep.
- It looks amazing at sunrise.

## A picture

![Cerro Torre](https://source.unsplash.com/800x400/?mountain)
```

Save it, and open **<http://127.0.0.1:4114/mountains>**. Here is what each
part does:

| What you wrote | What appears on the page |
|---|---|
| `# My Favorite Mountain` | A big page heading |
| `## Why it's my favorite` | A medium heading that also appears in the sidebar menu |
| `**Cerro Torre**` | Bold text |
| `[Wikipedia page](https://…)` | A clickable link |
| `- item` | A bullet-point list |
| `![Cerro Torre](https://example.com/photo.jpg)` | An image with a description for screen readers |
| `---` at the top | The start/end of the frontmatter settings block |

## Where a file becomes a page

Every Markdown file in `content/` becomes a page at an address that matches its
path:

| File | Address (URL) | Purpose |
|---|---|---|
| `content/index.md` | `/` | The homepage |
| `content/about.md` | `/about` | A normal page |
| `content/projects/x.md` | `/projects/x` | A project — also shown as a card on the homepage |
| `content/blog.md` | `/blog` | The blog listing page (uses `layout: blog`) |
| `content/blog/x.md` | `/blog/x` | A blog post, newest first |

Sub-folders work too: `content/blog/2026/first-post.md` → `/blog/2026/first-post`.

> [!NOTE]
> The file name becomes the **slug** (the last part of the address).
> `my-awesome-project.md` → `/my-awesome-project`. Spaces in names become
> dashes, so it's best to use lowercase letters and dashes in file names.

## Frontmatter: the page's settings

Open any page file and you'll see a block at the very top wrapped in two `---`
lines. That block is called **frontmatter**, and it holds the page's settings:

```markdown
---
title: About me
order: 1
nav: About
hidden: false
---
```

The format is called **YAML** — it is just `setting: value` lines. Anything
after the second `---` is the page's visible content. You can put almost
anything in frontmatter, and it becomes data you can use in components.

### Common fields

| Field | What it does |
|---|---|
| `title` | The page title (shown in the browser tab and headings) |
| `order` | Where the page sits in the navigation menu |
| `nav` | A different label for the menu (instead of the title) |
| `hidden` | `true` hides the page from navigation (address still works) |
| `layout` | Force a layout (`home`, `blog`, `resume`, or a custom component) |
| `draft` | Work in progress: hidden from the published site, search, and feeds |
| `noindex` | `true` → the page stays online but search engines ignore it |
| `excerpt` | One-line summary used in cards, feeds, and search results |
| `image` | A top-of-page image → also used in link previews and feeds |
| `description` | The SEO description (falls back to `excerpt`) |
| `hero` | Your own hero block `{ title, subtitle, avatar, links }` |
| `sections` | Per-page portfolio sections (same as the homepage) |

> [!TIP]
> If a page is missing from the menu, add `nav:` (the label) and `order:` (the
> position). For example a page `contact.md` with `nav: Contact` and `order: 2`
> appears as **Contact** at position 2.

## Projects: page + homepage card

A **project** is just a Markdown file in `content/projects/`. Its frontmatter
also powers a card on the homepage:

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

Project fields you'll use most:

| Field | Shows up… |
|---|---|
| `title` | On the card and the page |
| `date` | On the card |
| `tags` | As little filter chips above the project grid |
| `excerpt` | As the card's short description |
| `demo` / `repo` | As **Live demo** and **Source** buttons on the card |
| `cover` | As the card's image (otherwise a colored placeholder is drawn) |
| `image` | As the Open Graph / link-preview image |
| `order` | Sorts projects |

## Blog posts

Posts live in `content/blog/` (change the folder with `blogDir` in the
config). The listing page is `content/blog.md` — every other Markdown file in
the folder is a post, sorted **newest first**:

```markdown
---
title: Hello, JPROT
date: 2026-01-05
tags:
  - jprot
  - release
excerpt: What landed in this release.
image: /blog/hello.png
---

Post body here...
```

The same `date` tags and excerpts appear on the listing page, the RSS feed, and
the sitemap automatically. Create a post instantly with
`jprot new post "Title" --draft`.

## Shortcodes: drop a component inside any page

Anything the homepage can show, you can place inside a page too, using a
**shortcode**. Write the component's name between `:::` on its own line:

```markdown
:::CTA title="Join now" text="Start today" label="Get started" url="/about"

Inner Markdown is rendered and passed to the component as children.

:::

:::Stats items='[{"value":15,"label":"Projects"}]
:::
```

For components that take no content, the shortcode can also **self-close** on a
single line — no closing fence needed:

```markdown
:::AvatarHero avatar="/images/me.jpg" title="Mona Reyes"
```

Settings after the name work like attributes (`title="…"`). Values can be
numbers, `true`/`false`, quoted text, or even JSON lists/objects like the
`items` above. Shortcodes can even **nest** — one inside another. If a name is
misspelled, the page shows a visible hint instead of breaking.

## The homepage file

`content/index.md` becomes your homepage and uses the `home` layout. Its
frontmatter can hold a `hero` block if you prefer writing it there instead of
in `jprot.config.js`:

```markdown
---
title: Home
layout: home
hero:
  title: Hello
  subtitle: A short tagline
---
```

Everything below the frontmatter appears under the hero, above the project
cards.

## Markdown you can use

JPROT supports the everyday Markdown: headings, paragraphs, **bold**,
*italic*, `inline code`, fenced code blocks, ordered & unordered lists,
blockquotes, tables, images, links, and horizontal rules. Example:

| Feature | Status |
|---|---|
| Markdown | ✓ |
| Frontmatter | ✓ |
| Images | ✓ |

Next: [Basic configuration](configuration.md).