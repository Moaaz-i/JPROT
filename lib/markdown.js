// Back-compatible entry point.
//
// The engine used to live in this single file. It now lives in `lib/markdown/`
// (blocks, inline, links, footnotes, sanitize, slugify) — import from
// `jprot/markdown` or `lib/markdown/index.js` for the pieces, and keep using
// this path for the one public factory:
//
//   import { createMarkdown } from 'jprot/lib/markdown.js'
export { createMarkdown, escapeHtml, safeUrl, slugify, MARKDOWN_DEFAULTS } from './markdown/index.js'
