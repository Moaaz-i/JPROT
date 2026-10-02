// JPROT's Markdown engine.
//
//   options ──▶ inline (spans)   ┐
//              blocks (blocks)  ├─▶ document state ─▶ HTML
//              definitions      │
//              footnotes        ┘
//
// `createMarkdown()` is the only public entry point; the pieces live in their
// own modules so a new syntax rule lands in one place instead of growing a
// single 500-line function. Rendering is synchronous and the document state is
// created per `render()` call, so one instance can render nested documents
// (shortcode children, Markdown components) without leaking state between them.
import { createBlockRenderer } from './blocks.js'
import { collectFootnoteDefs, collectLinkDefs } from './definitions.js'
import { renderFootnotes } from "./footnotes.js";
import { createInlineRenderer } from "./inline.js";
import { escapeHtml, safeUrl } from './sanitize.js'
import { slugify } from './slugify.js'

// Feature flags — every one can be turned off per project via
// `markdown: { … }` in jprot.config.js. Unknown keys are ignored, so a config
// written for a future flag still boots.
export const MARKDOWN_DEFAULTS = {
  inline: true,
  headings: true,
  lists: true,
  code: true,
  blockquote: true,
  hr: true,
  links: true,
  images: true,
  table: true,
  emphasis: true,
  footnotes: true,
  autolinks: true,
  taskLists: true,
}

export function createMarkdown(options = {}) {
  const md = { ...MARKDOWN_DEFAULTS }
  for (const key of Object.keys(MARKDOWN_DEFAULTS)) {
    if (options[key] !== undefined) md[key] = options[key] !== false
  }

  // Plugin-supplied source preprocessors, in registration order. This was in the
  // plugin API and in `jprot.d.ts` from the start, and the collected functions
  // were never read by anything — so `extendMarkdown({ extensions: [...] })`
  // validated its argument, stored it, and then did nothing at all, with no
  // error. A silently-inert extension is worse than a missing feature: a plugin
  // author sees the call succeed and the output unchanged.
  const extensions = Array.isArray(options.extensions) ? options.extensions : []

  function render(src, headingOut) {
    // Applied before the split so a preprocessor can rewrite structure (a
    // heading level, a container marker), not just inline text.
    for (const extend of extensions) {
      let next
      try {
        next = extend(String(src))
      } catch (e) {
        // Same rule as every other plugin callback: one bad handler is reported
        // and skipped rather than taking the page down.
        console.warn(`[jprot] markdown extension failed: ${e.message}`)
        continue
      }
      // A preprocessor that returns nothing has nothing to say. Requiring a
      // string keeps `(s) => { sideEffect() }` — a plausible slip — from
      // replacing the document with the string "undefined".
      if (typeof next === 'string') src = next
      else console.warn('[jprot] markdown extension returned a non-string; ignored')
    }

    const lines = String(src).split(/\r?\n/)

    // Per-render document state. `render` is synchronous, so a fresh object per
    // call is all the isolation the renderer needs — and it means a shortcode's
    // nested render can never corrupt the outer document's ids or footnotes.
    const notes = collectFootnoteDefs(lines)
    const doc = {
      headings: headingOut || [],
      usedIds: {},
      linkDefs: collectLinkDefs(lines),
      noteDefs: notes.defs,
      noteSpans: notes.spans,
      noteOrder: [],
    }
    const inline = createInlineRenderer(md, doc)
    doc.inline = inline
    const emit = createBlockRenderer(md, doc)

    let html = emit(lines, true)
    if (doc.noteOrder.length) html += renderFootnotes(doc, inline)
    return html
  }

  return {
    render,
    escapeHtml,
    safeUrl,
    slugify,
  }
}

export { escapeHtml, safeUrl, slugify }
