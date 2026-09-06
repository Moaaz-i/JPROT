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
  }

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

  function inline(str) {
    if (!md.inline) return str
    let s = str
    const codes = []

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
      return `<a href="${escapeHtml(safeUrl(canonicalLink(url)))}"${t}>${text}</a>`
    })

    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
    s = s.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')

    // Restore the escaped inline code spans.
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[Number(i)]}</code>`)

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

  function render(src, headingOut) {
    const lines = src.split(/\r?\n/)
    const headings = headingOut || []
    let html = ''
    let i = 0
    let listStack = []
    let inCode = false
    let codeBuf = []
    let codeLang = ''
    let quoteBuf = []
    let tableBuf = null
    const usedIds = {}

    function closeList() {
      while (listStack.length) {
        const list = listStack.pop()
        html += `</${list}>\n`
      }
    }

    function flushList() {
      if (listStack.length) {
        closeList()
        listStack = []
      }
    }

    function flushQuote() {
      if (quoteBuf.length) {
        const callout = quoteBuf[0].match(/^\[!(NOTE|TIP|WARNING|DANGER)\]\s*(.*)$/i)
        if (callout) {
          const kind = callout[1].toLowerCase()
          const label = kind[0].toUpperCase() + kind.slice(1)
          const body = [callout[2], ...quoteBuf.slice(1)].filter(Boolean).join('\n')
          html += `<aside class="callout callout-${kind}" role="note"><strong>${label}</strong>${body ? `\n${render(body)}` : ''}</aside>\n`
        } else {
          html += '<blockquote>\n' + render(quoteBuf.join('\n')) + '</blockquote>\n'
        }
        quoteBuf = []
      }
    }

    function flushTable() {
      if (tableBuf) {
        html += parseTable(tableBuf)
        tableBuf = null
      }
    }

    while (i < lines.length) {
      const line = lines[i]

      const codeMatch = line.match(/^\s*```(\w*)\s*$/)
      if (codeMatch) {
        if (!inCode) {
          flushTable()
          flushQuote()
          flushList()
          inCode = true
          codeBuf = []
          codeLang = codeMatch[1]
          i++
          continue
        } else {
          html += renderCode(codeLang, codeBuf.join('\n'))
          inCode = false
          i++
          continue
        }
      }

      if (inCode) {
        codeBuf.push(line)
        i++
        continue
      }

      if (line.trim() === '') {
        flushTable()
        flushQuote()
        flushList()
        i++
        continue
      }

      if (md.table && line.includes('|') && lines[i + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        flushQuote()
        flushList()
        tableBuf = [line]
        i += 1              // move past the header row
        while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
          tableBuf.push(lines[i])
          i++
        }
        html += parseTable(tableBuf)
        tableBuf = null
        continue
      }

      if (md.hr && /^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
        flushTable()
        flushQuote()
        flushList()
        html += '<hr>\n'
        i++
        continue
      }

      const quoteMatch = line.match(/^>\s?(.*)$/)
      if (md.blockquote && quoteMatch) {
        flushTable()
        flushList()
        quoteBuf.push(quoteMatch[1])
        i++
        continue
      }

      const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/)
      if (md.lists && ulMatch) {
        flushTable()
        flushQuote()
        if (!listStack.length || listStack[listStack.length - 1] !== 'ul') {
          flushList()
          html += '<ul>\n'
          listStack.push('ul')
        }
        html += `<li>${inline(ulMatch[1])}</li>\n`
        i++
        continue
      }

      const olMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
      if (md.lists && olMatch) {
        flushTable()
        flushQuote()
        if (!listStack.length || listStack[listStack.length - 1] !== 'ol') {
          flushList()
          html += '<ol>\n'
          listStack.push('ol')
        }
        html += `<li>${inline(olMatch[2])}</li>\n`
        i++
        continue
      }

      flushTable()
      flushQuote()
      flushList()

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (md.headings && headingMatch) {
        const level = headingMatch[1].length
        let id = slugify(headingMatch[2])
        if (usedIds[id] === undefined) usedIds[id] = 0
        usedIds[id]++
        if (usedIds[id] > 1) id = `${id}-${usedIds[id]}`
        headings.push({ level, text: headingMatch[2], id })
        html += `<h${level} id="${escapeHtml(id)}">${inline(headingMatch[2])}</h${level}>\n`
        i++
        continue
      }

      html += `<p>${inline(line)}</p>\n`
      i++
    }

    flushTable()
    flushQuote()
    flushList()
    if (inCode) {
      html += renderCode(codeLang, codeBuf.join('\n'))
    }

    return html
  }

  return {
    render,
    inline,
    escapeHtml,
    safeUrl,
    slugify,
  }
}
