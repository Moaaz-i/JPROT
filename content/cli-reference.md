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
```

`HOST`, `PORT`, and `NO_WATCH=1` are also supported environment variables.
See [Publish your site](deploy.md) for a complete export workflow.
