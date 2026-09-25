// HTML/text escaping and URL sanitizing for the Markdown renderer.
//
// These two helpers are the security boundary of the renderer: nothing that
// reaches the output does so without passing through `escapeHtml`, and every
// URL is checked by `safeUrl` so `javascript:`/`vbscript:` and non-image
// `data:` payloads can never reach an `href`/`src`.

// ASCII punctuation escapable with a backslash (CommonMark §2.2): a lone
// backslash followed by one of these characters yields the literal char.
export const ESCAPE_RE = /\\([!"#$%&'()*+,\-./:;<=>?@$^_`{|}~[\]\\])/g

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Reject control characters, `javascript:`/`vbscript:` and non-image `data:`
// URLs. Anything rejected becomes an inert `#`.
export function safeUrl(value, { image = false } = {}) {
  const url = String(value || '').trim()
  if (!url || /[\u0000-\u001f\u007f]/.test(url)) return '#'
  if (/^(?:javascript|vbscript):/i.test(url)) return '#'
  if (/^data:/i.test(url) && !(image && /^data:image\//i.test(url))) return '#'
  return url
}
