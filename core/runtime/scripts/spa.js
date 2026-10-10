// The client-side JavaScript, as strings.
//
// Nothing here imports anything: these are template strings, and the only
// coupling is the `nonce` argument, which every script must carry to satisfy
// the page CSP. Anything non-trivial enough to deserve its own file should ship
// as a real asset instead — see the customisation docs.

export const spaScript = (nonce) => `
<script nonce="${nonce}">
/* JPROT SPA navigation — no full page reload on internal links */
(function () {
  if (!window.history || !window.fetch) return

  var scrollMap = {}

  function isSameOrigin(url) {
    return url.origin === window.location.origin
  }

  function pathOf(url) {
    return new URL(url, window.location.href).pathname
  }

  function setActiveLink() {
    var path = window.location.pathname
    document.querySelectorAll('.site-nav a[href], .sb-link[href]').forEach(function (a) {
      var href = a.getAttribute('href') || ''
      var hrefPath = href.split('#')[0].replace(/\\/$/, '')
      var cur = path.replace(/\\/$/, '')
      var active = hrefPath === cur || (hrefPath !== '/' && cur.startsWith(hrefPath))
      a.classList.toggle('active', active)
      if (active) a.setAttribute('aria-current', 'page')
      else a.removeAttribute('aria-current')
    })
  }

  // After a route change, move focus into the freshly loaded <main> and tell
  // assistive tech which page we're on. Without this, a keyboard or
  // screen-reader user follows a link and nothing announces that the page
  // changed - they stay where they were on the old page.
  function announceAndFocus() {
    var live = document.getElementById('jprot-announce')
    if (live) live.textContent = document.title
    var main = document.querySelector('main')
    if (!main) return
    try { main.focus({ preventScroll: true }) }
    catch (e) { /* old browser: focus without scroll locking; applyScroll below wins */ main.focus() }
  }

  function scrollToHash(hash) {
    if (!hash) return
    var el = document.getElementById(hash.replace('#', ''))
    if (el) el.scrollIntoView()
  }

  function applyScroll(url, restore) {
    if (restore) {
      var saved = scrollMap[pathOf(url)]
      window.scrollTo(0, saved || 0)
      scrollToHash(new URL(url, window.location.href).hash)
    } else {
      window.scrollTo(0, 0)
    }
  }

  async function loadPage(url, push, restore) {
    try {
      const res = await fetch(url, { headers: { 'X-JPROT-SPA': '1' } })
      if (!res.ok) { window.location.href = url; return }
      const html = await res.text()
      // res.url is the final URL after any redirect (e.g. .md → clean URL),
      // so the address bar, history and scroll map agree with what was served
      var finalUrl = new URL(res.url || url, window.location.href).href
      var doc = new DOMParser().parseFromString(html, 'text/html')
      var nextMain = doc.querySelector('main')
      var curMain = document.querySelector('main')
      if (nextMain && curMain) {
        curMain.outerHTML = nextMain.outerHTML
      }
      document.title = doc.title || document.title
      if (push) { history.pushState({ path: finalUrl }, '', finalUrl) }
      setActiveLink()
      announceAndFocus()
      applyScroll(finalUrl, restore)
    } catch {
      window.location.href = url
    }
  }

  document.addEventListener('click', function (e) {
    var target = e.target.closest ? e.target.closest('a[href]') : null
    if (!target) return
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (target.hasAttribute('download') || target.target === '_blank') return

    var url = new URL(target.href, window.location.href)
    if (!isSameOrigin(url)) return

    // same page with an anchor: just scroll to the element
    if (pathOf(url.href) === pathOf(window.location.href)) {
      if (url.hash) {
        e.preventDefault()
        scrollToHash(url.hash)
        history.replaceState({ path: url.href }, '', url.href)
      }
      return
    }

    // remember where we were, so Back restores this position
    scrollMap[window.location.pathname] = window.scrollY

    e.preventDefault()
    loadPage(url.href, true, false)
  })

  window.addEventListener('popstate', function () {
    loadPage(window.location.href, false, true)
  })

  // project filter buttons (strict-CSP friendly: no inline scripts)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-filter]') : null
    if (!btn) return
    var f = btn.getAttribute('data-filter')
    document.querySelectorAll('.filter-btn').forEach(function (b) {
      b.classList.toggle('active', b === btn)
    })
    var showAll = f === '*'
    document.querySelectorAll('.project-card').forEach(function (card) {
      var tags = card.getAttribute('data-tags') || ''
      card.style.display = (showAll || tags.split(' ').includes('tag-' + f)) ? '' : 'none'
    })
  })

  // contact form submit via fetch (strict-CSP friendly: no inline scripts)
  document.addEventListener('submit', function (e) {
    var form = e.target.closest ? e.target.closest('.contact-form') : null
    if (!form) return
    e.preventDefault()
    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'Accept': 'application/json' }
    }).then(function (r) {
      if (r.ok) {
        form.style.display = 'none'
        document.querySelector('.contact-success').style.display = 'block'
      }
    }).catch(function () {})
  })

  // scrollspy: highlight the sidebar link of the section in view
  function updateSpy() {
    var anchors = Array.from(document.querySelectorAll('.sb-anchor[href^="#"]'))
    if (!anchors.length) return
    var pos = window.scrollY + 120
    var current = null
    for (var i = 0; i < anchors.length; i++) {
      var el = document.getElementById(anchors[i].getAttribute('href').slice(1))
      if (el && el.offsetTop <= pos) current = anchors[i]
    }
    anchors.forEach(function (a) { a.classList.toggle('active', a === current) })
  }
  var spyTimer = null
  window.addEventListener('scroll', function () {
    clearTimeout(spyTimer)
    spyTimer = setTimeout(updateSpy, 80)
  })
  setTimeout(updateSpy, 200)

  setActiveLink()
})()
</script>
`;
