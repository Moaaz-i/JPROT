# Changelog

All notable changes to JPROT are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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