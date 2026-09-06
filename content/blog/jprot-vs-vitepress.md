---
title: JPROT vs VitePress — why we built our own
date: 2026-08-15
tags: [jprot, thoughts]
excerpt: A comparison of the two approaches to publishing a portfolio and docs site.
---

VitePress is a great tool, but it is built around documentation. When we wanted a
site that could be a portfolio, a blog and a docs hub at once — with no build
step and every piece of UI replaceable — we decided to go our own way.

## The difference

* **No build step.** Content is Markdown; a tiny Node server serves it directly.
* **Sections, not pages.** The homepage is composed of reusable components you can
  swap without touching the content.
* **Yours by default.** Every component ships as plain JavaScript you can edit.

Read more in the [architecture](architecture) guide.