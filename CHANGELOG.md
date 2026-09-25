# Changelog

All notable changes to JPROT are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-09-25

### Added

- **VSCode extension** (`jprot-vscode/`): live side-by-side preview of your site
  in the editor, JPROT-specific Markdown syntax highlighting (frontmatter,
  `:::Component` shortcodes, `[value]` placeholders) and snippets for pages,
  posts, projects, resumes and `jprot.config.js`. The extension drives the
  project's own jprot server — no bundled runtime, no build step.
- **`--allow-embed`**: an explicit dev-server opt-in that relaxes the framing
  headers (`X-Frame-Options`, `frame-ancestors`, `Cross-Origin-Resource-Policy`)
  so the site can live inside an iframe — what editor live previews need.
  Framing stays fully blocked by default; every other security header is
  unchanged. Exposed as `JprotOptions.allowEmbed` in the API.

## [0.5.1] - 2026-09-25

### Fixed

- Sitemap: `<image:image>` entries are now nested **inside** their `<url>`
  element instead of being emitted as direct children of `<urlset>`. Pages with
  an `image` frontmatter value no longer produce a sitemap that Google's
  validator rejects with "This tag was not recognized / Parent tag: urlset".

## [0.5.0] - 2026-09-24

### Added

- **`npm create jprot@latest`**: a one-command scaffold that scaffolds a site
  and installs its dependencies (`--portfolio` / `--docs` / `--resume`,
  `--no-install` to skip the install step). Ships as the `create-jprot`
  package alongside `jprot`.
- **Footnotes**: `[^id]` references any `[^id]: …` definition, forward
  references included, with a generated notes section and backlinks
  (`markdown.footnotes`, default on).
- **Autolinks**: `<https://…>`, `<ftp://…>` and `<you@example.com>` become
  links automatically (`markdown.autolinks`, default on).
- **Nested lists**: lists can contain sub-lists, continuation paragraphs and
  code blocks at any depth.
- **Joined paragraphs**: consecutive non-blank lines form a single `<p>`
  instead of one paragraph per line.
- **Backslash escapes**: `\*`, `\[]`, `` \` `` and the rest of the ASCII
  punctuation set now render literally instead of triggering Markdown.
- **Reference-style links**: `[text][id]`, `[text][]` and shortcut `[text]`
  resolve against `[id]: url` definitions anywhere in the document; labels are
  case-insensitive, code-fence-aware, and unknown references stay literal.
- **Nested emphasis**: `**bold *inner* mark**`, `***bold italic***` and the
  `__`/`_` variants render correctly, while pathological runs (`****`) stay
  literal.
- **Task lists**: `- [x]` / `- [ ]` items render as disabled checkboxes with a
  `task-list-item` class (`markdown.taskLists`, default on).

### Changed

- `jprot/scaffold` is now exported from the package, so `create-jprot` (and
  any tooling) can reuse the scaffold engine instead of duplicating it.
- `MarkdownConfig` in `jprot.d.ts` now matches the engine exactly
  (`highlight` / `tags`, which were never implemented, were removed).
- `jprot init` and the docs point newcomers to `npm create jprot@latest` first.
- `.gitignore` now covers `node_modules/` and `__pycache__/`.

## [0.4.0] - 2026-09-23

### Added

- **Markdown components**: `jprot g component <Name> --format md` scaffolds a
  `.md` component — frontmatter holds its default values and the body uses
  `[value]` placeholders. No JavaScript required. Renders through the Markdown
  engine, wrapped in a `.md-component-<Name>` div for pure-CSS styling.
- **Docs navigation**: the docs sidebar and previous/next links now include
  nested pages (e.g. `guide/nested.md`) sorted by frontmatter `order`, excluding
  blog posts and project entries so they don't clutter the tree.
- Examples: `Hobbies.md` and a styled `Spotlight.md` + `spotlight.css`
  Markdown-component sample in `examples/components/`.
- Lint reports invalid `date` frontmatter instead of letting it silently break
  ordering and feeds.

### Changed

- `jprot export` now folds the deployment `basePath` into the site `url`, so
  sitemap, RSS, `robots.txt`, `llms.txt` and canonical/OG URLs point at the real
  host for project-site deployments without hand-editing `url`.
- Static exports prefix `manifest.json` `start_url`, `scope` and icon paths with
  the base path.
- HTTP redirects (`.md` URLs and trailing slashes) now use root-relative
  `Location` headers, so they never leak the production `site.url` to dev/proxy
  visitors.
- `[value]` interpolation in Markdown components protects whole `[...](...)`
  link/image spans and renders arrays as bullet lists / objects as JSON.
- `jprot g component` validates `--format js|md`.
- Blog posts sort by a zero-padded date key, so `2026-1-5` no longer outranks
  `2026-10-1`.

### Fixed

- IPv6 hosts (`HOST=::1`) now produce valid URLs (`http://[::1]:4114`) in the
  banner and request parsing.
