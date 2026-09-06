---
title: FAQ
description: Answers to common questions about JPROT.
order: 11
nav: FAQ
---

Frequently asked questions about JPROT.

## Do I need to install anything?

No, JPROT has **zero dependencies**. You only need Node.js 18+ to run the
local server.

## Is there a build step?

No. Pages are rendered live by a tiny Node server — edit a Markdown file and
refresh to see the change.

## Can I deploy it?

Yes. Run it behind any Node host (or a process manager). The server is a
single `core/cli.js` entry point and serves everything it needs.

## How do I change colors?

Edit `theme/custom.css` and redefine the CSS variables. There is no theme
inheritance puzzle — see [Customization](customization.md).

## How do I add a blog?

Create `content/blog.md` (with `layout: blog`) and start adding Markdown files
under `content/blog/`. See [Customization → Blog](customization.md#7-blog).

## Does it have dark mode?

Yes, a built-in light/dark toggle is in the header, and it follows your OS
preference by default. See [Customization → Dark mode](customization.md#4-dark-mode).

## Can I use my own components?

Absolutely. Components are plain JS functions returning an HTML string. Drop
replacements into `theme/components/`. See [Customization](customization.md).

## Can I use a component inside a page?

Yes — write `:::ComponentName` with any props on the opening line, and the
component renders right there in your Markdown (see
[Customization → Shortcodes](customization.md#6-shortcodes-components-inside-any-markdown)).
The component can also be generated for you: `jprot g component <Name>`.

## What is `jprot export` for?

It exports the whole site as plain static HTML into `dist/` — pages become
`index.html` files, CSS is fingerprinted for immutable caching, drafts are
skipped, and `404.html` + all feeds/meta are included. Perfect for hosting on
any static file server or CDN.

Still stuck? See [Troubleshooting](troubleshooting.md).