---
title: Building a theme system with CSS variables
date: 2026-07-28
tags: [css, theming]
excerpt: How a handful of variables lets anyone re-skin the entire site.
---

The whole design is driven by a small set of CSS variables defined in
`:root`. To create a dark variant, we simply redefine those variables under
`[data-theme="dark"]`.

## What the variables cover

* Colors — background, surface, text, accent
* Typography — fonts and size
* Spacing — container width and radius

Override any of them in `theme/custom.css` and never touch a component.

The [customization guide](../customization.md) shows the full list.