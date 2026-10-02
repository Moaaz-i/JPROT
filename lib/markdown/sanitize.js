// HTML/text escaping and URL sanitizing for the Markdown renderer.
//
// These two helpers are the security boundary of the renderer: nothing that
// reaches the output does so without passing through `escapeHtml`, and every
// URL is checked by `safeUrl` so `javascript:`/`vbscript:` and non-image
// `data:` payloads can never reach an `href`/`src`.
//
// Both are re-exports from core/utils.js, which is the single definition of
// "escaped" and "safe link" in the project — so the theme components and the
// renderer cannot end up enforcing different rules. They were separate copies
// once; `test/unit/property.test.js` pins the two spellings to the same output so
// they cannot become separate copies again.

// ASCII punctuation escapable with a backslash (CommonMark §2.2): a lone
// backslash followed by one of these characters yields the literal char.
export const ESCAPE_RE = /\\([!"#$%&'()*+,\-./:;<=>?@$^_`{|}~[\]\\])/g

// `esc` escapes all five HTML metacharacters. The apostrophe is included so a
// plugin extension emitting `attr='…'` cannot get a live quote; today every
// attribute the renderer emits is double-quoted, so it costs nothing in the
// rendered result.
//
// Note this also adopts `esc`'s handling of a missing value: `escapeHtml(null)`
// used to produce the literal text `null`, where `esc(null)` produced nothing.
// A frontmatter key that is absent should render as absent.
export { esc as escapeHtml } from '../../core/utils.js'

// Reject control characters, `javascript:`/`vbscript:` and non-image `data:`
// URLs. Anything rejected becomes an inert `#`. The implementation lives in
// core/utils.js so there is only one copy to keep correct.
export { safeHref as safeUrl } from '../../core/utils.js'
