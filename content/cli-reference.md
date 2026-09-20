---
title: CLI reference
description: Complete reference for the jprot command-line interface.
order: 7
nav: CLI reference
---

Run `jprot --help` at any time for the short version.

| Command | What it does |
|---|---|
| `jprot` | Start the development server on port 4114 |
| `jprot <port>` | Start on a specific port, for example `jprot 5000` |
| `jprot init --portfolio` | Create a portfolio starter |
| `jprot init --docs` | Create a documentation starter |
| `jprot init --resume` | Create a resume starter |
| `jprot new post "Title"` | Create a blog post |
| `jprot new page "Title"` | Create a standalone page |
| `jprot new project "Title"` | Create a project |
| `jprot new ... --draft` | Create content hidden from production |
| `jprot g component Name` | Create a custom theme component |
| `jprot g list` | List component palettes |
| `jprot search [query]` | List catalog elements, optionally filtered by any word |
| `jprot add <Name>` | Install a catalog element into `theme/components/` |
| `jprot lint` | Check metadata, links, images, and content |
| `jprot export --out dist` | Export static HTML |
| `jprot --prod --no-watch` | Serve with production caching and no drafts |
| `jprot --version` | Print the installed version |

## Useful options

```bash
jprot --port 5000
jprot export --out dist --base-path /my-repository
jprot new post "Release notes" --template meetup
jprot g component Hobbies --palette cards
jprot add SplitHero
jprot add SplitHero --from https://YOUR-ACCOUNT.github.io/JPROT-catalog
jprot search
jprot search hero
```

`HOST`, `PORT`, and `NO_WATCH=1` are also supported environment variables.
See [Publish your site](deploy.md) for a complete export workflow.

## Catalog elements — `search` and `add`

JPROT ships with a small core library. Everything else lives in an **element
catalog** — a plain static site of ready-made, self-contained components
(homepage sections, cards, forms, CTAs, and more) that you pull in on demand.

- `jprot search` — list everything the catalog offers.
- `jprot search hero` — filter by any word (name, category, tags, description).
- `jprot add <Name>` — download one component into `theme/components/<Name>.js`,
  where your site picks it up automatically. No rebuild, no config hooks.
  Re-running the same command says *already installed*.

The catalog URL is resolved in this order:

1. the `--from <url>` flag
2. `catalogUrl: '…'` in your `jprot.config.js` (set once, then plain
   `jprot add <Name>` works from then on)
3. the built-in default URL for your JPROT distribution

See [Install catalog elements](catalog.md) for the full workflow.

## Custom components — `g`

`jprot g component Name` templates a new component into your `theme/`
folder, and applies the default palette. Built-in palettes: classic,
playful, modern, minimal—`jprot g list` shows the current one. Add
`--palette <name>` to switch styles for the generated file only.
