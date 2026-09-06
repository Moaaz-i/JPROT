---
title: JPROT vs VitePress
order: 7
nav: Comparison
---

JPROT is inspired by the *idea* of VitePress (Markdown-driven sites) but takes a deliberately different path: **no build step** and **radical customization** instead of a fixed theme layer.

## The big difference

| | VitePress | JPROT |
|---|---|---|
| **Build step** | Required (`vitepress build`) | **None** — served directly |
| **Content** | Markdown | Markdown |
| **Runtime** | Static output | Node.js server |
| **Theme customization** | Vue theme slots / config | **Replace components & CSS variables** |
| **Framework** | Vue 3 | Vanilla JS |
| **Dependencies** | Many | **Zero** |
| **Dev server** | Bundled + hot reload | Simple HTTP server |

## Where JPROT shines

- **Instant preview.** Save a Markdown file, refresh the browser. No compile, no cache invalidation.
- **No lock-in.** Nothing to transpile or bundle — you can even view source online.
- **Full control.** Want a brand-new layout? Drop a `Header.js` / `Home.js` override. Done.
- **Lightweight.** The entire engine is ~3 small files. Forkable and understandable in an afternoon.

## Where VitePress is stronger

| Area | Why |
|---|---|
| **Scalability** | Static generation beats a runtime server for huge docs & CDN hosting |
| **Ecosystem** | A mature plugin/theme ecosystem around Vue |
| **SEO/performance** | Pre-rendered static HTML, edge caching ready |
| **Search & advanced features** | Built-in search, full-text indexing, etc. |

## Which to choose?

- Pick **JPROT** when you want a fast, hackable, dependency-free portfolio or small docs site, and you value being able to change everything instantly.
- Pick **VitePress** when you need a large, statically-deployed documentation platform with an established ecosystem.

JPROT isn't a clone — it's a lighter, more open alternative for the cases VitePress's weight isn't warranted.

Next: [FAQ](faq.md).