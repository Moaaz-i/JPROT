# Changelog

All notable changes to this extension are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.1] - 2026-10-03

### Fixed — the grammar was registered against a scope that does not exist

The highlighting rules never reached any editor, for two reasons, both fixed
here:

- `injectTo` said `source.markdown`. No VS Code or Cursor build has ever
  shipped a Markdown grammar with that scope — the built-in one is
  `text.html.markdown` — so the injection was registered against a name
  nothing resolves, and the rules were silently unreachable. It now injects
  into `text.html.markdown`, matching the grammar's own `injectionSelector`.
- The contribution also claimed `language: "markdown"`. A grammar that claims
  a language *is* that language: it would have replaced the built-in Markdown
  grammar for every `.md` file with these four JPROT-specific rules, dropping
  headings, emphasis, links and code blocks. The field is removed; injection
  grammars select their host through `injectTo` alone.

`test/grammar.test.js` now pins both (`injectTo` deep-equals
`["text.html.markdown"]`, no `language` field, `injectionSelector` agrees), so
neither can ship again unnoticed.

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