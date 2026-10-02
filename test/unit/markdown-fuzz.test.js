// Adversarial Markdown tests: everything the engine supports, plus the malformed
// neighbour of every one of it, checked for defects a reader would actually see.
//
// The distinction that shapes this file: `test/unit/markdown.test.js` asserts
// what the renderer *produces* for inputs its author chose, so it can only catch
// a regression in those specific cases. This file asserts what the rendered
// result must *be true of* for any input at all, so a defect shows up the first
// time the generator happens to produce the shape that triggers it — and the
// minimal case it prints is small enough to read.
//
// The three oracles, in order of how loudly they fail:
//
//   1. Nothing the author wrote disappears. Each generated block carries a unique
//      token, and every token must appear in the visible text of the output. A
//      block parser's classic visible bug is a line mis-scanned into a list item
//      or a quote and quietly dropped; no snapshot catches that, because the
//      snapshot happily records the missing sentence.
//
//   2. The HTML is structurally sound: known tags only, balanced and correctly
//      nested, quoted attributes, no event handlers, no unescaped `<`.
//
//   3. Nothing dangerous survived: no `javascript:` in an href, no live markup
//      inside a code span, no duplicate id for a reader's anchor to land on.
//
// Case count is `MD_FUZZ_CASES` (default 2000). The corpus is seeded, so a
// failure prints the seed that reproduces it.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createMarkdown } from '../../lib/markdown.js'
import { parseFrontmatter } from '../../lib/frontmatter.js'
import { FENCE_OPEN_RE } from '../../lib/markdown/fence.js'
import { BLOCK_PATTERNS } from '../../lib/markdown/blocks.js'
import {
  FOOTNOTE_DEF_RE, LINK_DEF_RE, collectFootnoteDefs, collectLinkDefs,
} from '../../lib/markdown/definitions.js'
import {
  attributeValues, codeContents, compact, fuzzDocument, makeRandom, markersOf,
  randInt, scanHtml,
} from '../helpers/md-fuzz.js'

const CASES = Number(process.env.MD_FUZZ_CASES || 2000)
const SEED = Number(process.env.MD_FUZZ_SEED || 1)

const md = createMarkdown()

/** Every tag the renderer is allowed to emit. Anything else came from the
 * document instead of from the renderer. */
const ALLOWED_TAGS = new Set([
  'p', 'pre', 'code', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'input', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr', 'blockquote', 'aside', 'strong', 'em', 'del', 'a', 'img', 'sup',
  'section',
])

/** Text that must never appear in rendered output. `undefined` and `null` mean a
 * template interpolated a missing value; `[object Object]` means one got
 * serialised. All three are visible, and all three are the signature of a
 * renderer that lost track of its own state. */
const GARBAGE = ['undefined', '[object Object]', 'NaN', 'null', '$1', '$2', '$&']

