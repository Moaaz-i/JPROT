---
title: Troubleshooting
description: Fix common JPROT setup, content, export, and deployment problems.
order: 9
nav: Troubleshooting
---

Fixes for the most common issues — plus an explanation of a few behaviours that
look like bugs but are by design.

## The port is already in use

If your port is taken, JPROT **automatically tries the next free port** and
prints the URL it finally bound to. Start with an explicit free port to remove
the guesswork:

```bash
jprot 3000
# or
PORT=3000 jprot
```

## Config key warnings on startup

```
[jprot] config key "titll" not recognized — did you mean "title"?
```

Typo in `jprot.config.js`. Each unknown key prints a **did-you-mean** hint —
check the spelling against the [Configuration](configuration) page.

## "no component named X found" for a section

```
[jprot] section "NoSuchThing" (Hi) — no component named "NoSuchThing" found.
        Available: Awards, Blog, CTA, Clients, Contact, Education, ...
```

`site.sections[].component` must match a component file name in
`theme/default/components/` or your overrides in `theme/components/`. The
warning lists what's actually available. Create the missing one with
`jprot g component NoSuchThing`.

## A `:::Name` shortcode shows a hint instead of rendering

An unknown shortcode renders a visible `.jprot-shortcode-missing` notice and a
terminal warning — a typo never kills the page. Check:

- Spelling and **capitalization** — the name is matched against component
  filenames (`:::Stats`, not `:::stats`).
- That the component exists (built-in or in `theme/components/`). Confused? Run
  `jprot g list` or generate the component: `jprot g component Name`.

## "Component ::Name failed: …"

```
[jprot] shortcode ::Name failed: <message>
```

The component threw while rendering. The error message is printed inline on the
page (`.jprot-shortcode-error`) so you can see it during development. Check that
the attributes you pass (`items`, `title`, …) match the props the component
reads.

## Draft pages 404 in production

`draft: true` pages are **intentionally** hidden from the navigation, sitemap,
search, RSS and `jprot export`, and return `404` under `jprot --prod` or in an
export. They stay visible in the dev server so you can preview them. This is by
design — remove `draft: true` to publish.

## File changes don't trigger a reload

The watcher uses recursive `fs.watch` where the OS supports it. On Linux or on
network mounts where that isn't available it automatically falls back to
**polling every 700 ms**, so changes should still land. If a file is still not
reflected, or you're on a filesystem that doesn't report changes, restart the
server once.

## Assets look stale after `--prod` or export

In production and in exports, assets are served with immutable, content-hashed
caching — browsers cache them aggressively. Re-running `jprot export`
fingerprints changed files again. During development (`jprot` without flags)
every response is `no-cache`, so a refresh always shows fresh content.

## A `<script>` tag in my Markdown doesn't run

By design. JPROT ships a **strict CSP** that only allows inline scripts carrying
a per-response nonce — raw `<script>` blocks authored in Markdown are blocked.
To add JavaScript, write it into one of your theme components (it's server-
rendered into the page with the correct nonce) or place it in the `head` config.
See [Customization → Components](customization#3-replace-a-component-full-layout-control).

## Why does `jprot export` start a server?

Exports boot the **real** server in production mode, fetch every page, and write
it to `dist/` — then shut the server down. Reusing the live router guarantees
the exported files are byte-for-byte what a visitor gets, so there's only one
rendering path to reason about.

## Sitemap `lastmod` is empty or wrong

`lastmod` comes from the **last git commit** that touched the file; outside a
git repo (or when git is unavailable) it falls back to the file's mtime. To
freeze a specific value, set `lastmod: 2026-01-20` in the page frontmatter.

## A page outside `content/` won't resolve

By design the content router refuses paths that escape `content/` (path
traversal guard). Keep every page inside `content/`; files in `public/` are
served as static assets instead.

---

Still stuck? Open the [FAQ](faq), or read the [Architecture](architecture)
page to understand how the server resolves a request.