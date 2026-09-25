// Inline (span-level) Markdown: code spans, links, images, reference links,
// autolinks, footnote references, emphasis, strikethrough and backslash
// escapes.
//
// The pipeline is placeholder-based rather than AST-based: code spans and
// backslash escapes are lifted out into numbered placeholders, the text rules
// run over the reduced string, then the placeholders are restored. That keeps
// `**literal**` inside a code span and `` `code` `` inside emphasis correct
// without a full inline parser.
import { canonicalLink, referenceLink, renderImage, renderLink } from './links.js'
import { ESCAPE_RE, escapeHtml, safeUrl } from './sanitize.js'

// Creates the inline renderer for one document. `options` are the user-facing
// `markdown: { … }` feature flags, `doc` is the per-render document state that
// holds link definitions and the footnote order.
export function createInlineRenderer(options, doc) {
  const { links: linksOn, autolinks, footnotes, emphasis } = options

  // Delimiter-aware emphasis. Strong runs are resolved first (so a single `*`
  // inside `**…**` stays available for nesting), then single-em runs. Guards
  // reject delimiters squeezed against whitespace or another delimiter, which
  // keeps pathology like `****` literal instead of mangled.
  function renderEmphasis(s) {
    if (!emphasis) return s
    s = s.replace(/\*\*\*(?![\s*])([\s\S]+?)(?<!\s)\*\*\*/g, (m, inner) => {
      if (!inner.trim()) return m
      return `<strong><em>${renderEmphasis(inner)}</em></strong>`
    })
    s = s.replace(/\*\*(?![\s*])([\s\S]+?)(?<!\s)\*\*/g, (m, inner) => {
      if (!inner.trim()) return m
      return `<strong>${renderEmphasis(inner)}</strong>`
    })
    s = s.replace(/__(?![\s_])([\s\S]+?)(?<!\s)__/g, (m, inner) => {
      if (!inner.trim()) return m
      return `<strong>${renderEmphasis(inner)}</strong>`
    })
    s = s.replace(/(^|[^\w*])\*(?![\s*])([\s\S]+?)(?<!\s)\*(?!\*)/g, (m, pre, inner) => {
      if (!inner.trim()) return m
      return `${pre}<em>${renderEmphasis(inner)}</em>`
    })
    s = s.replace(/(^|[^\w_])_(?![\s_])([\s\S]+?)(?<!\s)_(?!_)/g, (m, pre, inner) => {
      if (!inner.trim()) return m
      return `${pre}<em>${renderEmphasis(inner)}</em>`
    })
    return s
  }

  function render(str) {
    let s = str
    const codes = []
    const escapes = []

    // Backslash escapes first, so escaped ASCII punctuation can't trigger any
    // later inline rule (emphasis, code spans, links, images, autolinks).
    s = s.replace(ESCAPE_RE, (m, ch) => {
      escapes.push(escapeHtml(ch))
      return `\u0001${escapes.length - 1}\u0001`
    })

    // Protect inline code spans first so emphasis/bold rules can't touch
    // their contents. Placeholders are restored after all inline rules run.
    s = s.replace(/`([^`]+)`/g, (m, code) => {
      codes.push(escapeHtml(code))
      return `\u0000${codes.length - 1}\u0000`
    })

    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, alt, src, title) => renderImage(alt, src, title))

    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, text, url, title) => renderLink(text, url, title))

    if (linksOn) {
      s = s.replace(/\[([^\]]+)\]\[([^\]]+)\]/g, (m, text, id) => referenceLink(text, id, doc.linkDefs) || m)
      s = s.replace(/\[([^\]]+)\]\[\]/g, (m, text) => referenceLink(text, text, doc.linkDefs) || m)
      s = s.replace(/\[([^\]]+)\](?!\()/g, (m, id) => referenceLink(id, id, doc.linkDefs) || m)
    }

    if (autolinks) {
      s = s.replace(/<((?:https?|ftp):\/\/[^<>\s]+)>/g, (m, url) => {
        const safe = safeUrl(url)
        return safe === '#' ? m : `<a href="${escapeHtml(safe)}">${escapeHtml(url)}</a>`
      })
      s = s.replace(/<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>/g, (m, email) => {
        return `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
      })
    }

    // Footnote references. `[^id]` has no `(` or definition match, so it is
    // safe against the link rules above; unresolved references stay literal.
    if (footnotes) {
      s = s.replace(/\[\^([A-Za-z0-9_\-]+)\]/g, (m, id) => {
        if (!(id in doc.noteDefs)) return m
        if (!doc.noteOrder.includes(id)) doc.noteOrder.push(id)
        const n = doc.noteOrder.indexOf(id) + 1
        return `<sup class="footnote-ref" id="fnref-${id}"><a href="#fn-${id}">${n}</a></sup>`
      })
    }

    s = renderEmphasis(s)
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')

    // Restore the escaped inline code spans, then backslash escapes.
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[Number(i)]}</code>`)
    s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => escapes[Number(i)])

    return s
  }

  return { render, renderEmphasis, canonicalLink }
}
