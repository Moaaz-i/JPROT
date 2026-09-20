---
title: Create your first site
description: Understand the JPROT starter files and the everyday workflow — in plain words.
order: 2
nav: First site
---

**You will learn:** what all the starter files are for, how to run the preview,
and how to add content the fast way.

> [!TIP]
> New here? Start with the [Quick start](quick-start.md) first, which creates
> your working site in five minutes. This page explains *how* it works.

## The three files that matter

Almost everything you will ever touch lives in **three places**:

| Place | What it is | Example |
|---|---|---|
| `content/` | Your **pages** (written as Markdown) | `content/about.md` |
| `jprot.config.js` | Your **site's settings** (name, links, colors) | `title: 'My Name'` |
| `theme/` | Your **style and design** (colors, fonts, layout) | `theme/custom.css` |

That's it. No database, no complicated folders, nothing to compile.

## Start the preview server

From your site's root folder (where `jprot.config.js` lives), run:

```bash
npm start
```

A message like this appears:

```text
  Running locally at: http://127.0.0.1:4114
  Press Ctrl+C to stop
```

**"Running locally"** means jprot is serving your site *on your own
computer*, so you can look at it before the world can. Open that address in
your browser to see the site.

> [!NOTE]
> **`127.0.0.1:4114`** — the `127.0.0.1` just means "this computer" and `4114`
> is the door (port) the preview uses. You will see the word **port**
> again when you want a different door, e.g. `jprot 5000`.

## The daily workflow (no build!)

This is the whole secret of jprot — there is **no build step**. A "build step"
is work many tools make you do every time you change something (typing
`npm run build`, waiting, then publishing). jprot skips it:

1. Edit any file — a page, the settings, or a style.
2. **Save** it (`Ctrl+S`).
3. **Refresh the browser** (`Ctrl+R` or `F5`).

Your change is instantly there. Markdown pages are read every time you refresh,
styles load live, and a built-in **watcher** even reloads the settings and
navigation when they change (you'll see `[jprot] Reloaded (file change
detected)` in the terminal).

You only need `--no-watch` in very specific cases (for example a server with no
file system watching rights). For normal day-to-day work, leave it on:

```bash
node core/cli.js 4114 --no-watch
```

## What `jprot init` created for you

When you ran `jprot init --portfolio`, it wrote this structure:

| Path | Look inside to find |
|---|---|
| `content/` | `index.md` (homepage), `about.md`, `resume.md`, a sample **blog post**, and a sample **project** |
| `jprot.config.js` | Your site settings, already filled in and commented |
| `theme/custom.css` | Your personal style overrides (start here to change colors) |
| `theme/components/` | Custom homepage sections and components (blank until you make them) |
| `.vscode/` and `snippets/` | Editor autocomplete for writing jprot content |

> [!NOTE]
> `jprot init` **never overwrites** existing files. If one of these already
> exists, it is left alone. So you can re-run it safely whenever you want.

## Adding content fast (`jprot new`)

Typing out files by hand is fine, but jprot has a shortcut that creates them
for you — with the right name and today's date:

```bash
jprot new post "My First Post"        # creates content/blog/my-first-post.md
jprot new project "Store API" --draft # creates a draft hidden until you're ready
jprot new page "Contact"              # creates content/contact.md
jprot new resume                      # creates (or recreates) content/resume.md
```

The **`--draft`** flag makes a "work in progress" page: you can see it in your
preview, but it stays hidden from the published site, search, and feeds until
you remove `draft: true` from the file.

Each file comes with a ready-made shape to fill in (title, date, tags, a
headline to start writing under). Want a different shape? Save your own
template in `templates/meetup.md` and use it any time:

```bash
jprot new post "Release notes" --template meetup
```

Your template can use `{{title}}`, `{{slug}}` (the page's file name), and
`{{date}}` as placeholders.

## Creating small homepage sections (`jprot g component`)

The homepage is made of **sections** — reusable blocks like a photo grid or a
pricing row. See what section shapes are built in:

```bash
jprot g list
```

Then create one:

```bash
jprot g component Hobbies --palette section   # → theme/components/Hobbies.js
```

The new section works immediately in two places:

- As a homepage block: add `{ component: 'Hobbies', title: '…' }` to the
  `sections:` list in `jprot.config.js`.
- Inside any page: write `:::Hobbies` on its own line.

## Before you publish: check and preview for real

When you think the site is ready:

```bash
jprot lint                # checks for broken links and missing descriptions
jprot --prod --no-watch   # a preview that behaves exactly like the live site
```

The first command prints a report of problems to fix. The second serves the
site in "production mode", which hides drafts and turns on real caching. Stop
it with `Ctrl+C` when you're done. Then
[**publish your site**](deploy.md).

Next: [Write your first page](content.md).