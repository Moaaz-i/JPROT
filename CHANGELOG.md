# Changelog

All notable changes to JPROT are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Security and reliability: validated request paths and methods, stronger
  cross-origin headers, safe Markdown URL schemes, and frontmatter diagnostics.
- Architecture: extracted HTTP/security, URL, and component-rendering helpers
  from the server; cached parsed content by file metadata.
- CI: Node 18/20/22 test matrix and exact-version npm publish gating with
  provenance.

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