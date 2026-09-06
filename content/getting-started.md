---
title: Create your first site
description: Understand the JPROT starter files and the everyday development workflow.
order: 2
nav: First site
---

You have a running site. This page explains what the starter files do and how
to work on the site day to day.

## Requirements

- **Node.js 18+** (no other dependencies, no `node_modules` to install)

## Start the server

From the project root:

```bash
npm start
```

You should see:

```
  Running locally at: http://127.0.0.1:4114
  Press Ctrl+C to stop
```

Open **http://127.0.0.1:4114** in your browser.

## Using a different port

```bash
PORT=5000 npm start
# or pass it directly:
node core/cli.js 5000
```

## The dev workflow (no build!)

1. Edit any file — `content/` Markdown, `jprot.config.js`, `theme/` components or CSS.
2. Save it.
3. **Refresh the browser** — the change appears instantly.

There is no `build` and no hot-reload daemon to configure. Markdown and styles are read on every request, and a built-in **file watcher** hot-reloads config, navigation and components in place (watch for `[jprot] Reloaded (file change detected)` in the terminal). To disable watching, pass `--no-watch`:

```bash
node core/cli.js 4114 --no-watch
```

## Directory plan

| Path | Purpose |
|---|---|
| `content/` | Your Markdown content |
| `public/` | Static assets served at `/` |
| `jprot.config.js` | Site-wide configuration |
| `theme/` | Your overrides (CSS + components) |
| `theme/default/` | Built-in components and styles |

## Scaffold a brand-new site (`jprot init`)

You don't have to assemble the folder by hand. From an **empty** directory:

```bash
jprot init --portfolio    # or --docs / --resume
```

This writes the full skeleton in one shot:

- `jprot.config.js` — ready to edit (with commented `sections` for composing the homepage)
- `content/` — `index.md`, `about.md`, `resume.md`, a sample blog post and project
- `theme/custom.css` — your CSS overrides
- `.vscode/jprot.code-snippets` + `snippets/jprot.snippets` — editor autocomplete for the CLI

It never overwrites files that already exist, so it's safe to re-run.

## Adding content fast (`jprot new`)

```bash
jprot new post "My First Post"        # → content/blog/my-first-post.md
jprot new project "Store API" --draft # draft hidden until you're ready
jprot new page "Contact"              # → /contact
jprot new resume                      # (re)creates content/resume.md
```

Slug and date are generated for you. Reuse a body shape you like by putting a
template in `templates/meetup.md` and calling `jprot new post "Title" --template meetup`
(placeholders: `{{title}}`, `{{slug}}`, `{{date}}`).

## Scaffolding components (`jprot g component`)

```bash
jprot g list                          # see the palettes
jprot g component Hobbies --palette section   # → theme/components/Hobbies.js
```

The new component works immediately — both as a homepage section
(`{ component: 'Hobbies', title: '…' }` in the config) and as a `:::Hobbies`
shortcode inside any Markdown file. You can even use it inline on this page:
`jprot g component` keeps click-to-code within ~5 seconds.

## Previewing, checking and shipping

```bash
jprot lint            # broken links / missing metadata report
jprot --prod          # serve with production caching (drafts → 404)
jprot export --out dist   # export static HTML to dist/
```

Next: [Write your first page](content).