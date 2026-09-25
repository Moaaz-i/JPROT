// Block (block-level) Markdown: fenced code, blockquotes and callouts, tables,
// horizontal rules, lists (nested, loose, task lists), headings, link/footnote
// definition skipping and paragraphs.
//
// `emit` is recursive: list items, quotes and callouts re-enter it with their
// own line arrays, which is why heading collection is gated by the `toc`
// argument (only the top level contributes to the page's table of contents).
import { FOOTNOTE_DEF_RE, LINK_DEF_RE } from './definitions.js'
import { escapeHtml } from './sanitize.js'
import { uniqueSlug } from './slugify.js'

const CALLOUT_RE = /^\[!(NOTE|TIP|WARNING|DANGER)\]\s*(.*)$/i
const FENCE_OPEN_RE = /^\s*```(\w*)\s*$/
const FENCE_RE = /^\s*```+/
const TABLE_DIVIDER_RE = /^\s*\|?[\s:|-]+\|?\s*$/
const HR_RE = /^\s*(---+|\*\*\*+|___+)\s*$/
const QUOTE_RE = /^>\s?(.*)$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const TASK_RE = /^\[([ xX])\]\s*(.*)$/

export function createBlockRenderer(options, doc) {
  const { headings: headingsOn, lists, blockquote, hr, table, taskLists } = options
  const inline = doc.inline

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

  function listMarker(l) {
    const um = l.match(/^(\s*)([*+-])(\s+)(.*)$/)
    if (um) return { kind: 'ul', indent: um[1].length, col: um[1].length + 1 + um[3].length, text: um[4] }
    const om = l.match(/^(\s*)(\d+)([.)])(\s+)(.*)$/)
    if (om) return { kind: 'ol', indent: om[1].length, col: om[1].length + om[2].length + 1 + om[4].length, text: om[5] }
    return null
  }

  return function emit(blockLines, toc = false) {
    let out = ''
    let j = 0
    const len = blockLines.length
    let inCode = false
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
          if (/^\s*/.exec(l)[0].length > baseIndent) {
            itemLines.push(l.length >= col ? l.slice(col) : l.trimStart())
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
        const blocky = itemLines.some((l) => {
          const t = l.trimStart()
          return listMarker(t) || /^```/.test(t) || /^>/.test(t) || /^#{1,6}\s/.test(t) || FOOTNOTE_DEF_RE.test(t)
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
      // still keep its contents away from the other block rules.
      const codeMatch = line.match(FENCE_OPEN_RE)
      if (codeMatch) {
        flushAll()
        if (!inCode) {
          inCode = true
          codeBuf = []
          codeLang = codeMatch[1]
          j++
          continue
        }
        out += renderCode(codeLang, codeBuf.join('\n'))
        inCode = false
        j++
        continue
      }

      if (inCode) {
        codeBuf.push(line)
        j++
        continue
      }

      if (line.trim() === '') {
        flushAll()
        j++
        continue
      }

      // Skip footnote definitions (content was collected in the pre-scan).
      if (FOOTNOTE_DEF_RE.test(line)) {
        flushAll()
        j++
        while (j < len && blockLines[j].trim() !== '' && /^\s*/.exec(blockLines[j])[0].length > 0) j++
        continue
      }

      // Skip link definitions (collected in the pre-scan).
      if (LINK_DEF_RE.test(line)) {
        flushAll()
        j++
        continue
      }

      if (table && line.includes('|') && blockLines[j + 1] && TABLE_DIVIDER_RE.test(blockLines[j + 1]) && blockLines[j + 1].includes('-')) {
        flushAll()
        const tableBuf = [line]
        j += 1
        while (j < len && blockLines[j].trim() !== '' && blockLines[j].includes('|')) {
          tableBuf.push(blockLines[j])
          j++
        }
        out += parseTable(tableBuf)
        continue
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
    if (inCode) {
      out += renderCode(codeLang, codeBuf.join('\n'))
    }
    return out
  }
}
