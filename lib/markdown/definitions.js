// Document-level definitions: `[id]: url` link references and `[^id]: …`
// footnote definitions.
//
// Both are collected in a single code-fence-aware pre-scan of the document so a
// reference resolves even when its definition appears further down the file
// (the block emitter then skips those lines, they were already consumed here).
//
// The fence test and the container rule are imported rather than written out
// again. That is not tidiness: the block emitter skips a definition line on the
// strength of the same "this is a definition" pattern, so if the two sides
// disagree about where code blocks start they disagree about which lines have
// been consumed, and the author's text is dropped from the page.
import { forEachOutsideCode } from './fence.js'

// A link reference definition: `[label]: destination` with an optional title, and
// nothing else on the line.
//
// This regex is the *only* definition of what a link definition is, and both the
// collector and the block emitter's skip test use it. That is load-bearing. They
// used to disagree: the emitter skipped anything shaped like `[x]: <non-space>`
// while the collector required the whole line to be the definition. So
// `[a]: /url #fragment` was skipped as a definition the collector had consumed
// and the collector had not consumed — the fragment line, and the sentence the
// author had put after it, vanished from the page. Anchoring at both ends is
// also what CommonMark does: trailing junk means the line is not a definition.
const LINK_DEF_RE = /^\[([^\]]+)\]:\s*(?:<([^>]*)>|(\S+))(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/

// A footnote definition opener. The collector uses this and the emitter skips on
// it, for the same reason.
const FOOTNOTE_DEF_RE = /^\[\^([A-Za-z0-9_-]+)\]:/

// First definition wins, code fences and footnote definitions are skipped.
export function collectLinkDefs(lines) {
  const defs = {}
  forEachOutsideCode(lines, (line) => {
    if (FOOTNOTE_DEF_RE.test(line)) return
    const m = LINK_DEF_RE.exec(line)
    if (!m) return
    const id = m[1]
    const url = (m[2] || m[3] || '').trim()
    if (url && !(id in defs)) {
      defs[id.toLowerCase()] = { url, title: m[4] || m[5] || m[6] || '' }
    }
  })
  return defs
}

/**
 * Collects footnote definitions and records how many source lines each consumed.
 *
 * The line count is returned alongside because the block emitter has to skip
 * exactly the lines this function claimed, and the two used to disagree about how
 * many those are. The emitter skipped the definition line *and every indented line
 * after it*; this function stops collecting at a code fence, because a line of
 * backticks inside what the author may have meant as a continuation is a fence to
 * both sides of the parser. So a definition followed by an indented fence lost
 * everything from the fence down: the emitter skipped the lines, the collector
 * never stored them, and the text left the page.
 *
 * So the collector is the authority on the span, and the emitter asks.
 *
 * **A definition ends at a fence.** That is the one rule that makes the count mean
 * anything. The span is a *count*, and the emitter spends it as "skip the next N
 * lines from here" — so the collector has to count lines the emitter will also skip,
 * in the same order, or the two run off together. Fences break that, because
 * `forEachOutsideCode` hides them:
 *
 *     [^a]: dolor
 *     ```
 *     gone
 *     ```
 *       tail
 *
 * The fence and everything inside it are invisible to the collector, so it counts the
 * definition line and then `  tail`, and reports a span of 2. The emitter spends those
 * 2 on `[^a]: dolor` and the fence — skipping the *opener*, which leaves `gone` out of
 * any code block and, when the span is long enough to reach past it, drops it from the
 * page entirely. The fuzz suite found it on a seed where an author's fence landed
 * inside a footnote: `gone` was in neither the rendered code nor the note body, and
 * nothing reported it.
 *
 * Ending the definition at the fence makes the count and the lines agree, and it is
 * also what the emitter already believes: a fence is a block boundary everywhere else
 * in it, so it is one here too.
 *
 * @returns {{defs: Record<string, string[]>, spans: Map<string, number>}}
 */
export function collectFootnoteDefs(lines) {
  const defs = {}
  const spans = new Map()
  let pending = null
  forEachOutsideCode(lines, (line) => {
    // A continuation of the definition being collected. Indented, non-blank, and
    // directly after it.
    if (pending && line.trim() !== '' && /^[ \t]+/.test(line)) {
      defs[pending].push(line.trimStart())
      spans.set(pending, spans.get(pending) + 1)
      return
    }
    pending = null
    const m = FOOTNOTE_DEF_RE.exec(line)
    if (m) {
      const id = m[1]
      if (!defs[id]) defs[id] = []
      // Everything after the `]:` is the note body, on the same line.
      defs[id].push(line.slice(m[0].length).replace(/^\s*/, ''))
      pending = id
      spans.set(id, 1)
    }
  }, () => {
    // A fence line. The collector cannot see it through `forEachOutsideCode`, and
    // leaving `pending` set is exactly the bug described above.
    pending = null
  })
  return { defs, spans }
}

export { FOOTNOTE_DEF_RE, LINK_DEF_RE }
