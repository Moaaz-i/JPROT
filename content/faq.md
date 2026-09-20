---
title: FAQ
description: Simple answers to common JPROT questions — from absolute beginners onward.
order: 11
nav: FAQ
---

Short, plain answers to the questions people ask most.

## I've never built a website. Can I still use this?

Yes — that's exactly who JPROT is for. You write normal text files (Markdown),
run two commands, and you have a website. You don't need to know HTML, CSS, or
JavaScript to get started. Start with the [Quick start](quick-start.md).

## Do I need to install anything?

Just one thing: **Node.js 18+**. JPROT itself has zero dependencies — no
`npm install`, no `node_modules`, nothing to configure.

## What is a "static site"?

A website made of finished HTML files, instead of one that needs a running
program to create each page on demand. Static sites load fast, are cheap to
host, and are what jprot exports in `dist/`. You can run a preview on your
computer while working, but the published site is just files.

## Is there a build step?

No. Save a Markdown file, refresh your browser, and the change is there.
Nothing needs to be compiled or rebuilt.

## Can I deploy it? Is it free?

Yes. `jprot export` creates a folder of files you can upload to **GitHub
Pages**, **Netlify**, or **Cloudflare Pages** — all have generous free tiers.
See [Publish your site](deploy.md).

## How do I change the colors?

Open `theme/custom.css` and redefine the color variables. For example:

```css
:root { --color-accent: #0ea5e9; }
```

That one line changes every accent color on the site instantly. See
[Customization](customization.md) for the full list of variables.

## How do I add a blog?

Create `content/blog.md` (with `layout: blog`), then drop Markdown files into
`content/blog/`. Each file is a post, sorted newest first by its `date`. Or
type `jprot new post "Title"` and jprot creates the file for you.

## How do I add a page to the navigation menu?

Every top-level `.md` file in `content/` becomes a menu item automatically. To
pick a different label or position, set `nav: Label` and `order: 5` in the
file's frontmatter.

## Does it have dark mode?

Yes. A light/dark button lives in the header, and by default jprot follows
your computer's setting. See [Customization → Dark mode](customization.md#4-dark-mode).

## Can I use my own components?

Absolutely. Components are plain JavaScript functions that return an HTML
string. Drop a file into `theme/components/` and it becomes available
everywhere. See [Customization](customization.md).

## Can I use a component inside a page?

Yes — write `:::ComponentName` on its own line, pass settings like
`title="…"`, and it renders right there in your Markdown. See
[Customization → Shortcodes](customization.md#6-shortcodes-components-inside-any-markdown).
You can even generate a starter component with `jprot g component <Name>`.

## What is `jprot export` for?

It turns your whole site into static HTML files in `dist/` — pages become
folders with `index.html`, CSS gets content-hashed names for fast loading,
drafts are left out, and everything a static host needs (`404.html`, feeds,
sitemap) is included. Upload `dist/` and you're live.

## Why don't I see my new page on the published site?

Three likely reasons: it's a **draft** (`draft: true` is hidden from the
published site), you're looking at a **cached** preview (`Ctrl+Shift+R` to
hard-refresh), or you haven't **re-exported** since adding it — exports are
snapshots, so re-run `jprot export` after changes.

Still stuck? Walk through [Troubleshooting](troubleshooting.md) step by step.