// Document-level definitions: `[id]: url` link references and `[^id]: …`
// footnote definitions.
//
// Both are collected in a single code-fence-aware pre-scan of the document so a
// reference resolves even when its definition appears further down the file
// (the block emitter then skips those lines, they were already consumed here).

// First definition wins, code fences and footnote definitions are skipped.
export function collectLinkDefs(lines) {
  const defs = {}
  let inCode = false
  let k = 0
  while (k < lines.length) {
    const line = lines[k]
    if (/^\s*```/.test(line)) { inCode = !inCode; k++; continue }
    if (inCode) { k++; continue }
    if (/^\[\^[A-Za-z0-9_\-]+\]:/.test(line)) { k++; continue }
    const m = /^\[([^\]]+)\]:\s*(?:<([^>]*)>|(\S+))(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/.exec(line)
    if (m) {
      const id = m[1]
      const url = (m[2] || m[3] || '').trim()
      if (url && !(id in defs)) defs[id.toLowerCase()] = url
    }
    k++
  }
  return defs
}

// The first line holds the note text, indented continuation lines are appended.
export function collectFootnoteDefs(lines) {
  const defs = {}
  let inCode = false
  let k = 0
  while (k < lines.length) {
    const line = lines[k]
    if (/^\s*```/.test(line)) { inCode = !inCode; k++; continue }
    if (inCode) { k++; continue }
    const m = /^\[\^([A-Za-z0-9_\-]+)\]:\s*(.*)$/.exec(line)
    if (m) {
      const id = m[1]
      if (!defs[id]) defs[id] = []
      defs[id].push(m[2])
      k++
      while (k < lines.length) {
        const next = lines[k]
        const indent = /^\s*/.exec(next)[0].length
        if (next.trim() === '' || indent === 0) break
        defs[id].push(next.trimStart())
        k++
      }
      continue
    }
    k++
  }
  return defs
}

export const FOOTNOTE_DEF_RE = /^\[\^[A-Za-z0-9_\-]+\]:/
export const LINK_DEF_RE = /^\[[^\]]+\]:\s*\S/
