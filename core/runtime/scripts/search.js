// The client-side JavaScript, as strings.
//
// Nothing here imports anything: these are template strings, and the only
// coupling is the `nonce` argument, which every script must carry to satisfy
// the page CSP. Anything non-trivial enough to deserve its own file should ship
// as a real asset instead — see the customisation docs.

export function searchScript(labels, nonce) {
  const placeholder =
    labels.searchPlaceholder || "Search pages, posts, tags...";
  const empty = labels.searchEmpty || "No results";
  return `
<script nonce="${nonce}">
/* JPROT instant search — indexes /@jprot/search.json, opens via jprotSearch() */
(function () {
  if (!window.fetch) return
  var PLACEHOLDER = ${JSON.stringify(placeholder)}
  var SEARCH_EMPTY = ${JSON.stringify(empty)}
  function attr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') }
  var overlay = null
  var input = null
  var list = null
  var index = null

  function ensure() {
    if (overlay) return
    overlay = document.createElement('div')
    overlay.className = 'search-overlay'
    overlay.innerHTML = [
      '<div class="search-box">',
      '<div class="search-header">',
      '<input class="search-input" type="search" placeholder="' + attr(PLACEHOLDER) + '" autocomplete="off">',
      '<button class="search-close" type="button" aria-label="Close">&times;</button>',
      '</div>',
      '<div class="search-results"></div>',
      '</div>',
    ].join('')
    document.body.appendChild(overlay)
    input = overlay.querySelector('.search-input')
    list = overlay.querySelector('.search-results')
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close() })
    overlay.querySelector('.search-close').addEventListener('click', close)
    input.addEventListener('input', function () { render(input.value) })
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var rows = list.querySelectorAll('a')
        if (!rows.length) return
        var idx = findFocus()
        if (e.key === 'ArrowDown') idx = (idx + 1) % rows.length
        else idx = (idx - 1 + rows.length) % rows.length
        e.preventDefault()
        var next = rows[idx]
        rows.forEach(function (a) { a.removeAttribute('data-active') })
        next.setAttribute('data-active', '')
        next.scrollIntoView({ block: 'nearest' })
        return
      }
      if (e.key === 'Enter') {
        var a = list.querySelector('a[data-active]') || list.querySelector('a')
        if (a) { e.preventDefault(); openLink(a) }
      }
    })
  }

  function close() {
    if (overlay) { overlay.classList.remove('open'); input.value = '' }
  }

  function openLink(a) {
    var href = a.getAttribute('href')
    close()
    if (href) window.location.href = href // full nav to avoid SPA edge cases from modal
  }

  function norm(s) { return String(s || '').toLowerCase() }
  function reEsc(q) { return q.replace(/[.*+?^()|[\]\\{}$]/g, '\\$&') }
  function hl(s, q) {
    if (!s) return ''
    var e = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    if (!q) return e
    return e.replace(new RegExp('(' + reEsc(q) + ')', 'ig'), '<mark>$1</mark>')
  }
  function around(s, q) {
    var str = String(s || '')
    var i = norm(str).indexOf(q)
    if (i === -1) return str.slice(0, 160)
    var start = Math.max(0, i - 70)
    return (start ? '…' : '') + str.slice(start, i + q.length + 90) + (start + 160 < str.length ? '…' : '')
  }
  function findFocus() {
    var idx = -1
    list.querySelectorAll('a').forEach(function (a, i) { if (a.hasAttribute('data-active')) idx = i })
    return idx
  }

  function render(q) {
    q = norm(q)
    if (!q) { list.innerHTML = ''; return }
    var data = index || []
    var found = []
    for (var i = 0; i < data.length; i++) {
      var e = data[i]
      // every field is searchable: title, url, date, tags, full body and all
      // frontmatter — plus the unprocessed raw source so fence markers, link
      // URLs and syntax that got stripped still count
      var hay = [norm(e.title), norm(e.excerpt), norm(e.url), norm(e.date), norm(e.body), norm(e.frontmatter), norm(e.raw)]
      var tags = e.tags || []
      for (var t = 0; t < tags.length; t++) hay.push(norm(tags[t]))
      var hit = false
      for (var j = 0; j < hay.length; j++) { if (hay[j].indexOf(q) !== -1) { hit = true; break } }
      if (hit) {
        found.push(e)
        if (found.length >= 12) break
      }
    }
    if (!found.length) { list.innerHTML = '<div class="search-empty">' + attr(SEARCH_EMPTY) + '</div>'; return }
    list.innerHTML = found.map(function (e) {
      var title = hl(e.title, q)
      var snippet = ''
      if (e.body && norm(e.body).indexOf(q) !== -1) snippet = hl(around(e.body, q), q)
      else if (e.raw && norm(e.raw).indexOf(q) !== -1) snippet = hl(around(e.raw, q), q)
      else if (e.frontmatter && norm(e.frontmatter).indexOf(q) !== -1) snippet = hl('Config: ' + around(e.frontmatter, q), q)
      if (!snippet && e.excerpt) snippet = hl(e.excerpt, q)
      var tag = (e.tags && e.tags.length) ? '<span class="search-tags">' + e.tags.map(function (t) { return '<span>' + hl(t, q) + '</span>' }).join('') + '</span>' : ''
      var excerpt = snippet ? '<span class="search-excerpt">' + snippet + '</span>' : ''
      return '<a href="' + e.url + '" class="search-result"><span class="search-title">' + title + '</span>' + excerpt + tag + '</a>'
    }).join('')
  }

  window.jprotSearch = async function () {
    ensure()
    overlay.classList.add('open')
    input.focus()
    if (index === null) {
      try {
        const res = await fetch('/@jprot/search.json')
        index = (await res.json()) || []
        render(input.value)
      } catch {
        index = []
      }
    } else {
      render(input.value)
    }
  }
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); window.jprotSearch() }
  })
})()
</script>
`;
}
