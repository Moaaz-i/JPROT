# Changelog

All notable changes to this extension are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-09-28

### Removed — the live preview is gone

This is a **breaking** release. The side-by-side preview panel and everything it
needed — `src/preview.js`, `src/jprotServer.js`, `src/urls.js`, the `JPROT:`
commands, the activity-bar view, the three `jprotVscode.*` settings — has been
**removed**. The extension is now grammar and snippets only: no runtime code,
nothing to start, nothing to configure.

Why it went, so it is never rediscovered as a mystery:
`src/jprotServer.js` spawned the dev server with `process.execPath` and never
set `ELECTRON_RUN_AS_NODE=1`. Inside VS Code `process.execPath` is the
Code/Electron binary, so without that variable the extension launched VS Code
with the CLI path as an argument instead of running a Node child — the preview
could never work, and it was removed rather than half-fixed.

What stays: the JPROT Markdown grammar (`source.markdown.jprot`) and every
snippet (`jprot-page` … `jprot-nav`).

### Added

- `test/grammar.test.js` — parses the grammar and both snippet files so a
  malformed grammar fails before it reaches the Marketplace.

## [0.1.0] - 2026-09-25