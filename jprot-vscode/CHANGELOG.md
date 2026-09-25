# Changelog

All notable changes to this extension are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-09-25

### Added

- **Live side-by-side preview** — a JPROT activity-bar panel that embeds the
  project's own dev server, follows the active Markdown editor and re-renders
  on save; status-bar entry with the running URL.
- **JPROT Markdown syntax highlighting** — injected TextMate grammar for
  frontmatter, `:::Component` shortcodes and `[value]` placeholders.
- **Snippets** — `jprot-page`, `jprot-post`, `jprot-project`, `jprot-resume`,
  `jprot-draft`, `jprot-hidden`, `jprot-shortcode`, `jprot-md-component`, plus
  `jprot-config` / `jprot-section` / `jprot-nav` for `jprot.config.js`.
- **Commands** — start/stop dev server, open current page in browser, refresh
  preview (also available from the editor title bar and view toolbar).
- **Zero-dependency design** — the extension drives the workspace's installed
  jprot (or the repository checkout) and has no build step of its own.
- Unit tests for URL mapping and integration tests that boot the real server.