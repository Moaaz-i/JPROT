---
title: CLI reference
description: Complete reference for the jprot command-line interface.
order: 8
nav: CLI reference
---

Run `jprot --help` at any time for the short version.

## Commands

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
| `jprot g component Name` | Create a custom theme component (`--format js` or `--format md`) |
| `jprot g list` | List component palettes |
| `jprot search [query]` | List catalog elements, optionally filtered by any word |
| `jprot add <Name>` | Install a catalog element into `theme/components/` |
| `jprot lint` | Check metadata, links, images, and content |
| `jprot export --out dist` | Export static HTML |
| `jprot --prod --no-watch` | Serve with production caching and no drafts |
| `jprot --version` | Print the installed version |

## Options

```bash
jprot --port 5000
jprot export --out dist --base-path /my-repository
jprot new post "Release notes" --template meetup
jprot g component Hobbies --palette cards
jprot g component Hobbies --format md
jprot add SplitHero
jprot add SplitHero --from https://moaaz-i.github.io/jprot-catalog
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
3. if neither is set, jprot prints a clear error telling you what to configure

A scaffolded site ships with `catalogUrl` already pointing at the JPROT Catalog,
so `jprot add <Name>` works on a fresh project without any setup.

See [Install catalog elements](catalog.md) for the full workflow.

## Custom components — `g`

`jprot g component Name` templates a new component into `theme/components/`.
Built-in palettes: `section`, `cards`, `cta`, `stats` — `jprot g list` shows the
current ones. Add `--palette <name>` to pick a style for the generated file.

By default the component is a JavaScript function (`Name.js`). Add
`--format md` to generate a **Markdown component** (`Name.md`) with its default
values in frontmatter and `[value]` placeholders in the body — no JavaScript:

```bash
jprot g component Hobbies --palette section --format md   # → theme/components/Hobbies.md
```

See [Customization → Markdown components](customization.md#markdown-components--no-javascript)
for how the placeholders resolve.
