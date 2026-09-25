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
| `jprot check` | Validate `jprot.config.js` and every plugin against the schema |
| `jprot lint` | Check metadata, links, images, and content |
| `jprot export --out dist` | Export static HTML |
| `jprot --prod --no-watch` | Serve with production caching and no drafts |
| `jprot --export` | Alias for `jprot export` |
| `jprot --root <dir>` | Act on a project other than the current directory |
| `jprot --version` | Print the installed version |

## Options

```bash
jprot --port 5000
jprot export --out dist --base-path /my-repository
jprot check --strict
jprot lint --root ./site          # lint a project other than the cwd
jprot new post "Release notes" --template meetup
jprot g component Hobbies --palette cards
jprot g component Hobbies --format md
jprot add SplitHero
jprot add SplitHero --from https://moaaz-i.github.io/jprot-catalog
jprot search
jprot search hero
jprot --allow-embed
jprot check --strict
```

`HOST`, `PORT`, and `NO_WATCH=1` are also supported environment variables.
`--root <dir>` points a command at a project other than the current directory
(`check`, `lint`, `export`, `search`, and `add`), which is what makes these usable
from a monorepo CI job.
`--allow-embed` relaxes the framing-related security headers
(`X-Frame-Options`, `frame-ancestors` and `Cross-Origin-Resource-Policy`) so
the site can be embedded in an iframe — this is what the JPROT VSCode
extension's live preview turns on. Every other security header stays in
place, and framing remains blocked unless the flag is explicit.
See [Publish your site](deploy.md) for a complete export workflow.

## Validating configuration — `check`

```bash
jprot check
```

`jprot check` reads `jprot.config.js`, validates it against the schema, and
prints any problem with its **file and line**:

```
✖ check: 2 error(s) in /path/jprot.config.js
  jprot.config.js:12  sections[0].component  no component named "Herro" — available: Hero, Skills
  jprot.config.js:30  url                    expected a string starting with "http"
```

It covers more than types, because a type system cannot:

- **Unknown section components** — including components added by a plugin, so a
  `section` that only works once a plugin is installed is verified here rather
  than at request time.
- **Plugins** — every entry in `plugins: [...]` must resolve, import, and
  complete `setup()` without throwing. A plugin that fails is reported as an
  error, and a plugin that loads is listed with what it registered:

  ```
  ⚠ check: /path/jprot.config.js is valid with 1 warning(s)
    ── warnings
      plugins/analytics.js  plugins["analytics"]  registers hooks html:head
  ```

- **Structural mistakes** in arrays of objects, which the editor often accepts
  silently.

Exit code is `0` when there are no errors, `1` otherwise — so it drops straight
into CI:

```yaml
- run: npx jprot check
- run: npx jprot lint
- run: npm test
```

`--strict` promotes warnings to errors, which is useful once your own plugins
are established and you want nothing unaccounted for.

`jprot check` is the cheap half of validation: it looks at configuration and
plugins. `jprot lint` is the expensive half — it reads every content file and
resolves every internal link, anchor, and asset. Run `check` first; a bad config
makes every other check meaningless.

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

## Linting content — `lint`

```bash
jprot lint
```

`jprot lint` is **site-aware**: it reads the whole site through the same Content
Graph the server uses, so every check is resolved against pages that actually
exist rather than against a file listing.

| Area | What it catches |
|---|---|
| Frontmatter | Missing `title`/`description`, malformed dates, unknown keys |
| Links | Internal links and `#anchor` targets that resolve to nothing |
| Images | `alt` text, and images whose file is not in `public/` |
| Routes | Pages not reachable by any navigation, sitemap, or feed entry |
| Anchors | Two headings on one page that produce the same slug |
| SEO | Duplicated or over-long titles and descriptions |
| Navigation | `order` collisions and gaps |
| Components | Unknown `section` names, and props a component does not declare |
| Assets | `og:image`, `avatar`, `logo`, and `icon` paths that 404 |

Tune it two ways — a whole glob in the config, or a single page in its
frontmatter:

```js
// jprot.config.js
export default { lint: { ignore: ['drafts/**', 'content/changelog.md'] } }
```

```yaml
# content/scratch.md
---
title: Scratch
lint: false
---
```

`jprot lint` exits `1` when it finds an error-level issue, so it belongs in CI
next to `jprot check`.

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

See [Customization → Markdown components](customization.md#markdown-components-no-javascript)
for how the placeholders resolve.
