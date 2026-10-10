// Block (block-level) Markdown: fenced code, blockquotes and callouts, tables,
// horizontal rules, lists (nested, loose, task lists), headings, link/footnote
// definition skipping and paragraphs.
//
// `emit` is recursive: list items, quotes and callouts re-enter it with their
// own line arrays, which is why heading collection is gated by the `toc`
// argument (only the top level contributes to the page's table of contents).
import { FOOTNOTE_DEF_RE, LINK_DEF_RE } from './definitions.js'
import { FENCE_OPEN_RE, fenceStep, newFenceState } from './fence.js'
import { escapeHtml } from './sanitize.js'
import { uniqueSlug } from './slugify.js'

const CALLOUT_RE = /^\[!(NOTE|TIP|WARNING|DANGER)\]\s*(.*)$/i
const TABLE_DIVIDER_RE = /^\s*\|?[\s:|-]+\|?\s*$/
const HR_RE = /^\s*(---+|\*\*\*+|___+)\s*$/
const QUOTE_RE = /^>\s?(.*)$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const TASK_RE = /^\[([ xX])\]\s*(.*)$/
// A setext underline: a run of `=` (level 1) or `-` (level 2) under a paragraph,
// indented at most three spaces — four would be ambiguous with a code body, which
// this renderer deliberately does not have.
//
// Indented code blocks are *not* supported, and that is a decision rather than
// an omission. Every other block rule here is answered from one line at a time,
// so the definition pre-scan and the prose model in the fuzz suite can re-derive
// the same answer; "four spaces start code, unless a paragraph is running, unless
// we are inside a list item whose indent has already been dedented" is answered
// from the emitter's *position in the tree*, and a flat scan cannot see that
// position. The one time it was tried, a `[^a]` on an indented line was prose to
// the model and code to the emitter, so the model expected a note the page could
// not have — and the definition beneath it was skipped by the emitter with its
// text never rendered anywhere. Indented source lines keep rendering as prose.
const SETTEXT_RE = /^(\s{0,3})(=+|-+)\s*$/

// The list marker, with the two things that make a list hard to get right: the
// item's *content column* (how far a continuation line has to be indented to
// belong to the item) and the text after the marker. Hoisted out of
// `createBlockRenderer` — it closes over nothing — so the patterns the recursion
// below is built on can be exported as a set. See `BLOCK_PATTERNS`.
function listMarker(l) {
  const um = l.match(/^(\s*)([*+-])(\s+)(.*)$/)
  if (um) return { kind: 'ul', indent: um[1].length, col: um[1].length + 1 + um[3].length, text: um[4] }
  const om = l.match(/^(\s*)(\d+)([.)])(\s+)(.*)$/)
  if (om) return { kind: 'ol', indent: om[1].length, col: om[1].length + om[2].length + 1 + om[4].length, text: om[5] }
  return null
}

/**
 * The block patterns `emit` recurses on, exported so the fuzz oracle can walk the
 * same decision tree instead of re-guessing where the document's containers are.
 *
 * Same reasoning as `FENCE_OPEN_RE`, one level up, and for the same reason: the
 * emitter and the definition pre-scan disagree about where code blocks start, and
 * a second copy of these patterns is a second answer to the same question. Here
 * the disagreement is concrete — an indented ``` inside a task item is a
 * *continuation line of that item*, so it opens a fence inside the item and not in
 * the document, while a flat scan reads it as an opener for everything after it.
 * The oracle has to know which of the two it is asking about before it can say
 * whether a footnote reference reaches the inline pass.
 *
 * Internal: not re-exported from `lib/markdown.js`, so the public API is unchanged.
 */
export const BLOCK_PATTERNS = { listMarker, QUOTE_RE, CALLOUT_RE, TASK_RE }

