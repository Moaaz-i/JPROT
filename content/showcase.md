---
title: Showcase
description: A live render of every built-in JPROT section — the sample content shipped with `jprot init`.
order: 10
---

This page is the **working template showcase**: every section below renders
exactly as it would on a `layout: home` page. All of it is **sample content**
from `jprot init` — copy any block into your `jprot.config.js` (as a section)
or use the `:::` shortcode inline on any page.

## Stats

:::Stats items='[{"value":"15+","label":"Projects shipped"},{"value":"8","label":"Years experience"},{"value":"40+","label":"Happy clients"},{"value":"120k","label":"Users reached"}]'
:::

## Services

:::Services title="What I do" subtitle="Services I offer end to end." items='[{"icon":"✻","title":"Web Development","description":"Fast, accessible sites and apps built with modern tooling."},{"icon":"✺","title":"Product Design","description":"Interfaces and systems that are simple to use and own."},{"icon":"⚙","title":"Dev Tooling","description":"CLIs, generators and automation that remove friction."},{"icon":"☾","title":"Documentation","description":"Clear docs and tutorials people actually finish."}]'
:::

## Skills

:::Skills title="Skills" subtitle="Core tools I work with every day." items='[{"name":"JavaScript / TypeScript","level":92},{"name":"Node.js","level":88},{"name":"UI / CSS","level":85},{"name":"Markdown & Docs","level":95}]'
:::

## Experience

:::Experience title="Experience" subtitle="Where I have been working." items='[{"title":"Senior Developer","company":"Acme Inc.","period":"2022 — Now","description":"Leading a team building developer tools, designing architecture and shipping features end-to-end."},{"title":"Frontend Developer","company":"StartupHub","period":"2019 — 2022","description":"Built marketing sites and customer-facing dashboards used by thousands of users."}]'
:::

## Testimonials

:::Testimonials title="Testimonials" subtitle="What clients and colleagues say." items='[{"text":"JPROT is the fastest way we have shipped a documentation site. No build step, no framework lock-in.","name":"Sarah K.","role":"Engineering Manager"},{"text":"Beautiful portfolios with zero boilerplate. The sections system is pure genius.","name":"Mohammed A.","role":"Product Designer"}]'
:::

## Awards

:::Awards title="Awards" subtitle="A few milestones along the way." items='[{"year":"2024","title":"Product of the Year","org":"DevTools Awards","description":"Recognized for a distributed-site generator used across 40+ teams."},{"year":"2022","title":"Best Storefront","org":"CSS Spotlight","description":"Storefront Kit won for performance and accessibility."}]'
:::

## Education

:::Education title="Education" subtitle="Formal training and degrees." items='[{"title":"MSc Computer Science","school":"University of Technology","period":"2016 — 2018","description":"Focus on distributed systems and developer tooling."},{"title":"BSc Software Engineering","school":"State University","period":"2012 — 2016","description":"Graduated with honors."}]'
:::

## Clients

:::Clients title="Clients & partners" items='[{"name":"Acme Corp"},{"name":"StartupHub"},{"name":"Northwind"},{"name":"Globex"}]'
:::

## Gallery

:::Gallery title="Gallery" subtitle="A few screens from recent work." items='[{"src":"https://picsum.photos/seed/j1/640/480","alt":"Project screenshot"},{"src":"https://picsum.photos/seed/j2/640/480","alt":"Site preview"},{"src":"https://picsum.photos/seed/j3/640/480","alt":"Design detail"},{"src":"https://picsum.photos/seed/j4/640/480","alt":"Mobile view"}]'
:::

## Sample project files

Drop a file into `content/projects/` and its card appears automatically on any
`layout: home` page (title, cover, tags, order, excerpt from frontmatter):

```markdown
---
title: Storefront Kit
date: 2026-05
tags: [frontend, ui, react]
cover: https://picsum.photos/seed/proj2/640/360
order: 2
excerpt: A headless storefront starter pack — product grid, cart, and checkout flows ready to drop into any backend.
---
```

```markdown
---
title: Api Schema Editor
date: 2026-01
tags: [node, tooling]
cover: https://picsum.photos/seed/proj3/640/360
order: 3
excerpt: A visual editor for JSON Schema definitions with live validation, diff previews, and one-command export to docs.
---
```

## Brand-new section

Scaffold your own, then use it anywhere with a shortcode:

```bash
jprot g component SupportStrip --palette section
```

```markdown
:::SupportStrip title="Open hours: 9–5"
```