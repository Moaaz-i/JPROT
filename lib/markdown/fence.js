// What a code fence is, in one place.
//
// This exists because the block emitter and the definition pre-scan both have to
// answer the question, and they have to give the same answers. When they
// disagreed, text disappeared from the page:
//
//     ````\n                 <- four backticks
//     See [^a] here.
//     [^a]: dolor           <- the definition text
//
// The pre-scan tested for any run of backticks, so it decided the rest of the
// document was inside a code block and collected nothing. The block emitter
// required exactly three, so it decided the same lines were an ordinary
// paragraph — and then skipped the `[^a]:` line as a definition it had already
// consumed. Nothing had consumed it. The sentence was gone from the page with no
// error anywhere.
//
// It is tempting to go further and have this module also decide where a fence
// *ends*, since the emitter ends an unclosed one at the close of its container
// (a list item) while a flat scan would run it to the end of the document. That
// was tried, using indentation as the proxy for "has the container ended", and it
// is wrong: the pre-scan has no container structure, so it has to guess, and a
// guess desynchronises it in the other direction. A fence indented by three
// spaces inside a paragraph looks like a container to an indentation test but is
// not one, so the guess closed a fence on the emitter's *content* line and then
// re-opened one on the real closing fence — leaving the pre-scan inside code for
// the rest of the document and every later definition uncollected.
//
// The safety lives on the other side instead. The emitter does not re-derive
// "this line was a definition" from a pattern of its own; it asks the pre-scan
// what was actually collected. So when the two sides do disagree, the worst case
// is that a definition line renders as the text it is, which is visible and
// harmless, rather than text vanishing from the page.

// A fence opener: three backticks or three tildes, an optional info string,
// nothing else on the line. The same shape opens and closes a fence, which is
// how every side can keep a single flag.
//
// Exactly three, and only `\w` after it — so a run of four is text, which is the
// deliberate asymmetry the emitter and the pre-scan have to agree on.
export const FENCE_OPEN_RE = /^\s*(?:```|~~~)(\w*)\s*$/

// Which character opened the fence. A `~~~` line must not close a ``` fence (or
// the reverse): CommonMark matches the character, and a document that *shows* a
// tilde fence inside a backtick one is exactly the shape that breaks when the
// character is ignored — the inner opener closes the outer fence and the rest of
// the page is read as code.
export const FENCE_MARK_RE = /^\s*(`|~)/

/** A fence state machine's state. Create it with {@link newFenceState}. */
export function newFenceState() {
  return { inCode: false, mark: '' }
}

/**
 * Feeds one line to a fence state machine and says what the line did.
 *
 * `'open'` — a fence started here; `'close'` — the running fence ended here;
 * `'inside'` — a fence-shaped line that belongs *to* the running fence, so it is
 * code rather than a boundary; `null` — not a fence line at all.
 *
 * This exists as one function because there are four places that have to agree:
 * the block emitter, the definition pre-scan, the footnote collector's span
 * counting, and the prose model in the fuzz suite. They each used to re-type the
 * rule, and re-typing is how they stopped agreeing — a fence one side can see and
 * the other cannot is a line that is counted but never stored, which takes text
 * off the page with no error anywhere.
 *
 * `state` is mutated in place; the caller owns it.
 *
 * One pass over a document, so a document that is one enormous unclosed fence
 * stays linear.
 */
export function fenceStep(state, line) {
  if (!FENCE_OPEN_RE.test(line)) return null
  const mark = FENCE_MARK_RE.exec(line)[1]
  if (!state.inCode) {
    state.inCode = true
    state.mark = mark
    return 'open'
  }
  if (mark === state.mark) {
    state.inCode = false
    state.mark = ''
    return 'close'
  }
  return 'inside'
}

/**
 * Calls `visit(line, index)` for every line of `lines` that is not inside a code
 * fence, using the same step the emitter uses: a fence opener opens, the next
 * fence *of the same character* closes, and an unclosed fence runs to the end of
 * what was scanned.
 *
 * One pass, so a document that is one enormous unclosed fence stays linear.
 *
 * `onFence(index)` is called for the fence lines themselves, which `visit` never
 * sees — but only for the lines that actually toggled the flag. It exists for the
 * footnote collector, which has to end a definition *at* a fence: the collector
 * counts the lines it consumed, and the emitter skips that many lines from the
 * definition, so the two have to be counting the same lines — and a fence the
 * collector cannot see is a line it counted past without storing.
 */
export function forEachOutsideCode(lines, visit, onFence) {
  const state = newFenceState()
  for (let k = 0; k < lines.length; k++) {
    const step = fenceStep(state, lines[k])
    if (step === 'open' || step === 'close') {
      if (onFence) onFence(k)
      continue
    }
    if (state.inCode) continue
    visit(lines[k], k)
  }
}