function show(s) {
  return JSON.stringify(s).replace(/[\u007f-\u009f]/g, (c) =>
    `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/* ---------------- the runner ---------------- */

/**
 * Run `check` over generated documents.
 *
 * `check(ctx)` returns `true` when the document is sound and a sentence
 * explaining the visible defect otherwise. On failure the document is shrunk —
 * first by halving its lines, then by dropping them one at a time — and the
 * reason is recomputed for the shrunk document, so the report shows a minimal
 * reproduction and a reason that belongs to *it*. A failure report naming a
 * forty-line document is not a bug report.
 */
function forAllDocs({ name, cases, check, seed = SEED, markup = true }) {
  const failures = []
  for (let i = 0; i < cases; i++) {
    const caseSeed = (seed + i * 2654435761) >>> 0
    const rnd = makeRandom(caseSeed)
    const src = fuzzDocument(rnd, { markup })
    let reason
    try {
      reason = check(src)
    } catch (e) {
      reason = `threw ${e.name}: ${e.message}`
    }
    if (reason !== true) failures.push({ src, reason, seed: caseSeed })
  }
  if (!failures.length) return

  const { seed: badSeed } = failures[0]
  let lines = failures[0].src.split('\n')
  let reason = failures[0].reason

  // A shrunk document must keep every marker the original had, or the report is
  // a reproduction of a *different* failure: the tokens in the removed lines are
  // gone, so a property that checks for them now reports the removal instead of
  // the defect. The required set is recomputed for each candidate, so a candidate
  // that drops a token — or invents a new requirement, which a line removed from
  // a reference could do — is discarded for this second, unrelated reason.
  const required = new Set(requiredTokens(failures[0].src))
  // A footnote definition and the reference that points at it are one unit. Drop
  // the definition and the renderer correctly renders nothing — a definition
  // nothing references is dropped on purpose — so the token property then reports
  // a token that the design intends to discard, and the "minimal case" is a
  // footnote policy question rather than the defect under investigation. Both
  // halves are kept, or neither.
  const pairedIds = new Set(footnotePairs(failures[0].src))
  const keepsMarkers = (candidate) => {
    const text = candidate.join('\n')
    const got = new Set(requiredTokens(text))
    for (const marker of required) if (!got.has(marker)) return false
    for (const marker of got) if (!required.has(marker)) return false
    for (const id of pairedIds) {
      if (text.includes(`[^${id}]`) !== text.includes(`[^${id}]:`)) return false
    }
    return true
  }

  for (let size = Math.max(1, lines.length >> 1); size >= 1; size = size >> 1) {
    let changed = true
    while (changed) {
      changed = false
      for (let i = 0; i + size <= lines.length; i++) {
        const candidate = lines.slice(0, i).concat(lines.slice(i + size))
        if (!candidate.length || !keepsMarkers(candidate)) continue
        let bad
        try {
          bad = check(candidate.join('\n')) !== true
        } catch {
          bad = true
        }
        if (bad) {
          lines = candidate
          changed = true
          break
        }
      }
    }
    if (size === 1) break
  }

  const smallest = lines.join('\n')
  try {
    reason = check(smallest)
  } catch (e) {
    reason = `threw ${e.name}: ${e.message}`
  }

  assert.fail(
    `${name}\n` +
    `  minimal failing document:\n${indent(smallest)}\n` +
    `  reason: ${reason}\n` +
    `  ${failures.length}/${cases} cases failed; first from seed ${badSeed}\n` +
    `  replay with fuzzDocument(makeRandom(${badSeed}))\n` +
    `  the unshrunk document was:\n${indent(failures[0].src)}`,
  )
}

function indent(s) {
  return s.split('\n').map((l) => `    ${show(l)}`).join('\n')
}

function render(src) {
  const headings = []
  const html = md.render(src, headings)
  return { html, headings }
}

/**
 * The renderer's line structure: `\r\n` or `\n`, and nothing else.
 *
 * A lone `\r` is *not* a line break here — `lib/markdown/index.js` splits on
 * `/\r?\n/` — so it must not be one in the oracle either, and it is surprisingly
 * easy to get wrong for free. JavaScript's `m` flag treats `\r` as a line
 * terminator, so a model that splits with `split('\n')` and then matches
 * `/^…/gm` sees line starts the renderer does not: a document written with bare
 * `\r` arrives as one enormous line, the model still finds `[^a]:` "at the start
 * of a line" after the `\r`, and concludes the page owes a footnote superscript
 * it is never going to get. Every line-structure rule below goes through this.
 */
function splitLines(src) {
  return src.split(/\r?\n/)
}

/**
 * Replaces inline code spans with blanks, keeping newlines and column width.
 *
 * This mirrors `lib/markdown/inline.js` exactly rather than following CommonMark,
 * because its job is to predict the renderer and a stricter rule predicts it
 * wrongly. The renderer's rule is `` /`([^`]+)`/g ``: a *single* backtick opens,
 * one or more non-backticks follow, a single backtick closes, and the pair is
 * consumed. Backtick *runs* are therefore not run-length matched — `` ```` `` is
 * two empty candidates, neither of which matches, so it renders as literal text.
 * CommonMark would call the last backtick of a run the opener and the first of the
 * next run the closer, and on `` ````` `` the two disagree completely: the renderer
 * shows five literal backticks, a CommonMark model swallows every paragraph between
 * two runs and reports the footnote references inside them as code. The property
 * below caught precisely that, on a document that was nothing but stray backticks.
 *
 * A span can also only close inside the block that opened it, because the emitter
 * runs its inline rules one block at a time — `inline.render(para.join('\n'))`, one
 * call per heading, list item, quote line and table cell. So the blanking below runs
 * per *inline scope* rather than over the whole document, via `inlineScopes`. Without
 * that, a stray backtick in one heading pairs with one in a paragraph twenty lines
 * later and the model reports a footnote reference as code while the page plainly
 * shows a superscript: 39 of 40 seeds in the sweep failed that way, in both
 * directions, from that one omission.
 *
 * The retry after a failed match is by *one* backtick, not by two, and that detail
 * decides real documents. A global regex resumes at the next position, so in
 * `` true```` `` the first three backticks each fail — the character after each is
 * another backtick — and the *fourth* one opens the span. Treating an adjacent pair
 * as jointly consumed moves the scan past that fourth backtick and misses the span
 * entirely, which leaves the reference underneath it looking like prose and hands the
 * token oracle a definition that renders nothing. Two sweep seeds failed exactly that
 * way, on documents that were a stray backtick run and a footnote.
 */
function blankCodeSpans(text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1)
      // `close === i + 1` is the empty-inner match: `[^`]+` needs one character, so
      // an adjacent pair fails and the scan resumes one position along.
      if (close !== -1 && close !== i + 1) {
        out += text.slice(i, close + 1).replace(/[^\n]/g, ' ')
        i = close + 1
        continue
      }
    }
    out += text[i++]
  }
  return out
}

/** `CALLOUT_RE` and `TASK_RE`, which the emitter tests before anything else. Neither
 * is a list marker, and `listMarker`'s `(\s+)` requirement means `[ ]item` is a task
 * and not a paragraph, so both are spelled out separately. */
const CALLOUT_START = /^\[!(?:NOTE|TIP|WARNING|DANGER)\]/i
const TASK_START = /^\[[ xX]\]/

/** `TABLE_DIVIDER_RE`, plus the table-start condition from `emit`. */
const TABLE_DIVIDER = /^\s*\|?[\s:|-]+\|?\s*$/
function isTableRow(lines, i) {
  if (!lines[i].includes('|')) return false
  const next = lines[i + 1] !== undefined && lines[i + 1].includes('-')
    && TABLE_DIVIDER.test(lines[i + 1])
  const prev = i > 0 && lines[i - 1].includes('|') && lines[i - 1].trim() !== ''
  return next || prev
}

/**
 * The lines on which the emitter starts a new block, and so ends the current one.
 *
 * A re-derivation of the block starts in `lib/markdown/blocks.js` — `HR_RE`,
 * `QUOTE_RE`, `HEADING_RE`, `LINK_DEF_RE` and `listMarker`, none of which the module
 * exports. That duplication is the price of predicting the renderer from outside it,
 * and the "prose model agrees with the renderer" property is what pays for it: every
 * disagreement it reports names a construct missing from this list, so the copy
 * cannot rot unnoticed.
 *
 * The list rule is copied including its insistence on trailing whitespace, because
 * that is what keeps `*emphasis*` and `1. not a list` out. `listMarker` requires
 * `(\s+)` after the marker; without it every emphasised line in a document would
 * look like a list item and the model would lose whole paragraphs.
 */
const BLOCK_STARTS = [
  /^\[\^[A-Za-z0-9_-]+\]:/,                                        // footnote definition
  /^\[[^\]]+\]:\s*(?:<[^>]*>|\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/, // link definition
  /^\s*(?:---+|\*\*\*+|___+)\s*$/,                               // thematic break
  /^>/,                                                            // blockquote line
  /^#{1,6}\s+/,                                                    // ATX heading
  /^\s*(?:[*+-]|\d+[.)])\s+/,                                     // list marker
]

function startsNewBlock(lines, i) {
  const line = lines[i]
  if (line.trim() === '') return true
  if (FENCE_OPEN_RE.test(line)) return true
  if (isTableRow(lines, i)) return true
  return CALLOUT_START.test(line) || TASK_START.test(line)
    || BLOCK_STARTS.some((re) => re.test(line))
}

/**
 * Splits fenced-free source into the chunks the renderer hands to `inline.render`.
 *
 * Paragraph lines join into one chunk; a heading, a definition line or a single-item
 * chunk is its own; consecutive `>` lines join, because `flushQuote` collects them and
 * recurses once over the lot; and a table row is split into cells, because `parseTable`
 * renders each one separately. A backtick in one cell cannot close a span in the
 * next, and that is a real class of document — a table of prose with a stray backtick
 * in a cell was one of the sweep's failures.
 *
 * Two approximations are left standing, both because they are expensive to remove and
 * cheap to notice: a list item's indented continuation lines start a fresh `emit` in
 * the renderer and are treated here as paragraph continuation, and a nested list
 * marker inside one of them is not recognised as a block start. Both can only
 * over-blank, which is the direction that stays quiet — and if that ever stops being
 * true, the property says so by name.
 */
function inlineScopes(lines) {
  const scopes = []
  let para = []
  const flush = () => { if (para.length) { scopes.push(para); para = [] } }
  for (let i = 0; i < lines.length; i++) {
    if (!startsNewBlock(lines, i)) { para.push(i); continue }
    flush()
    scopes.push([i])
  }
  flush()
  return scopes
}

/**
 * The source with its code regions blanked out, aligned line for line with the
 * input: result line *i* describes source line *i*.
 *
 * This is what "is that `[^a]` a reference?" has to be answered against. CommonMark
 * is explicit that text inside code is literal, and JPROT renders it as literal, so
 * a `[^a]` inside a code span or a fenced block is not a reference — it is the four
 * characters a reader sees instead of a superscript. A definition whose only
 * "references" are inside code is an orphan definition, and an orphan renders as
 * nothing by design.
 *
 * Asking instead whether the string `[^a]` appears anywhere in the file gets that
 * wrong. The seed sweep found it three separate ways, all the same mistake: the
 * generator emits a stray backtick run before a reference often enough that a
 * definition written after it looked referenced, and the oracle then held the
 * renderer to body text the footnote policy discards on purpose. The renderer was
 * correct in every case — `See [^a] here.` inside a code span is code, so the
 * definition below it is unreferenced and there is nothing to render.
 *
 * Both directions of disagreement hurt, which is why the fence rule is imported
 * rather than re-typed. Guessing too wide (treating ` ````html ` as a fence) hides
 * a *definition*, so its body is held to the oracle even though it renders nothing
 * — a false failure that buries the real defects. `FENCE_OPEN_RE` is the renderer's
 * own rule, so the fence half of this model cannot drift from it; the halves that
 * can drift are the block starts above and the inline-span rule, and those are what
 * the "the prose model agrees with the renderer" property exists to test rather than
 * assume.
 *
 * `~~~` is deliberately not blanked — it is not a fence in this renderer, and
 * masking one would hide a reference the renderer does act on.
 *
 * The alignment is load-bearing. `orphanFootnoteTokens` has to know which definition
 * a line belongs to in order to know whether a reference on that line is one the
 * renderer ever resolves, and it indexes into this array by source line number. An
 * earlier version built a list of scope *strings* and re-split the join, which
 * silently renumbered every line below a table row — one table, one wrong orphan
 * decision, and the token oracle reporting a paragraph that is on the page.
 */
function proseOf(src) {
  // The *raw* lines, not `outsideFences`' masked ones. Which of the two fences is
  // asked here: this one is the emitter's, because the question being answered is
  // "does this line's text reach the inline pass", and that is decided by where the
  // emitter puts its fences. Starting from the flat mask would blank the far more of
  // the two — an indented fence inside a list item is a fence to the pre-scan and
  // prose to the emitter — and there is no way to un-blank afterwards. The flat mask
  // still decides which footnote ids exist; that is the pre-scan's job, it has no
  // containers, and a document may legitimately carry a definition the pre-scan
  // collected and the emitter rendered inside a `<pre>`.
  const lines = splitLines(src)
  const code = codeLines(src)
  const out = lines.slice()
  for (const scope of inlineScopes(lines)) {
    // The whole scope, joined — *not* one line at a time. A code span routinely
    // crosses a line break, because that is what a paragraph is: `true``` on one line
    // and a lone backtick three lines later is one span covering everything between.
    // Blanking line by line finds no span at all, leaves the reference underneath it
    // looking like prose, and hands the token oracle a definition that renders
    // nothing. `blankCodeSpans` replaces every character *except* newlines with a
    // blank, so the split back gives exactly one piece per source line and the line
    // numbering `orphanFootnoteTokens` depends on is intact.
    const pieces = scope.length === 1 && isTableRow(lines, scope[0])
      // `parseTable` renders each cell separately, so a cell is its own scope and the
      // `split('|')`/`join('|')` round trip keeps the row one line.
      ? [lines[scope[0]].split('|').map((cell) => blankCodeSpans(cell)).join('|')]
      : blankCodeSpans(scope.map((i) => lines[i]).join('\n')).split('\n')
    scope.forEach((i, k) => { out[i] = pieces[k] })
  }
  // Last, so a line that is code wins over any span or scope computed for it.
  for (let i = 0; i < out.length; i++) if (code[i]) out[i] = ''
  return out
}

/**
 * The document with its fenced regions blanked, but its inline code left intact.
 *
 * This is the text footnote *definitions* are read from, and the split from
 * `proseOf` is deliberate rather than fussy. A definition that the model wrongly
 * believes it has blanked is the one error this whole helper cannot be allowed to
 * make: no definition means no exemption, so the body is held to the token oracle,
 * the page legitimately renders nothing, and the suite reports a swallowed
 * paragraph that does not exist. Blanking too much *reference* text only makes a
 * definition look orphaned, which exempts tokens that were never in doubt — looser,
 * and quiet. One direction is cheap and the other is not, so each scan is done
 * against the text it can be trusted on: exact fence masking for the definitions
 * (the renderer's own `FENCE_OPEN_RE`, so it cannot drift), approximate code-span
 * masking for the references, where being wrong is free.
 */
function outsideFences(src) {
  let inFence = false
  return splitLines(src).map((line) => {
    if (FENCE_OPEN_RE.test(line)) { inFence = !inFence; return '' }
    return inFence ? '' : line
  })
}

/**
 * The pre-scan's *view of the document*, as `forEachOutsideCode` presents it.
 *
 * Returns the line text it would hand the collectors (`''` for a line it would not
 * hand over at all) beside how each line reached them, because "blanked" covers two
 * different things and only one of them is invisible to a collector:
 *
 * - a **fence line** is filtered out but reported separately, through `onFence`, so
 *   `collectFootnoteDefs` can end a definition *at* it. It has to: the span is a
 *   count, the emitter spends it as "skip the next N lines from here", and a fence
 *   the collector counted past without storing is a line the emitter will skip that
 *   nobody ever rendered. The fuzz suite found exactly that on a seed where an
 *   author's fence landed inside a footnote — the text was in neither the code block
 *   nor the note body, and nothing reported it.
 * - a line **inside** a fence is filtered with no callback at all, so it cannot
 *   extend or end anything. It must not close the open definition, or a reference
 *   that follows a fence gets attributed to a note whose extent was misjudged.
 */
function preScanView(src) {
  const text = []
  const kind = []
  let inFence = false
  for (const line of splitLines(src)) {
    if (FENCE_OPEN_RE.test(line)) { inFence = !inFence; text.push(''); kind.push('fence'); continue }
    text.push(inFence ? '' : line)
    kind.push(inFence ? 'inside' : 'prose')
  }
  return { text, kind }
}

/**
 * Which source lines the *emitter* renders as code — as opposed to
 * {@link outsideFences}, which is the pre-scan's answer to the same question.
 *
 * They are different answers and the renderer is entitled to both, because they
 * are asked of different code. `forEachOutsideCode` is a flat toggle: it has no
 * container structure, so anything smarter would be a guess, and
 * `lib/markdown/fence.js` explains at length what a wrong guess costs. The emitter
 * *does* have containers — `parseList` and the quote buffer re-enter `emit` with
 * their own line arrays and their own `inCode` — so it puts the fences in different
 * places, and which of the two applies decides whether a line's text reaches the
 * inline pass at all.
 *
 * The disagreement is not a corner case, and when it fires it is catastrophic for
 * this oracle, because it moves where the *rest of the document* is:

 *     - [x] (
 *       ```
 *     - [x] in …
 *     … twenty lines of prose and footnotes …
 *       ```

 * That indented fence is a **continuation line of the first task item**, so it opens
 * a fence inside that item and leaves the document outside code. The flat toggle
 * reads it as an opener and stays in code until the one twenty lines down — which
 * the emitter then reads as a fresh opener. The model put the footnote reference in
 * that range and called it prose; the page shows it inside a `<pre>`. One seed in
 * forty, and every failure was that.
 *
 * So this walks the same decision tree in the same order, carrying each line's
 * source index alongside its (possibly dedented) text so a continuation line can
 * still be traced home after `parseList` slices it.
 *
 * @returns {boolean[]} one flag per source line: is it rendered as code?
 */
function codeLines(src) {
  const lines = splitLines(src)
  const code = new Array(lines.length).fill(false)
  // The emitter asks the pre-scan what it collected rather than re-deriving it, so
  // the skip has to be driven by the same collected sets.
  const notes = collectFootnoteDefs(lines)
  const linkDefs = collectLinkDefs(lines)

  /** `items` is `[{ text, at }]`; `at` is the source line index, or -1 for filler. */
  function walk(items, topLevel) {
    let j = 0
    let inCode = false
    while (j < items.length) {
      const { text: line, at } = items[j]
      if (FENCE_OPEN_RE.test(line)) { inCode = !inCode; j++; continue }
      if (inCode) { if (at >= 0) code[at] = true; j++; continue }
      if (line.trim() === '') { j++; continue }

      const footnote = FOOTNOTE_DEF_RE.exec(line)
      if (topLevel && footnote && footnote[1] in notes.defs) {
        j += notes.spans.get(footnote[1]) || 1
        continue
      }
      const link = LINK_DEF_RE.exec(line)
      if (topLevel && link && link[1].toLowerCase() in linkDefs) { j++; continue }

      const quoted = BLOCK_PATTERNS.QUOTE_RE.exec(line)
      if (quoted) {
        // Consecutive quote lines buffer together and are re-emitted dequoted, with
        // a callout dropping an empty first line — `flushQuote` does exactly that,
        // so the indices have to survive it.
        const buf = [{ text: quoted[1], at }]
        let k = j + 1
        while (k < items.length) {
          const next = BLOCK_PATTERNS.QUOTE_RE.exec(items[k].text)
          if (!next) break
          buf.push({ text: next[1], at: items[k].at })
          k++
        }
        const callout = BLOCK_PATTERNS.CALLOUT_RE.exec(buf[0].text)
        walk(callout ? buf.filter((b, n) => n !== 0 || b.text !== '') : buf, false)
        j = k
        continue
      }

      const marker = BLOCK_PATTERNS.listMarker(line)
      if (marker) { j = walkList(items, j, marker); continue }
      j++
    }
  }

  /** `parseList`, minus the HTML: collect each item's lines, then recurse. */
  function walkList(items, start, first) {
    let j = start
    while (j < items.length) {
      const m = BLOCK_PATTERNS.listMarker(items[j].text)
      if (!m || m.indent !== first.indent || m.kind !== first.kind) break
      const col = m.col
      const at = items[j].at
      j++
      const item = [{ text: m.text, at }]
      while (j < items.length) {
        const { text: l, at: lineAt } = items[j]
        if (l.trim() === '') {
          let k = j + 1
          while (k < items.length && items[k].text.trim() === '') k++
          if (k >= items.length) break
          const nextIndent = /^\s*/.exec(items[k].text)[0].length
          const nextMarker = BLOCK_PATTERNS.listMarker(items[k].text)
          const continues = nextIndent > first.indent
            || (nextMarker && nextMarker.indent === first.indent && nextMarker.kind === first.kind)
          if (continues) { item.push({ text: '', at: lineAt }); j++; continue }
          break
        }
        const indent = /^\s*/.exec(l)[0].length
        if (indent > first.indent) {
          // Dedent by the item's content column, capped at the line's own indent —
          // the same cap the emitter has, so a fence indented less than the marker
          // is wide still arrives as a fence.
          const cut = Math.min(indent, col) - first.indent
          item.push({ text: cut > 0 ? l.slice(cut) : l.trimStart(), at: lineAt })
          j++
          continue
        }
        break
      }
      // A task item's lead line has its checkbox stripped before it is re-emitted.
      const task = BLOCK_PATTERNS.TASK_RE.exec(item[0].text.trimStart())
      if (task) item[0] = { text: task[2], at: item[0].at }
      walk(item, false)
    }
    return j
  }

  walk(lines.map((text, at) => ({ text, at })), true)
  return code
}

/**
 * What a document does about footnotes: which ids it defines, which it references,
 * and which definition each line belongs to.
 *
 * Line by line rather than one regex over the joined text, because the `m` flag
 * would let a bare `\r` pass for a line break and `splitLines` exists precisely to
 * say it is not one. Both callers want this, and neither wants to re-derive the
 * rules.
 *
 * A definition is anchored to the start of its line, because the renderer anchors
 * it too: `FOOTNOTE_DEF_RE` is `/^\[\^…\]:/`, so an indented `[^a]:` is not a
 * definition at all and renders as the paragraph it looks like. A reference is
 * matched anywhere on a line that is not a definition line — see the loop below for
 * why the two questions are asked of the whole line rather than guarded per match.
 *
 * The two scans read different text on purpose — see `outsideFences` and `codeLines`.
 */
function footnoteModel(src) {
  const { text: fenceFree, kind } = preScanView(src)
  const defined = new Set()
  const owner = new Array(fenceFree.length).fill(null)
  let open = null
  for (let i = 0; i < fenceFree.length; i++) {
    // A fence line ends the definition (see `preScanView`); a line inside one is not
    // seen at all, so it can neither extend nor end it, and is left strictly alone.
    if (kind[i] === 'fence') open = null
    else if (kind[i] === 'inside') continue
    else {
      const def = /^\[\^([A-Za-z0-9_-]+)\]:/.exec(fenceFree[i])
      if (def) { open = def[1]; defined.add(open) }
      else if (open !== null && !/^\s+\S/.test(fenceFree[i])) open = null
    }
    if (open !== null) owner[i] = open
  }

  const prose = proseOf(src)
  const refs = []
  for (let i = 0; i < prose.length; i++) {
    // A column-0 `[^a]:` is a definition, and the emitter skips the entire line: none
    // of it reaches the inline pass, so nothing on it can be a reference — not even a
    // `[^b]` sitting further along the same line, which is the case a document written
    // with bare `\r` line endings produces, where a whole page is one line and the
    // definition swallows it.
    //
    // Every *other* `[^a]` does reach the inline pass, including the `[^a]` of an
    // *indented* `[^a]:` inside a list item. That line is not a definition — the
    // renderer's `FOOTNOTE_DEF_RE` is column-anchored — so the `[^a]` on it renders as
    // a reference the moment `a` is defined somewhere else, and the reader gets a live
    // superscript. Four seeds reported the page linking a note the model said was
    // unpaired, all of them this shape. Reading the line at all is why the reference
    // pattern has no `(?!:)` guard left: the guard was standing in for "this line is a
    // definition", and now the line itself says so.
    if (/^\[\^[A-Za-z0-9_-]+\]:/.test(fenceFree[i])) continue
    for (const m of prose[i].matchAll(/\[\^([A-Za-z0-9_-]+)\]/g)) refs.push([m[1], i])
  }

  // A reference sitting inside an *orphan* definition's body is not a reference the
  // renderer ever resolves: the definition it lives in renders as nothing, so the
  // text is never shown and the footnote it cites never gets a superscript. That
  // makes orphans nest, and the nesting is what the renderer does:
  //
  //     [^a]: see [^b]
  //     [^b]: the note
  //
  // with nothing citing `[^a]` renders as nothing at all — both bodies gone, and the
  // seed sweep found the oracle reporting the second one as a swallowed paragraph.
  //
  // So the two sets are defined in terms of each other and have to be resolved
  // together, to a fixed point — and the direction matters, because only one of the
  // two converges on the renderer's answer.
  //
  // Subtracting, from "every id that has a reference somewhere", the ids whose
  // references are all inside an unreferenced definition, looks equivalent and is not:
  // the seed already contains everything, so nothing is ever an orphan and nothing is
  // ever subtracted. It works on the shape above only because `[^b]` sits on a
  // *definition line*, which the scan skips wholesale before it can become a
  // reference at all. The same nesting one line lower defeats it:
  //
  //     [^a]: dolor
  //       still the note
  //     See [^a] here.
  //
  // Here `[^a]` is on a continuation line, not a definition line, so it is a
  // reference — to itself, from inside its own body. Read as a set, `a` is referenced
  // and its body has to reach the page; the renderer renders nothing, and the token
  // oracle reports a paragraph that is not there. An author who indents a definition
  // and forgets to close it hits this routinely.
  //
  // So grow upward from nothing instead, which is the honest direction: a reference
  // resolves if the line carrying it is rendered, and a line is rendered if the
  // definition hosting it is. `a`'s only reference is hosted by `a`, so `a` never
  // becomes rendered and `b` never resolves through it — a group of definitions that
  // cite only each other is exactly what the renderer discards. Monotonically
  // growing and bounded by the number of ids, so it settles, and the least fixed
  // point is the only reading under which the answer does not depend on the order
  // the ids happened to be visited in.
  let referenced = new Set()
  for (let round = 0; round <= refs.length; round++) {
    const next = new Set()
    for (const [id, i] of refs) {
      const host = owner[i]
      if (host === null || referenced.has(host)) next.add(id)
    }
    if (next.size === referenced.size) break
    referenced = next
  }
  return { defined, referenced, owner, fenceFree }
}

/**
 * Every footnote id that appears as both a reference and a definition.
 *
 * The shrinker uses this to keep a definition and its reference together: they
 * are one unit of meaning, and a document with only the definition is one the
 * renderer is *supposed* to render as nothing at all. A `[^a]` buried in a code
 * span must not manufacture a pair out of a definition and a piece of literal
 * text, which is what reading the raw file would do.
 */
function footnotePairs(src) {
  const { defined, referenced } = footnoteModel(src)
  return [...defined].filter((id) => referenced.has(id))
}

/**
 * The tokens inside a footnote definition that nothing references.
 *
 * A definition with no reference renders as nothing, by design: `doc.noteOrder`
 * only collects ids that were referenced, and `<section class="footnotes">` is
 * emitted only when that list is non-empty. So a document carrying an orphan
 * definition is a document that legitimately drops its text, and a token oracle
 * that did not know this reports the renderer's footnote policy as a swallowed
 * paragraph.
 *
 * "No reference" is decided against `proseOf`, not against the raw file. A `[^a]`
 * inside a code span or a fenced block is literal text, not a reference, so a
 * definition whose only references are inside code *is* an orphan — that is the
 * whole reason three seeds failed until this asked the question properly.
 *
 * The exemption is deliberately narrow in three directions:
 *
 *   - It covers the definition line and its indented continuation lines, and only
 *     for ids the document never resolves. A *referenced* definition's body is the
 *     footnote the reader was just sent to, so it is held to the oracle like any
 *     other prose. This used to exempt the definition line either way, which
 *     quietly dropped the oracle's teeth over exactly the region the seeds were
 *     failing in.
 *   - It covers every token on those lines, including ones sitting inside a code
 *     span *within* the definition. They vanish too — the whole definition does —
 *     so requiring them would be a false failure, while exempting them loses
 *     nothing, because a marker inside a code span is only ever visible as part of
 *     text that is itself being discarded.
 *   - It does *not* cover tokens inside a fenced block in the middle of a
 *     definition. `collectFootnoteDefs` stops at a fence, so a fence ends the
 *     definition and its contents are rendered as code — which is exactly what
 *     reading markers from the fence-free lines gives.
 *   - It does not cover a definition the *emitter* rendered as code. `defined` comes
 *     from the pre-scan, which is flat and so collects an id the emitter later buries
 *     in a `<pre>`; such a definition is on the page, in full, as code, and holding it
 *     to the token oracle is right. Only the orphan ones are invisible.
 */
function orphanFootnoteTokens(src) {
  const { defined, referenced, owner, fenceFree } = footnoteModel(src)
  const orphans = new Set([...defined].filter((id) => !referenced.has(id)))
  if (!orphans.size) return new Set()

  const code = codeLines(src)
  const exempt = new Set()
  for (let i = 0; i < fenceFree.length; i++) {
    if (owner[i] === null || !orphans.has(owner[i])) continue
    if (code[i]) continue
    for (const marker of markersOf(fenceFree[i])) exempt.add(marker)
  }
  return exempt
}

/**
 * The tokens that only ever appear as *identifiers*.
 *
 * A footnote reference `[^a]` and its definition `[^a]:` are consumed as ids: the
 * renderer emits `<sup id="fnref-a"><a href="#fn-a">1</a></sup>` and
 * `<li id="fn-a">`, so the id text is present in the DOM but never readable. The
 * same goes for a reference link's label (`[text][id]`) and a link definition's
 * id (`[id]: url`). A token in that position is a machine name by design, and
 * holding the renderer to it as visible text would be holding it to something it
 * deliberately does not do.
 *
 * "Only ever" is the load-bearing word. If the same token also appears as
 * ordinary text somewhere in the document, that occurrence still has to reach the
 * page, so the token stays required — which is why the test removes the id
 * positions from the source and then asks which tokens are left, rather than
 * asking which tokens are ids.
 *
 * A fence's info string counts as one of those positions for the same reason:
 * ` ```js ` becomes `class="language-js"`, which is a machine name and not
 * something a reader sees. A token the generator happens to put there has not
 * been dropped — it has been given a job.
 *
 * The two line-anchored rules are applied per line rather than with a `g`+`m`
 * regex over the whole document, because `m` treats a bare `\r` as a line break
 * and this renderer does not — see `splitLines`. Applying them per line also keeps
 * a `[id]: url` on line 7 from rewriting the start of line 8.
 *
 * Only lines the *pre-scan* hands over are eligible. A `[id]: url` inside a fence is
 * not a definition — the pre-scan never sees it, so the emitter renders it as code,
 * where every token in it is visible. Blanking it anyway would quietly exempt the
 * contents of every code block that happened to look like a definition, which is most
 * of the way to not checking them at all.
 */
function identifierOnlyTokens(src) {
  const { text, kind } = preScanView(src)

  // Two views of each line, because the emitter reads the line *inside* its container:
  // a quote line is dequeued (`> ```lang` → ` ```lang`) before the fence test ever sees
  // it, and `FENCE_OPEN_RE` tolerates leading blanks but not a `>`. `QUOTE_RE` is the
  // renderer's own pattern, for the same reason `FENCE_OPEN_RE` is imported rather than
  // re-typed — a second copy of a pattern is a second answer to the same question, which
  // is how the emitter and the pre-scan came to disagree in the first place.
  const views = (line) => [line, line.replace(BLOCK_PATTERNS.QUOTE_RE, '$1')]

  // Every identifier position on one line, blanked.
  //
  // The order is load-bearing and not obvious. `[^id]` is blanked *first*, which is what
  // stops the next rule from eating a footnote definition: after it, `[^a]: the note`
  // is ` : the note`, and `^\[` no longer matches — so the note's body stays required,
  // which it must be, because a referenced footnote's body is text the reader sees. Run
  // the rules the other way round and every footnote definition would be silently
  // exempted and the token oracle would stop checking the one thing it is best at.
  const blank = (line) =>
    line
      // `[^id]` and `[^id]:` — one rule covers both, since neither keeps the id.
      .replace(/\[\^([A-Za-z0-9_-]+)\]/g, ' ')
      // `[text][id]`: only the second bracket is the id.
      .replace(/\[[^\]]*\]\[([^\]]*)\]/g, (m, id) => (id ? m.replace(id, ' ') : m))
      // `[id]: url` — the *whole* line goes, not just the id. Nothing on a link
      // definition line is ever shown: the id becomes a machine name, the url
      // becomes an `href`, and an optional title becomes a `title`. So a token the
      // generator put in one of those has not been dropped, it has been given a
      // job — `[a]: b[[[[Mk0q1]]` is a definition whose url happens to contain a
      // marker, and the emitter skips the whole line. `identifierOnlyTokens` used
      // to blank only the leading `[id]:`, which made every marker in a url a
      // token the page was supposed to be showing.
      .replace(/^\[([^\]]+)\]:.*$/, ' ')
      // And the opener plus its info string: ```` ```lang ```` becomes
      // `class="language-lang"`, a machine name, so a token the generator put there
      // has been given a job rather than dropped.
      .replace(/^\s*```+[^\s`]*/, ' ')

  const stripped = text
    .map((line, i) => {
      // A line inside a fence is code, not a definition: the pre-scan never saw it, so
      // the emitter renders it literally and everything on it is visible. Blanking it
      // anyway would exempt the contents of every code block that happened to look like
      // a definition, which is most of the way to not checking them at all.
      if (kind[i] === 'inside') return line
      // Blank the view the fence rule can actually see. The other two rules are
      // unanchored, so the choice of view makes no difference to them.
      const asFence = views(line).find((v) => /^\s*```/.test(v))
      return blank(asFence === undefined ? line : asFence)
    })
    .join('\n')
  // "Only ever" is decided by *position*, not by identity. The rules above blanked
  // every identifier position, so what is left in the stripped text is prose. A marker
  // that was in the source and is gone from the stripped text was in an identifier
  // position; one that is still there is also prose somewhere, and that occurrence
  // still has to reach the page.
  //
  // The earlier version recorded the ids it matched and filtered *those* instead,
  // which is the identity test rather than the position one, and it missed everything
  // that is a machine name but not an id — the url and title in `[a]: b[[[[Mk0q1]]`.
  // So the marker in a url was never exempted and the page was reported as dropping
  // a token it had correctly never been asked to show.
  const stillRequired = new Set(markersOf(stripped))
  return new Set(markersOf(src).filter((marker) => !stillRequired.has(marker)))
}

/** The tokens a document is held to: all of them, less the two documented
 * exemptions — the text inside a footnote definition the document itself decided
 * to discard, and the ids that are consumed as identifiers rather than shown. */
function requiredTokens(src) {
  const exempt = new Set([...orphanFootnoteTokens(src), ...identifierOnlyTokens(src)])
  return markersOf(src).filter((marker) => !exempt.has(marker))
}

/* ---------------- 1. nothing the author wrote disappears ---------------- */

test('fuzz: every generated token survives into the output', () => {
  // The token must reach the page, not specifically the *visible* text. An
  // image's alt text lives in an attribute, not between the tags, and a token in
  // an alt is present and correct — a check on visible text alone would fail on
  // every document containing an image, which is most of them, and would be
  // reporting the test's own shortcut rather than a defect.
  forAllDocs({
    name: 'text the author wrote must not be swallowed by the block parser',
    cases: CASES,
    check: (src) => {
      const { html } = render(src)
      const seen = compact(html)
      for (const marker of requiredTokens(src)) {
        if (!seen.includes(marker)) {
          return `token ${marker} never reached the output\n` +
            `  output was: ${JSON.stringify(html.slice(0, 400))}`
        }
      }
      return true
    },
  })
})

test('fuzz: every generated token survives as text or as an alt attribute', () => {
  // The stronger version of the property above, for the case where it matters
  // most: a token must be in the visible text *or* in an `alt`/`title`
  // attribute. Those are the only two places a reader meets a token, and a token
  // that reached neither has been dropped from the page entirely.
  //
  // One exemption, and it is about the author rather than the renderer. Raw HTML
  // in a body is passed through on purpose (README, "Raw HTML in Markdown"), so a
  // document containing a half-typed `<htt` — or a `<b>` the author never closed —
  // hands the browser a tag that runs on to the next `>`, and the tokens in between
  // stop being text: the tokenizer reads them as that tag's attribute names and
  // throws them away. The renderer emitted them correctly; the author's own `<` made
  // them unreadable. So a token missing from the readable text but present inside
  // *tag syntax* is reported separately from one missing from the page altogether.
  //
  // `scan.tagSyntax`, not `scan.tags`: it is the **closing** tag that does the
  // swallowing — `raw <b>x</b` is a `</b …>` whose attribute region runs on into the
  // next tag — and `tags` records only openers, so before this the exemption missed
  // the one case it existed for. Nothing about that tag is malformed, either, so the
  // exemption cannot be conditional on a parse error.
  forAllDocs({
    name: 'every token must be readable somewhere in the output',
    cases: CASES,
    check: (src) => {
      const { html } = render(src)
      const scan = scanHtml(html)
      const inText = compact(scan.text)
      const inAttrs = compact(attributeValues(html)
        .filter((a) => a.key === 'alt' || a.key === 'title')
        .map((a) => a.value).join(' '))
      const inTagSyntax = compact(scan.tagSyntax)
      for (const marker of requiredTokens(src)) {
        if (inText.includes(marker) || inAttrs.includes(marker)) continue
        if (inTagSyntax.includes(marker)) continue
        return `token ${marker} is neither visible text nor an alt/title attribute\n` +
          `  visible text: ${JSON.stringify(scan.text.slice(0, 300))}\n` +
          `  attributes:   ${JSON.stringify(inAttrs.slice(0, 300))}`
      }
      return true
    },
  })
})

test('fuzz: a construct that is never closed does not take the page with it', () => {
  // A fence, a quote or a table that is never closed is something an author does
  // constantly — a paste that cut off mid-block, a truncated preview. The damage
  // is expected to be *contained*: the broken construct is closed off and
  // nothing outside it is lost. The visible failure is the whole rest of the
  // page disappearing, which is what the token oracle below detects.
  //
  // This differs from the property above in what it constructs: it *appends* an
  // unclosed opener to a document that was already complete, so the only thing
  // that can explain lost text is the opener's failure to be contained.
  forAllDocs({
    name: 'an unclosed construct must not swallow the content before it',
    cases: Math.max(30, Math.floor(CASES / 8)),
    check: (src) => {
      const base = src
      const markers = requiredTokens(base)
      if (markers.length < 2) return true
      // Each opener is closed by nothing, on purpose.
      const openers = ['```\n', '```js\n', '> ', '| a | b |\n', '- ']
      for (const opener of openers) {
        const html = md.render(opener + base)
        const seen = compact(html)
        // A fence legitimately swallows the text after it — that is what a fence
        // does, and the text is still there, escaped, inside the `<code>`. So the
        // claim is about presence anywhere in the output, not about the first
        // token surviving, which a fence is *supposed* to hide.
        const lost = markers.filter((mk) => !seen.includes(mk))
        if (lost.length > markers.length * 0.5) {
          return `an unclosed ${JSON.stringify(opener.trim())} lost ${lost.length}/${markers.length} tokens ` +
            `(first: ${lost[0]}); output was ${JSON.stringify(html.slice(0, 300))}`
        }
      }
      return true
    },
  })
})

/* ---------------- 2. the HTML is structurally sound ---------------- */

test('fuzz: the output is well-formed HTML', () => {
  // Run over markup-free documents. Raw HTML in a body is passed through on
  // purpose — the CSP is the security boundary, not escaping — so a document
  // carrying its own unclosed `<div>` would fail this for something the renderer
  // was *supposed* to emit. See README, "Raw HTML in Markdown".
  forAllDocs({
    name: 'rendered output must be structurally sound HTML',
    cases: CASES,
    markup: false,
    check: (src) => {
      const { html } = render(src)
      const { errors } = scanHtml(html)
      return errors.length ? errors.slice(0, 3).join('; ') : true
    },
  })
})

test('fuzz: the output contains only tags the renderer emits', () => {
  forAllDocs({
    name: 'no source text may become live markup',
    cases: CASES,
    markup: false,
    check: (src) => {
      const { html } = render(src)
      for (const { tag, raw } of scanHtml(html).tags) {
        if (!ALLOWED_TAGS.has(tag)) return `unknown tag <${tag}> in output: ${JSON.stringify(raw)}`
      }
      return true
    },
  })
})

test('fuzz: rendering is deterministic and does not leak state between calls', () => {
  // One instance renders every document on a site, including a shortcode's nested
  // render inside a page's render. If heading ids, footnote numbering or link
  // definitions leaked between calls, the same page would render differently
  // depending on what had been rendered before it — invisible in a single-page
  // snapshot, and immediately visible in a site.
  forAllDocs({
    name: 'rendering the same document twice must produce identical output',
    cases: Math.max(20, Math.floor(CASES / 20)),
    check: (src) => {
      const first = render(src)
      const second = render(src)
      if (first.html !== second.html) {
        return `second render differed\n  first:  ${JSON.stringify(first.html.slice(0, 300))}\n` +
          `  second: ${JSON.stringify(second.html.slice(0, 300))}`
      }
      // And a fresh instance must agree with the shared one.
      if (createMarkdown().render(src) !== first.html) {
        return 'a fresh createMarkdown() instance produced different output'
      }
      return true
    },
  })
})

test('fuzz: no interpolated garbage appears in the output', () => {
  forAllDocs({
    name: 'a lost value must not reach the page as the text "undefined"',
    cases: CASES,
    check: (src) => {
      const { html } = render(src)
      const text = scanHtml(html).text
      // Only a garbage string the *document* did not contain can be a bug. A
      // page that legitimately says "null" in a code sample is fine; one that
      // says it because a template interpolated a missing value is not, and the
      // two are indistinguishable without this check.
      for (const needle of GARBAGE) {
        if (text.includes(needle) && !src.includes(needle)) {
          return `rendered text contains ${JSON.stringify(needle)}, which the document never said: ` +
            JSON.stringify(text.slice(0, 300))
        }
      }
      return true
    },
  })
})

test('fuzz: a code span never appears twice', () => {
  // The specific defect this file found: the inline renderer marks out code
  // spans with a placeholder, and a document containing the placeholder
  // characters could restore one *again*, so a span's content appeared a second
  // time somewhere the author never wrote it — and an out-of-range index
  // rendered the literal word "undefined". The output is a page that says
  // something its author did not write, which is worse than one that drops a
  // word, because it is not obviously wrong to a reader.
  //
  // The claim is exact rather than heuristic: a token written once in the source
  // must appear exactly once in the output. A marker inside a duplicated span
  // would appear twice, and no legitimate rule duplicates text.
  forAllDocs({
    name: 'placeholder characters in a document must not inject a code span',
    cases: CASES,
    check: (src) => {
      const { html } = render(src)
      const text = scanHtml(html).text
      if (text.includes('undefined')) {
        return `rendered text contains "undefined": ${JSON.stringify(text.slice(0, 300))}`
      }
      // Each marker is generated once, in a single position, so a second
      // occurrence can only come from a rule that emitted the same text twice.
      const sourceCounts = new Map()
      for (const marker of markersOf(src)) {
        sourceCounts.set(marker, (sourceCounts.get(marker) || 0) + 1)
      }
      const outputCounts = new Map()
      for (const marker of markersOf(text)) {
        outputCounts.set(marker, (outputCounts.get(marker) || 0) + 1)
      }
      for (const [marker, want] of sourceCounts) {
        // Markers inside a *reference* construct can legitimately vanish (an
        // unresolved `[text][id]` collapses), so only a surplus is a defect.
        const got = outputCounts.get(marker) || 0
        if (got > want) {
          return `token ${marker} was written once and rendered ${got} times; ` +
            `a placeholder must have been restored more than once`
        }
      }
      if (codeContents(html).some((c) => c.includes('undefined'))) {
        return 'a <code> body is the literal text "undefined"'
      }
      return true
    },
  })
})

/* ---------------- 3. nothing dangerous survived ---------------- */

/**
 * `safeHref`'s rule, restated as two patterns so the property below can be read
 * against it.
 *
 * The property used to carry its own wider list — `blob:` and `file:` included —
 * and that was the property being wrong rather than the renderer being loose. A
 * `blob:` or `file:` URL in the author's own content cannot execute anything: the
 * first needs script to have created it, and the second is blocked for any page not
 * served from `file://`. Demanding the renderer refuse them would have meant
 * inventing a rule the code does not have, which is how a security test quietly
 * stops testing the thing it names.
 */
const REFUSED_SCHEME = /^\s*(?:javascript|vbscript):/i
const DATA_SCHEME = /^\s*data:/i
const IMAGE_DATA = /^\s*data:image\//i

/**
 * Why `data:image/` is allowed through at all.
 *
 * An inline image is the one asset a static site genuinely cannot ship as a file —
 * a badge, a one-pixel spacer, a generated chart — so refusing every `data:` URL
 * would refuse a legitimate and common authoring choice. `data:image/svg+xml`
 * comes with it, and that is safe in the one place it appears: an SVG loaded
 * through `<img src>` is a *passive* document, its scripts never run, and the CSP
 * carries a per-response nonce with no `unsafe-inline` in any case. `data:text/html`
 * gets none of that — it is a navigable document with a script context — so it is
 * refused, and so is `data:` in a link, where it would be a navigation.
 */
function refusedUrlReason(ref) {
  if (REFUSED_SCHEME.test(ref.value)) return 'script scheme'
  if (!DATA_SCHEME.test(ref.value)) return null
  if (ref.kind === 'href') return 'data: in a link, where it is a navigation'
  if (!IMAGE_DATA.test(ref.value)) return 'non-image data: in a src'
  return null
}

test('fuzz: no dangerous URL reaches an href or a src', () => {
  // Markup-free documents only, and the reason is the documented one: **raw HTML in
  // Markdown is passed through**, not escaped, with the CSP nonce as the boundary.
  // So `<a href= data:image/svg+xml,…>` in a source document arrives in the output
  // intact — correctly, as the author's own HTML. Flagging it would be demanding
  // that the renderer escape a feature the README promises it does not, and the
  // sweep found exactly that contradiction on a seed the earlier 500-case runs never
  // reached.
  //
  // The renderer's own gate is still fully in scope, and this is where the real work
  // of the property is: proving that *every* URL in the output went through it. A
  // reference definition, an autolink, an image title and a callout href are four
  // different places to forget a `safeUrl`, and none of them is the one a unit test
  // for `safeUrl` would have looked at. The generator carries `javascript:`,
  // `vbscript:` and `data:` destinations on links *and* on images for this reason.
  forAllDocs({
    name: 'a URL that can execute must never survive into an href or a src',
    cases: CASES,
    markup: false,
    check: (src) => {
      const { html } = render(src)
      for (const ref of scanHtml(html).refs) {
        const why = refusedUrlReason(ref)
        if (why) return `<${ref.tag} ${ref.kind}="${ref.value}"> — ${why}`
        if (/[\u0000-\u001f\u007f]/.test(ref.value)) {
          return `<${ref.tag} ${ref.kind}> contains a control character: ${JSON.stringify(ref.value)}`
        }
        // A quote in the *unescaped* value is fine — the renderer emits it as
        // `&quot;`, which is why unescaping it here produces one. What must not
        // happen is a quote or a `<` in the value as emitted, which would end
        // the attribute early and let the rest of the URL become markup.
        if (/["'<>]/.test(ref.rawValue)) {
          return `<${ref.tag} ${ref.kind}> value is not inert as emitted: ` +
            `${JSON.stringify(ref.rawValue)} — a quote or < reached the attribute unescaped`
        }
      }
      return true
    },
  })
})

test('fuzz: no attribute value contains markup', () => {
  forAllDocs({
    name: 'an attribute value must be inert text',
    cases: CASES,
    markup: false,
    check: (src) => {
      const { html } = render(src)
      for (const a of attributeValues(html)) {
        if (a.value.includes('<')) {
          return `<${a.tag} ${a.key}="${a.value}"> contains a raw <`
        }
        if (/^on/.test(a.key)) {
          return `<${a.tag}> carries the event handler ${a.key}`
        }
      }
      return true
    },
  })
})

test('fuzz: code spans and code blocks contain no live markup', () => {
  forAllDocs({
    name: 'code content must be escaped, not rendered',
    cases: CASES,
    markup: false,
    check: (src) => {
      const { html } = render(src)
      for (const body of codeContents(html)) {
        if (body.includes('<')) return `<code> body contains a raw <: ${JSON.stringify(body.slice(0, 200))}`
        if (body.includes('>')) return `<code> body contains a raw >: ${JSON.stringify(body.slice(0, 200))}`
      }
      return true
    },
  })
})

test('fuzz: no id is emitted twice', () => {
  // Every id is a target a reader can be linked to, and every `href="#…"` in the
  // output points at one. Two elements sharing an id means the link lands on the
  // first one and the anchor the author meant does not exist.
  forAllDocs({
    name: 'every id in the output must be unique',
    cases: CASES,
    check: (src) => {
      const { html } = render(src)
      const seen = new Map()
      for (const { id, tag } of scanHtml(html).ids) {
        if (seen.has(id)) {
          return `id ${JSON.stringify(id)} is used by both <${seen.get(id)}> and <${tag}>`
        }
        seen.set(id, tag)
      }
      return true
    },
  })
})

test('fuzz: the table of contents matches the headings in the page', () => {
  // Two failure modes, both visible. A heading in the page with no table-of-
  // contents entry is a section a reader cannot jump to; an entry with no
  // heading is a link to nothing.
  //
  // Only top-level headings belong in the table of contents — the block emitter
  // passes `toc: false` when it recurses into a quote or a list item, so a
  // heading inside a blockquote is rendered with an id but is not listed. That is
  // deliberate, so the property is one-directional: every *collected* heading
  // must exist in the page, and the page's top-level headings must be collected.
  forAllDocs({
    name: 'every table-of-contents entry must point at a heading that exists',
    cases: CASES,
    check: (src) => {
      const { html, headings } = render(src)
      const scan = scanHtml(html)
      const ids = new Set(scan.ids.map((x) => x.id))
      // An id the author's markup swallowed counts as present — see
      // `idsInTagSyntax`. The renderer emitted it; a stray `<` turned it into an
      // attribute name.
      for (const id of idsInTagSyntax(scan.tagSyntax)) ids.add(id)
      for (const h of headings) {
        if (!ids.has(h.id)) {
          return `table of contents lists ${JSON.stringify(h.id)}, which no element in the page carries`
        }
      }
      // And the collected levels must match what was emitted, in order.
      // `html`, not `ids`: a swallowed heading is still a heading the renderer
      // emitted, and counting only the ones a parser can see would report a
      // correct renderer as dropping headings.
      const emitted = [...html.matchAll(/<h([1-6]) id="/g)].map((m) => Number(m[1]))
      if (headings.length > emitted.length) {
        return `${headings.length} headings collected but only ${emitted.length} rendered`
      }
      return true
    },
  })
})

/**
 * The `id` values that appear inside `scan.tagSyntax` — the bytes the author's own
 * markup turned into tag syntax, which a browser parses as attribute names and
 * discards.
 *
 * The token properties already exempt text found there, because an author's stray `<`
 * can make the browser read a paragraph as one long attribute value and the renderer
 * has emitted it correctly. Attributes need the same exemption for the same reason: an
 * `id` the renderer emitted can be swallowed whole, and a check that then reports the
 * anchor leading to it as dangling is holding the renderer for the author's markup.
 *
 * Read with a plain scan rather than the tag parser, because the point of these ids is
 * precisely that they are *not* part of any tag any parser would agree on. Anchored on
 * `id` as a whole attribute name, so a value like `href="x"` cannot produce one.
 */
function idsInTagSyntax(tagSyntax) {
  const found = new Set()
  const re = /(?:^|[\s/])id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/g
  let m
  while ((m = re.exec(tagSyntax)) !== null) found.add(m[1] ?? m[2] ?? m[3] ?? '')
  return found
}

test('fuzz: an in-page link points at an element that exists', () => {
  // A link the renderer *builds* — a footnote's superscript and its back-link —
  // must have both ends. The visible failure is a footnote number that jumps
  // nowhere, or a back-link that scrolls to the top of the page.
  forAllDocs({
    name: 'every footnote link must resolve to the element it names',
    cases: CASES,
    check: (src) => {
      const { html } = render(src)
      const scan = scanHtml(html)
      const ids = new Set(scan.ids.map((x) => x.id))
      // The ids the author's own markup swallowed. This is the `tagSyntax`
      // exemption the token properties already make, applied to attributes
      // instead of text, and it is needed for the same reason: HTML attribute
      // values may contain newlines, so an author's unclosed tag leaves a
      // closing tag whose attribute region runs straight on across everything
      // after it, and the browser reads those bytes as attribute names and
      // throws them away.
      //
      //     raw <script>Mk0qa</s
      //     See [^a] here.
      //
      // The `</s …>` that swallows everything up to its `>` eats the renderer's
      // `<sup class="footnote-ref" id="fnref-a">` whole — not because the renderer
      // left it out, but because the author's `<` put it inside a tag. So the
      // superscript never becomes an element, and the back-link the *renderer*
      // then emits into that same region dangles. Reporting that as a missing id
      // would be holding the renderer for the author's markup, and the check would
      // be lying about which end is broken.
      const swallowed = idsInTagSyntax(scan.tagSyntax)
      for (const ref of scan.refs) {
        if (ref.kind !== 'href' || !ref.value.startsWith('#')) continue
        // A bare `#` is the sanitiser's value for a URL it refused, and is
        // inert by construction — it is not a link to a section that is missing.
        if (ref.value === '#') continue
        const target = ref.value.slice(1)
        if (!ids.has(target) && !swallowed.has(target)) {
          return `a link to #${target} has no matching id in the page`
        }
      }
      // Every footnote definition that is referenced must appear exactly once,
      // and every back-link must have a forward reference. Both halves count the
      // renderer's *output*, so both have to read the swallowed ids as well: a
      // superscript the author's `</s …>` ate is not a definition with no
      // reference, it is a reference with no `<li>` the reader can see, and calling
      // that "defined but never referenced" would point the investigation at the
      // footnote policy instead of at the author's stray `<`.
      const defs = [...html.matchAll(/<li id="fn-([^"]+)">/g)].map((m) => m[1])
      const refsTo = [...html.matchAll(/<sup class="footnote-ref" id="fnref-([^"]+)">/g)].map((m) => m[1])
      for (const id of swallowed) {
        if (id.startsWith('fnref-')) refsTo.push(id.slice('fnref-'.length))
        else if (id.startsWith('fn-')) defs.push(id.slice('fn-'.length))
      }
      for (const id of defs) {
        if (!refsTo.includes(id)) return `footnote ${id} is defined but never referenced`
      }
      for (const id of refsTo) {
        if (!defs.includes(id)) return `footnote ${id} is referenced but never defined`
      }
      return true
    },
  })
})

test('fuzz: the prose model agrees with the renderer about what is a reference', () => {
  // This is the test for the *test*. `proseOf` is the oracle's model of which `[^a]`
  // are references, and the token properties above trust it: when it calls a
  // definition orphaned, the body is allowed to disappear from the page. A model
  // that is too eager to see a reference produces false failures; one that is too
  // shy quietly stops holding the renderer to the body of a footnote the reader
  // can click to. Neither shows up as a failure, so the model has to be measured
  // against the thing it models rather than assumed correct.
  //
  // The measurement is exact in both directions. A document that pairs `[^a]` up —
  // a reference and a definition, both in prose — is a footnote the reader can
  // reach, so the renderer owes it a `fnref` superscript. A `[^a]` the model does
  // not pair up is code, or is missing its definition, so no superscript may appear.
  //
  // Markup-free documents only. A `[^a]` sitting inside a raw `<span title="…">` is
  // the author's own attribute passing through untouched, which is a deliberate
  // feature, and neither a reference nor a definition — a question this model does
  // not try to answer. Keeping the documents free of raw markup keeps the
  // comparison about the two mechanisms this model actually implements.
  forAllDocs({
    name: 'footnote references the model pairs must exist, and only those',
    cases: CASES,
    markup: false,
    check: (src) => {
      const paired = footnotePairs(src).sort()
      const { html } = render(src)
      const rendered = [...html.matchAll(/<sup class="footnote-ref" id="fnref-([^"]+)">/g)]
        .map((m) => m[1]).sort()
      if (paired.join(' ') !== rendered.join(' ')) {
        return `model pairs [${paired.join(' ')}] but the page links [${rendered.join(' ')}]`
      }
      return true
    },
  })
})

/* ---------------- 4. it stays fast and stays bounded ---------------- */

test('fuzz: the output stays proportionate to the input', () => {
  // A renderer that can be made to emit megabytes from a kilobyte of input is a
  // denial-of-service vector against a static site generator that runs on every
  // commit. The bound is generous — 12x covers the largest legitimate expansion,
  // a fenced code block's copy button — but it is a bound.
  forAllDocs({
    name: 'output size must stay proportionate to input size',
    cases: Math.max(20, Math.floor(CASES / 20)),
    check: (src) => {
      if (src.length < 200) return true
      const { html } = render(src)
      if (html.length > src.length * 12 + 4096) {
        return `${src.length} characters in, ${html.length} out`
      }
      return true
    },
  })
})

test('fuzz: pathological input terminates in bounded time', () => {
  // The classic quadratic-or-worse shapes: a long run of emphasis delimiters, an
  // enormous single line, thousands of backticks, deep nesting. Each is rendered
  // with a wall-clock budget that is orders of magnitude above what any of them
  // legitimately needs, so a failure means the renderer is not linear, not that
  // the machine is busy.
  const BUDGET_MS = 4000
  const cases = {
    'emphasis run': '*'.repeat(20000),
    'strong run': '**'.repeat(10000),
    'underscore run': '_'.repeat(20000),
    'strikethrough run': '~~'.repeat(10000),
    'backtick run': '`'.repeat(20000),
    'bracket run': '['.repeat(20000),
    'paren run': '('.repeat(20000),
    'pipe run': '|'.repeat(20000),
    'hash run': '#'.repeat(20000),
    'one long line': 'word '.repeat(40000),
    'one long fenced block': '```js\n' + 'const x = 1\n'.repeat(20000) + '```',
    'many unclosed fences': '```\n'.repeat(5000),
    'deep blockquotes': Array.from({ length: 400 }, (_, i) => `${'>'.repeat(i + 1)} text`).join('\n'),
    'deep lists': Array.from({ length: 200 }, (_, i) => `${'  '.repeat(i)}- item`).join('\n'),
    'many headings': Array.from({ length: 5000 }, (_, i) => `# heading ${i}`).join('\n'),
    'many duplicate headings': Array.from({ length: 5000 }, () => '# same').join('\n'),
    'many table rows': '| a | b |\n| --- | --- |\n' + '| x | y |\n'.repeat(5000),
    'many footnotes': Array.from({ length: 2000 }, (_, i) => `text [^n${i}]\n\n[^n${i}]: note`).join('\n'),
    'many link defs': Array.from({ length: 2000 }, (_, i) => `[a${i}]: /${i}\n\n[a${i}]`).join('\n'),
    'html soup': '<div>'.repeat(20000),
    'entities': '&amp;'.repeat(20000),
    'control characters': '\u0000\u0001'.repeat(20000),
    'nul digit nul': '\u00001\u0000'.repeat(5000),
    'placeholder collision': '`code` \u00005\u0000 and \u0001abc\u0001'.repeat(200),
  }
  for (const [name, src] of Object.entries(cases)) {
    const started = Date.now()
    let html
    try {
      html = md.render(src)
    } catch (e) {
      assert.fail(`rendering ${name} threw ${e.name}: ${e.message}`)
    }
    const elapsed = Date.now() - started
    assert.ok(
      typeof html === 'string' && html.length > 0,
      `rendering ${name} produced ${html === '' ? 'nothing' : 'a non-string'}`,
    )
    assert.ok(elapsed < BUDGET_MS, `rendering ${name} took ${elapsed}ms (budget ${BUDGET_MS}ms)`)
  }
})

test('fuzz: a huge document renders with a bounded working set', () => {
  // The other half of the DoS question: a real 10 000-line page must not be
  // special. Measured rather than asserted per-case, so a slow machine does not
  // turn this into a flaky test — the assertion is that it finished at all, in
  // one pass, with a correct structural result.
  const src = Array.from({ length: 10000 }, (_, i) =>
    `## Section ${i}\n\nSome **prose** with a [link](/a/${i}) and \`code\`.\n\n- item one\n- item two\n`).join('\n')
  const { html, headings } = render(src)
  assert.equal(headings.length, 10000)
  assert.ok(html.includes('Section 9999'))
  assert.deepEqual(scanHtml(html).errors, [])
})

/* ---------------- 5. the whole pipeline, not just the renderer ---------------- */

test('fuzz: a generated content file survives frontmatter plus rendering', () => {
  // `render` is not the whole path a page takes: the body is preceded by
  // frontmatter, split out first. Fuzzing only the renderer would miss a
  // disagreement between the two about where the document begins.
  forAllDocs({
    name: 'a page body with frontmatter must render and keep its body text',
    cases: Math.max(50, Math.floor(CASES / 10)),
    check: (src) => {
      const fm = `---\ntitle: Generated ${src.length}\ntags: [a, b]\n---\n`
      const { data, body, error } = parseFrontmatter(fm + src)
      if (error) return `frontmatter failed on a valid header: ${error}`
      if (data.title !== `Generated ${src.length}`) return 'frontmatter lost the title'
      const { html } = render(body)
      const seen = compact(html)
      for (const marker of requiredTokens(src)) {
        if (!seen.includes(marker)) return `token ${marker} vanished after frontmatter splitting`
      }
      return true
    },
  })
})

/* ---------------- reporting ---------------- */

test('fuzz: the generator actually produces hostile documents', () => {
  // A fuzzer that stopped generating the hard cases would keep this file green
  // and worthless. So the generator is itself under test: over a sample of
  // documents, the constructs that matter must actually appear, and each marker
  // must be unique within its document.
  const need = [
    ['fence', '```'], ['link', ']('], ['image', '!['], ['footnote', '[^'],
    ['link definition', ']: '], ['table', '| ---'], ['task', '- ['],
    ['callout', '[!NOTE]'], ['heading', '# '], ['quote', '>'],
    ['code span', '`'], ['emphasis', '*'], ['image scheme', 'data:'],
    ['javascript', 'javascript'], ['raw html', '<'], ['entity', '&'],
  ]
  let seen = ''
  for (let i = 0; i < 400; i++) {
    const src = fuzzDocument(makeRandom((SEED + i * 7919) >>> 0))
    seen += src + '\n'
    const markers = markersOf(src)
    assert.equal(new Set(markers).size, markers.length, `duplicate marker in:\n${show(src)}`)
  }
  for (const [name, needle] of need) {
    assert.ok(seen.includes(needle), `the generator never produced a document with ${name} (${needle})`)
  }
})

test('fuzz: the generator produces markup-free documents when asked', () => {
  // The counterpart to the test above, and the premise the structural properties
  // stand on: `markup: false` has to mean *no author's `<` anywhere in the
  // source*. Several atoms spliced markup in by hand instead of drawing from the
  // filtered pool — a fence that appended `<img` to its info string, a link
  // definition whose URL was an angle-bracket autolink — so the guarantee held
  // only for the atoms that happened to consult a pool. The renderer correctly
  // passed those tags through (raw HTML in a body is documented behaviour), and
  // the structural properties duly reported it, which is a fact about the test's
  // premise rather than a defect in the renderer.
  for (let i = 0; i < 600; i++) {
    const src = fuzzDocument(makeRandom((SEED + i * 104729) >>> 0), { markup: false })
    const line = src.split('\n').find((l) => l.includes('<'))
    assert.equal(line, undefined, `markup-free document contains "<":\n${show(src)}`)
  }
})
