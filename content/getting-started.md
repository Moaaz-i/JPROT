---
title: Getting started
description: Understand the JPROT project structure, dev workflow, content commands, and component scaffold.
order: 2
nav: First site
---

This page explains what a scaffolded JPROT site contains and how the pieces fit
together. New to JPROT? Start with the [Quick start](quick-start.md).

## Project layout

Almost everything you will touch lives in three places:

| Path | Purpose | Example |
|---|---|---|
| `content/` | Pages written as Markdown | `content/about.md` |
| `jprot.config.js` | Site settings | `title: 'My Name'` |
| `theme/` | Styling and component overrides | `theme/custom.css` |

No database, no compilation, no `node_modules` (for the generator itself).

## Running the server

```bash
npm start
```

```text
Running locally at: http://127.0.0.1:4114
Press Ctrl+C to stop
```

`127.0.0.1` is "this computer"; `4114` is the default port. Use a different port
with `jprot 5000` or `PORT=5000 npm start`.

## The daily workflow

JPROT has no build step — the pipeline is a request handler, not an artifact:

1. Edit any file (page, config, or style).
2. Save it.
3. Refresh the browser.

Markdown is parsed per request. A file watcher rebuilds the site state when
`content/`, `theme/`, `public/`, or `jprot.config.js` change
(`[jprot] Reloaded (file change detected)` appears in the terminal). Disable it
with the `--no-watch` flag or `NO_WATCH=1`.

## What `jprot init` creates

| Path | Contents |
|---|---|
| `content/` | `index.md` (homepage), a sample blog post, a sample project |
| `jprot.config.js` | Pre-filled, commented site config |
| `theme/custom.css` | Style overrides (start here to change colors) |
| `theme/components/` | Component overrides (empty until you add any) |
| `.vscode/`, `snippets/` | Editor autocomplete for JPROT content |

`jprot init` never overwrites existing files, so re-running it is always safe.

## Adding content (`jprot new`)

```bash
jprot new post "My First Post"        # content/blog/my-first-post.md
jprot new project "Store API" --draft # draft, hidden until you finish it
jprot new page "Contact"              # content/contact.md
jprot new resume                      # content/resume.md (recreatable)
```

`--draft` creates a work-in-progress page: visible in the dev preview, but
hidden from the published site, search, RSS, and exports until you remove
`draft: true` from the file.

Templates: save a custom shape to `templates/meetup.md` and use it with
`--template`:

```bash
jprot new post "Release notes" --template meetup
```

Templates can use `{{title}}`, `{{slug}}`, and `{{date}}` placeholders.

## Component scaffolding (`jprot g`)

`jprot g list` prints the available palettes:

```text
section | cards | cta | stats
```

Create a component (JavaScript by default):

```bash
jprot g component Hobbies --palette section   # → theme/components/Hobbies.js
```

Create a Markdown component instead:

```bash
jprot g component Hobbies --format md         # → theme/components/Hobbies.md
```

The new component works immediately in two places:

- As a homepage section: `{ component: 'Hobbies', title: '…' }` in
  `jprot.config.js`.
- Inside any page: `:::Hobbies` on its own line.

## Pre-publish checklist

```bash
jprot lint              # broken links, missing descriptions, oversized images
jprot --prod --no-watch # preview that behaves exactly like the live site
```

Production mode hides drafts and sends immutable caching headers. Then
[publish](deploy.md).

Next: [Write content](content.md).