export function createBlockRenderer(options, doc) {
  const { headings: headingsOn, lists, blockquote, hr, table, taskLists } = options
  const inline = doc.inline

  // Is this line a definition the pre-scan actually consumed, so the emitter will skip
  // it? The single answer to that question, for the branches below and for the table's
  // row loop — which is the one place that reaches further than one line and so can
  // otherwise run past a definition nobody is going to skip.
  //
  // `toc` is part of the question, and it is the same part the branches below
  // include. Inside a list item or a quote the emitter renders a definition as the
  // paragraph it looks like, so nothing is skipped and the row loop must keep
  // claiming the line: answering "yes, it is a definition" there would end the table
  // early and hand the line back to a branch that renders it — which reads as the
  // whole table jumping out of its `<li>`.
  function isCollectedDefinition(line, toc) {
    if (!toc) return false
    const note = FOOTNOTE_DEF_RE.exec(line)
    if (note && note[1] in doc.noteDefs) return true
    const link = LINK_DEF_RE.exec(line)
    return Boolean(link && link[1].toLowerCase() in doc.linkDefs)
  }

  // Fenced code block with a copy button (CSP-safe: the button carries
  // `data-action`, handled by the delegated click listener).
  function renderCode(lang, codeBody) {
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : ''
    return `<pre class="code-block"><button class="copy-code" type="button" data-action="copy-code" aria-label="Copy code">Copy</button><code${langClass}>${escapeHtml(codeBody)}</code></pre>`
  }

  function parseTable(lines) {
    const headerMatches = lines[0].split('|').map((c) => c.trim()).filter(Boolean)
    const rows = lines.slice(2).map((l) => l.split('|').map((c) => c.trim()).filter(Boolean))

    let html = '<table>\n<thead>\n<tr>'
    for (const h of headerMatches) {
      html += `<th>${inline.render(h)}</th>`
    }
    html += '</tr>\n</thead>\n<tbody>\n'

    for (const row of rows) {
      html += '<tr>'
      for (const cell of row) {
        html += `<td>${inline.render(cell)}</td>`
      }
      html += '</tr>\n'
    }
    html += '</tbody>\n</table>'
    return html
  }

  return function emit(blockLines, toc = false) {
    let out = ''
    let j = 0
    const len = blockLines.length
    // The fence state machine lives beside the buffer, because it is only
    // meaningful while a fence is open, and it resets the moment one closes.
    const fenceState = newFenceState()
    let codeBuf = []
    let codeLang = ''
    let quoteBuf = []
    let para = []

    function flushPara() {
      if (para.length) {
        out += `<p>${inline.render(para.map((l) => l.trimStart()).join('\n'))}</p>\n`
        para = []
      }
    }

    function flushQuote() {
      if (!quoteBuf.length) return
      const callout = quoteBuf[0].match(CALLOUT_RE)
      if (callout) {
        const kind = callout[1].toLowerCase()
        const label = kind[0].toUpperCase() + kind.slice(1)
        const body = [callout[2], ...quoteBuf.slice(1)].filter(Boolean)
        out += `<aside class="callout callout-${kind}" role="note"><strong>${label}</strong>${body.length ? `\n${emit(body)}` : ''}</aside>\n`
      } else {
        out += `<blockquote>\n${emit(quoteBuf)}</blockquote>\n`
      }
      quoteBuf = []
    }

    const flushAll = () => { flushPara(); flushQuote() }

    // Consumes a whole list at `baseIndent`. Item continuation lines that are
    // indented past the marker column become the item's inner block, which
    // lets nested lists, paragraphs and code render recursively. A blank line
    // only ends the list if the next non-blank line cannot continue it.
    function parseList(tag, baseIndent) {
      const collected = []
      while (j < len) {
        const m = listMarker(blockLines[j])
        if (!m || m.indent !== baseIndent || m.kind !== tag) break
        const col = m.col
        j++
        const itemLines = [m.text]
        while (j < len) {
          const l = blockLines[j]
          if (l.trim() === '') {
            let k = j + 1
            while (k < len && blockLines[k].trim() === '') k++
            if (k >= len) break
            const nextIndent = /^\s*/.exec(blockLines[k])[0].length
            const nextMarker = listMarker(blockLines[k])
            const continues = nextIndent > baseIndent
              || (nextMarker && nextMarker.indent === baseIndent && nextMarker.kind === tag)
            if (continues) {
              itemLines.push('')
              j++
              continue
            }
            break
          }
          const indent = /^\s*/.exec(l)[0].length
          if (indent > baseIndent) {
            // Dedent by the item's content column, but never by more than the
            // line is actually indented. Slicing by `col` unconditionally eats
            // characters from any line indented less than the marker is wide: a
            // two-space fence inside a `1. ` item (column 4) was sliced down to
            // a single stray backtick, so the code block rendered as inline text,
            // and `1. a` followed by `  hello` lost its first two letters. Both
            // are silent — the item just renders wrong.
            const cut = Math.min(indent, col) - baseIndent
            itemLines.push(cut > 0 ? l.slice(cut) : l.trimStart())
            j++
            continue
          }
          break
        }
        collected.push(itemLines)
      }

      // One blank anywhere makes the whole list loose, so every item gets
      // paragraph wrappers (CommonMark behaviour).
      const looseList = collected.some((item) => item.some((l) => l.trim() === ''))
      const items = collected.map((itemLines) => {
        const task = taskLists ? itemLines[0].trimStart().match(TASK_RE) : null
        let prefix = ''
        if (task) {
          itemLines[0] = task[2]
          prefix = `<input class="task-checkbox" type="checkbox"${task[1].toLowerCase() === 'x' ? ' checked' : ''} disabled> `
        }
        const liClass = task ? ' class="task-list-item"' : ''
        if (looseList) return `<li${liClass}>${prefix}${emit(itemLines, false)}</li>`
        // "Does this item hold a block-level construct?" It asks the same fence
        // question as the main loop and the pre-scan, so a four-backtick line —
        // which is text, not a fence — does not split the item into blocks here
        // while the pre-scan treats it as code there.
        const blocky = itemLines.some((l) => {
          const t = l.trimStart()
          return listMarker(t) || FENCE_OPEN_RE.test(t) || /^>/.test(t) || /^#{1,6}\s/.test(t) || FOOTNOTE_DEF_RE.test(t)
        })
        if (!blocky) return `<li${liClass}>${prefix}${inline.render(itemLines.map((x) => x.trimStart()).join(' '))}</li>`
        // Lead text as inline, remaining lines render as nested blocks.
        const lead = itemLines[0].trimStart()
        return `<li${liClass}>${prefix}${lead ? inline.render(lead) : ''}${emit(itemLines.slice(1), false)}</li>`
      })
      return `<${tag}>\n${items.join('\n')}\n</${tag}>\n`
    }

    while (j < len) {
      const line = blockLines[j]

      // Fence detection itself is never disabled: an unterminated fence must
      // still keep its contents away from the other block rules. `fenceStep` is
      // the same function the definition pre-scan runs, so the two cannot end up
      // disagreeing about where code begins — which is the failure that takes
      // text off a page silently.
      const step = fenceStep(fenceState, line)
      if (step) {
        // A fence line of the *other* character does not close the one that is
        // open — it is just the next line of code.
        if (step === 'inside') {
          codeBuf.push(line)
          j++
          continue
        }
        flushAll()
        if (step === 'open') {
          codeBuf = []
          codeLang = FENCE_OPEN_RE.exec(line)[1]
        } else {
          out += renderCode(codeLang, codeBuf.join('\n'))
        }
        j++
        continue
      }

      if (fenceState.inCode) {
        codeBuf.push(line)
        j++
        continue
      }

      if (line.trim() === '') {
        flushAll()
        j++
        continue
      }

      // Skip definition lines — but only the ones the pre-scan actually consumed,
      // and only as many lines as it claimed.
      //
      // Re-deriving "this is a definition" from a pattern is what made text
      // disappear, three times over. The pre-scan only ever looked at *top-level*
      // lines, so a definition the emitter met indented inside a list item or a
      // quote was never collected — and skipping it here threw its text away with
      // nothing to render in its place, which is how `- [^a]: the note` came out
      // as an empty `<li>`. `toc` is what says "top level", and it is the same
      // condition the pre-scan worked under.
      //
      // Then the *span* has to come from the pre-scan too. The emitter used to skip
      // the definition line plus every indented line after it, while the collector
      // stops at a code fence — a line of backticks is a fence to both sides of the
      // parser, even where the author may have meant a continuation. So a definition
      // followed by an indented fence lost everything below it: the emitter skipped
      // those lines and the collector never stored them.
      //
      // Asking what was collected makes the failure direction safe. If the pre-scan
      // missed a definition, the line renders as the text it is — visible, harmless,
      // and the reference stays literal because there is no definition to resolve it
      // against, so the page is self-consistent. The alternative is text silently
      // leaving the page, which no snapshot would ever catch.
      const footnote = FOOTNOTE_DEF_RE.exec(line)
      if (toc && footnote && footnote[1] in doc.noteDefs) {
        flushAll()
        j += doc.noteSpans.get(footnote[1]) || 1
        continue
      }

      const link = LINK_DEF_RE.exec(line)
      if (toc && link && link[1].toLowerCase() in doc.linkDefs) {
        flushAll()
        j++
        continue
      }

      if (table && line.includes('|') && blockLines[j + 1] && TABLE_DIVIDER_RE.test(blockLines[j + 1]) && blockLines[j + 1].includes('-')) {
        flushAll()
        const tableBuf = [line]
        j += 1
        // A row is any line with a `|` in it, so the table's own reach is wider than
        // every other block's — and it runs straight past a definition line, which is
        // the one line the emitter has promised to skip. Nothing above stops it: the
        // definition branches test `blockLines[j]`, and by the time they would run the
        // row is already in `tableBuf`. The fuzz suite found it with a definition
        // written after a one-column table, where the `[^a]:` was consumed as a cell
        // and the footnote it defines then had no definition at all — while its own
        // `[^a]` rendered as a live reference, so the page linked a note that was not
        // on it and printed no note. So the loop asks the same question the branches
        // above ask, and stops the same way.
        while (j < len && blockLines[j].trim() !== '' && blockLines[j].includes('|') && !isCollectedDefinition(blockLines[j], toc)) {
          tableBuf.push(blockLines[j])
          j++
        }
        out += parseTable(tableBuf)
        continue
      }

      // Setext headings: a line of `=` or `-` *directly under* a paragraph is an
      // underline, not a thematic break. It has to be tested before the `<hr>` —
      // CommonMark reads `Heading\n---` as an `<h2>`, and an `<hr>` butted against
      // the text above it is rarely what the author meant. The blank line is what
      // keeps `alpha\n\n---\n\nbeta` an `<hr>` between two paragraphs, because an
      // empty paragraph is no paragraph to underline.
      if (headingsOn && para.length) {
        const underline = SETTEXT_RE.exec(line)
        if (underline) {
          const level = underline[2][0] === '=' ? 1 : 2
          const text = para.map((l) => l.trim()).join('\n')
          const id = uniqueSlug(text, doc.usedIds)
          if (toc) doc.headings.push({ level, text, id })
          para = []
          out += `<h${level} id="${escapeHtml(id)}">${inline.render(text)}</h${level}>\n`
          j++
          continue
        }
      }

      if (hr && HR_RE.test(line)) {
        flushAll()
        out += '<hr>\n'
        j++
        continue
      }

      const quoteMatch = blockquote ? line.match(QUOTE_RE) : null
      if (quoteMatch) {
        flushPara()
        quoteBuf.push(quoteMatch[1])
        j++
        continue
      }

      const marker = lists && listMarker(line)
      if (marker) {
        flushAll()
        out += parseList(marker.kind, marker.indent)
        continue
      }

      const headingMatch = headingsOn ? line.match(HEADING_RE) : null
      if (headingMatch) {
        flushAll()
        const level = headingMatch[1].length
        const id = uniqueSlug(headingMatch[2], doc.usedIds)
        if (toc) doc.headings.push({ level, text: headingMatch[2], id })
        out += `<h${level} id="${escapeHtml(id)}">${inline.render(headingMatch[2])}</h${level}>\n`
        j++
        continue
      }

      para.push(line)
      j++
    }

    flushAll()
    if (fenceState.inCode) {
      out += renderCode(codeLang, codeBuf.join('\n'))
    }
    return out
  }
}
