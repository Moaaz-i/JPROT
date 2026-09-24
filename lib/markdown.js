export function createMarkdown(options = {}) {
  const md = {
    inline: options.inline ?? true,
    headings: options.headings ?? true,
    lists: options.lists ?? true,
    code: options.code ?? true,
    blockquote: options.blockquote ?? true,
    hr: options.hr ?? true,
    links: options.links ?? true,
    images: options.images ?? true,
    table: options.table ?? true,
    emphasis: options.emphasis ?? true,
    footnotes: options.footnotes ?? true,
    autolinks: options.autolinks ?? true,
    taskLists: options.taskLists ?? true,
  }

  // Per-render state. `render` is synchronous, so storing it on the closure is
  // safe as long as every render call resets it before emitting anything.
  let usedIds = {}
  let noteDefs = {}
  let noteOrder = []
  let linkDefs = {}

  // ASCII punctuation escapable with a backslash (CommonMark §2.2): a lone
  // backslash followed by one of these characters yields the literal char.
  const ESCAPE_RE = /\\([!"#$%&'()*+,\-./:;<=>?@$^_`{|}~[\]\\])/g

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function safeUrl(value, { image = false } = {}) {
    const url = String(value || '').trim()
    if (!url || /[\u0000-\u001f\u007f]/.test(url)) return '#'
    if (/^(?:javascript|vbscript):/i.test(url)) return '#'
    if (/^data:/i.test(url) && !(image && /^data:image\//i.test(url))) return '#'
    return url
  }

  // Convert internal `*.md` links to clean browser URLs (`page.md` → `page`,
  // `dir/index.md` → `dir/`). Markdown sources keep `.md` links so they remain
  // readable on GitHub, while every rendered surface (live server, static
  // export) gets extension‑free links that resolve without a redirect.
  function canonicalLink(value) {
    const url = String(value || '').trim()
    if (!url || url.startsWith('#')) return url
    if (url.includes('://') || /^(?:mailto:|tel:|data:|news:|javascript:|vbscript:)/i.test(url)) return url
    const idx = url.search(/[?#]/)
    const path = idx === -1 ? url : url.slice(0, idx)
    const suffix = idx === -1 ? '' : url.slice(idx)
    if (!/\.md$/i.test(path)) return url
    const withoutMd = path.slice(0, -3)
    if (/^(?:\.\/)?index$/i.test(withoutMd)) return './' + suffix
    if (/\/index$/i.test(withoutMd)) return withoutMd.slice(0, -6) + '/' + suffix
    return withoutMd + suffix
  }

  // Delimiter-aware emphasis. Strong runs are resolved first (so a single `*`
  // inside `**…**` stays available for nesting), then single-em runs. Guards
  // reject delimiters squeezed against whitespace or another delimiter, which
  // keeps pathology like `****` literal instead of mangled.
  function renderEmphasis(s) {
    if (!md.emphasis) return s
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

  function inline(str) {
    if (!md.inline) return str
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

    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, alt, src, title) => {
      const t = title ? ` title="${escapeHtml(title)}"` : ''
      return `<img src="${escapeHtml(safeUrl(src, { image: true }))}" alt="${escapeHtml(alt)}"${t}>`
    })

    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, text, url, title) => {
      const t = title ? ` title="${escapeHtml(title)}"` : ''
      return `<a href="${escapeHtml(safeUrl(canonicalLink(url)))}"${t}>${escapeHtml(text)}</a>`
    })

    // Reference-style links: `[text][id]`, collapsed `[text][]`, and the
    // shortcut `[text]` — each resolved against the document's `[id]: url`
    // definitions. Unknown references stay literal (CommonMark behaviour).
    if (md.links) {
      const linkHtml = (label, id) => {
        const url = linkDefs[id.toLowerCase()]
        return url ? `<a href="${escapeHtml(safeUrl(canonicalLink(url)))}">${escapeHtml(label)}</a>` : null
      }
      s = s.replace(/\[([^\]]+)\]\[([^\]]+)\]/g, (m, text, id) => linkHtml(text, id) || m)
      s = s.replace(/\[([^\]]+)\]\[\]/g, (m, text) => linkHtml(text, text) || m)
      s = s.replace(/\[([^\]]+)\](?!\()/g, (m, id) => linkHtml(id, id) || m)
    }

    // Autolinks: <https://…> and <mail-like@example.com>.
    if (md.autolinks) {
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
    if (md.footnotes) {
      s = s.replace(/\[\^([A-Za-z0-9_\-]+)\]/g, (m, id) => {
        if (!(id in noteDefs)) return m
        if (!noteOrder.includes(id)) noteOrder.push(id)
        const n = noteOrder.indexOf(id) + 1
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

  function renderCode(lang, code) {
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : ''
    return `<pre class="code-block"><button class="copy-code" type="button" data-action="copy-code" aria-label="Copy code">Copy</button><code${langClass}>${escapeHtml(code)}</code></pre>`
  }

  function parseTable(lines) {
    const headerMatches = lines[0].split('|').map((c) => c.trim()).filter(Boolean)
    const rows = lines.slice(2).map((l) => l.split('|').map((c) => c.trim()).filter(Boolean))

    let html = '<table>\n<thead>\n<tr>'
    for (const h of headerMatches) {
      html += `<th>${inline(h)}</th>`
    }
    html += '</tr>\n</thead>\n<tbody>\n'

    for (const row of rows) {
      html += '<tr>'
      for (const cell of row) {
        html += `<td>${inline(cell)}</td>`
      }
      html += '</tr>\n'
    }
    html += '</tbody>\n</table>'
    return html
  }

  function slugify(text) {
    return text.trim().toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  // Pre-scan the document for `[^id]: …` definitions (code-fence aware) so
  // references can be resolved even when the definition appears later. The
  // first line holds the note text and indented lines continue it.
  function collectFootnoteDefs(lines) {
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

  // Pre-scan for `[id]: url` link definitions — first definition wins, code
  // fences and footnote definitions are skipped.
  function collectLinkDefs(lines) {
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

  function render(src, headingOut) {
    const lines = src.split(/\r?\n/)
    const headings = headingOut || []
    usedIds = {}
    noteDefs = collectFootnoteDefs(lines)
    noteOrder = []
    linkDefs = collectLinkDefs(lines)

    let html = emit(lines, true)
    if (noteOrder.length) html += renderFootnotes()
    return html

    // Recursive block emitter. `toc` controls whether headings are collected
    // for the table of contents (only the top level produces TOC entries).
    function emit(blockLines, toc = false) {
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
          out += `<p>${inline(para.map((l) => l.trimStart()).join('\n'))}</p>\n`
          para = []
        }
      }

      function flushQuote() {
        if (!quoteBuf.length) return
        const callout = quoteBuf[0].match(/^\[!(NOTE|TIP|WARNING|DANGER)\]\s*(.*)$/i)
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

      function listMarker(l) {
        const um = l.match(/^(\s*)([*+-])(\s+)(.*)$/)
        if (um) return { kind: 'ul', indent: um[1].length, col: um[1].length + 1 + um[3].length, text: um[4] }
        const om = l.match(/^(\s*)(\d+)([.)])(\s+)(.*)$/)
        if (om) return { kind: 'ol', indent: om[1].length, col: om[1].length + om[2].length + 1 + om[4].length, text: om[5] }
        return null
      }

      // Consumes a whole list at `baseIndent`. Item continuity lines that are
      // indented past the marker column become the item's inner block, which
      // lets nested lists, paragraphs and code render recursively. A blank
      // line only ends the list if the next non-blank line cannot continue it.
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
          const task = md.taskLists ? itemLines[0].trimStart().match(/^\[([ xX])\]\s*(.*)$/) : null
          let prefix = ''
          if (task) {
            itemLines[0] = task[2]
            prefix = `<input class="task-checkbox" type="checkbox"${task[1].toLowerCase() === 'x' ? ' checked' : ''} disabled> `
          }
          const liClass = task ? ' class="task-list-item"' : ''
          if (looseList) return `<li${liClass}>${prefix}${emit(itemLines, false)}</li>`
          const blocky = itemLines.some((l) => {
            const t = l.trimStart()
            return listMarker(t) || /^```/.test(t) || /^>/.test(t) || /^#{1,6}\s/.test(t) || /^\[\^[A-Za-z0-9_\-]+\]:/.test(t)
          })
          if (!blocky) return `<li${liClass}>${prefix}${inline(itemLines.map((x) => x.trimStart()).join(' '))}</li>`
          // Lead text as inline, remaining lines render as nested blocks.
          const lead = itemLines[0].trimStart()
          return `<li${liClass}>${prefix}${lead ? inline(lead) : ''}${emit(itemLines.slice(1), false)}</li>`
        })
        return `<${tag}>\n${items.join('\n')}\n</${tag}>\n`
      }

      while (j < len) {
        const line = blockLines[j]

        const codeMatch = line.match(/^\s*```(\w*)\s*$/)
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
        if (line.match(/^\[\^[A-Za-z0-9_\-]+\]:/)) {
          flushAll()
          j++
          while (j < len && blockLines[j].trim() !== '' && /^\s*/.exec(blockLines[j])[0].length > 0) j++
          continue
        }

        // Skip link definitions (collected in the pre-scan).
        if (line.match(/^\[[^\]]+\]:\s*\S/)) {
          flushAll()
          j++
          continue
        }

        if (md.table && line.includes('|') && blockLines[j + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(blockLines[j + 1]) && blockLines[j + 1].includes('-')) {
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

        if (md.hr && /^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
          flushAll()
          out += '<hr>\n'
          j++
          continue
        }

        const quoteMatch = line.match(/^>\s?(.*)$/)
        if (md.blockquote && quoteMatch) {
          flushPara()
          quoteBuf.push(quoteMatch[1])
          j++
          continue
        }

        const marker = md.lists && listMarker(line)
        if (marker) {
          flushAll()
          out += parseList(marker.kind, marker.indent)
          continue
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
        if (md.headings && headingMatch) {
          flushAll()
          const level = headingMatch[1].length
          let id = slugify(headingMatch[2])
          if (usedIds[id] === undefined) usedIds[id] = 0
          usedIds[id]++
          if (usedIds[id] > 1) id = `${id}-${usedIds[id]}`
          if (toc) headings.push({ level, text: headingMatch[2], id })
          out += `<h${level} id="${escapeHtml(id)}">${inline(headingMatch[2])}</h${level}>\n`
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

    function renderFootnotes() {
      const lis = noteOrder.map((id, n) => {
        const body = noteDefs[id] ? noteDefs[id].join('\n') : ''
        const back = `<a href="#fnref-${id}" class="footnote-backref" aria-label="Back to reference">\u21A9\uFE0E</a>`
        return `<li id="fn-${id}">${body.length ? inline(body) : ''}${back}</li>`
      }).join('\n')
      return `<section class="footnotes"><ol>\n${lis}\n</ol></section>\n`
    }
  }

  return {
    render,
    escapeHtml,
    safeUrl,
    slugify,
  }
}