- Shortcode scan treats a `:::` line inside a fenced code block as content, not
  a close fence.
- RSS feeds stop emitting a broken `<pubDate>Invalid Date</pubDate>` for
  missing/unparseable dates.
- Frontmatter single-quoted values now unescape `\'`.
- Trailing newline normalization in interpolated template bodies.

## [0.3.0] - 2026-09-20

### Added

- **Element catalog**: `jprot search [query]` lists ready-made components and
  `jprot add <Name>` installs one into `theme/components/` from a plain static
  catalog site. The catalog URL resolves, in order, from `--from <url>`, the
  `catalogUrl` config key, or the default shipped with the distribution.
- **Self-closing shortcodes**: a `:::Component attrs` line now renders on its
  own without a closing `:::` fence (no children). The block form — closing
  fence with Markdown children — still works, and an unterminated block still
  degrades to literal text instead of swallowing the rest of the page.
- **Docs**: new "Catalog elements" page (`content/catalog.md`) covering the full
  `add`/`search` workflow, plus a refreshed getting-started, quick-start,
  configuration, content, deploy, and FAQ documentation.
- Docs mode sidebar with on-page navigation and previous/next links (folded in
  from Unreleased).

### Changed

- CLI: unknown subcommands now print an error instead of silently starting the
  dev server; `jprot new` accepts `resume`; scaffolded components validate their
  `--palette`.
- Scaffold: optional `catalogUrl` config key, hero `badge`/`avatar` placeholders,
  project `cover` comment, and a clearer homepage intro.
- Static exports include `.nojekyll` for GitHub Pages (from Unreleased).

### Fixed

- Single-line, self-closing shortcodes rendered as literal text instead of the
  component, which left catalog previews shapeless.
- Security and reliability hardening rolled in from Unreleased: validated
  request paths/methods, stronger cross-origin headers, safe Markdown URL
  schemes, frontmatter diagnostics, and cached parsed content keyed by file
  metadata.
- CI: Node 18/20/22 test matrix and exact-version npm publish gating with
  provenance (from Unreleased).

## [0.2.0] - 2026-09-05

### Added

- **CLI**: `init` (`--portfolio`/`--docs`/`--resume`), `new` (`post`/`page`/`project`/`resume`),
  `g component` (`--palette` section/cards/cta/stats), `g list`, `lint`, `export`, `--prod`, `--no-watch`.
- **Server**: SSR with SPA navigation, hot-reload file watcher (with polling fallback), drafts
  (visible in dev, `404` in production), custom 404 via `content/404.md`, themed default 404.
- **Themes**: 4 built-in variants (default, minimal, creative, corporate) with a cycle button and
  a `ThemePicker` component; light/dark toggle persisting in `localStorage`.
- **Content**: Markdown with YAML frontmatter, `:::Component` shortcodes (typed attributes,
  nested, fence-aware), project cards, blog listing, printable `resume` layout.
- **Customization**: CSS-variable restyling (`theme/custom.css`), drop-in component overrides
  (`theme/components/`), scaffolded components, ready-made theme packs in `examples/`.
- **SEO & discovery**: canonical + OG + Twitter meta, JSON-LD (Organization, Article/BlogPosting,
  Person, BreadcrumbList, optional SearchAction), file-backed SVG og:image, hreflang,
  `robots.txt`, `sitemap.xml` (git-aware `lastmod`), `feed.xml`/`rss.xml`, `llms.txt` +
  `llms-full.txt`, `manifest.json`, favicon.
- **Search**: instant client search (`Cmd/Ctrl + K`) against a live-built `/@jprot/search.json`.
- **Export**: `jprot export` renders the entire site to static `dist/` (fingerprinted CSS,
  optional og images, `404.html`, all feeds/meta, `public/` copied as-is).
- **Lint**: broken internal links, missing title/description/alt, oversized local images.
- **Programmatic API**: `createJprot`, `renderPage`, `exportSite`, `runLint`, `scaffoldSite`,
  `scaffoldNew`, `scaffoldComponent` with TypeScript types in `jprot.d.ts`.
- **Security**: strict CSP with per-response nonces, security headers, ETag revalidation,
  path-traversal guards on content and stylesheet serving.
- **Docs**: full documentation site inside `content/`, editor snippet scaffolds, startup config hints.