// The client-side JavaScript, as strings.
//
// Nothing here imports anything: these are template strings, and the only
// coupling is the `nonce` argument, which every script must carry to satisfy
// the page CSP. Anything non-trivial enough to deserve its own file should ship
// as a real asset instead — see the customisation docs.

export const themeScript = (nonce, configuredThemes) => {
  const ids =
    Array.isArray(configuredThemes) && configuredThemes.length
      ? configuredThemes
          .map((theme) => (typeof theme === "string" ? theme : theme.id))
          .filter(Boolean)
      : ["default", "minimal", "creative", "corporate"];
  return `
<script nonce="${nonce}">
/* JPROT theme toggle — light / dark, persisted locally */
(function () {
  var KEY = 'jprot-theme'
  var root = document.documentElement
  var saved = null
  try { saved = localStorage.getItem(KEY) } catch (e) {}
  if (saved === 'dark' || (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    root.setAttribute('data-theme', 'dark')
  }
  window.jprotToggleTheme = function () {
    var dark = root.getAttribute('data-theme') === 'dark'
    root.setAttribute('data-theme', dark ? 'light' : 'dark')
    try { localStorage.setItem(KEY, dark ? 'light' : 'dark') } catch (e) {}
  }

  /* JPROT variant cycle — cycles through theme variants (default → minimal → creative → corporate) */
  var VARIANTS = ${JSON.stringify(ids)}
  var VKEY = 'jprot-variant'
  try {
    var sv = localStorage.getItem(VKEY)
    if (sv && sv !== 'default') root.setAttribute('data-variant', sv)
  } catch (e) {}
  window.jprotCycleVariant = function () {
    var cur = root.getAttribute('data-variant') || 'default'
    var idx = VARIANTS.indexOf(cur)
    var next = VARIANTS[(idx + 1) % VARIANTS.length]
    if (next === 'default') root.removeAttribute('data-variant')
    else root.setAttribute('data-variant', next)
    try { localStorage.setItem(VKEY, next) } catch (e) {}
  }

  // Event delegation for data-action buttons (keeps strict CSP: no inline JS).
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-action]')
    if (btn) {
      var action = btn.getAttribute('data-action')
      if (action === 'toggle-theme') window.jprotToggleTheme()
      else if (action === 'cycle-variant') window.jprotCycleVariant()
      else if (action === 'search') window.jprotSearch && window.jprotSearch()
      else if (action === 'print') window.print()
      else if (action === 'toggle-nav') {
        var hdr = document.querySelector('.site-header')
        if (hdr) hdr.classList.toggle('nav-open')
        btn.setAttribute('aria-expanded', hdr ? hdr.classList.contains('nav-open') : 'false')
      }
      else if (action === 'copy-code') {
        var code = btn.parentElement && btn.parentElement.querySelector('code')
        if (code && navigator.clipboard) {
          navigator.clipboard.writeText(code.textContent).then(function () {
            var old = btn.textContent
            btn.textContent = 'Copied'
            setTimeout(function () { btn.textContent = old }, 1200)
          })
        }
      }
      return
    }
    // theme picker swatches
    var sw = e.target.closest && e.target.closest('.tp-swatch')
    if (sw) {
      var id = sw.getAttribute('data-variant')
      var picker = sw.closest('.theme-picker')
      if (picker) picker.querySelectorAll('.tp-swatch').forEach(function (b) { b.classList.remove('active') })
      sw.classList.add('active')
      if (id === 'default') root.removeAttribute('data-variant')
      else root.setAttribute('data-variant', id)
      try { localStorage.setItem(VKEY, id) } catch (e2) {}
    }
  })

  // Mobile menu: close after picking a link, clicking outside, or hitting Escape.
  function closeNav() {
    var hdr = document.querySelector('.site-header')
    if (!hdr) return
    hdr.classList.remove('nav-open')
    var t = hdr.querySelector('.nav-toggle')
    if (t) t.setAttribute('aria-expanded', 'false')
  }
  document.addEventListener('click', function (e) {
    if (!e.target) return
    var inHeader = e.target.closest && e.target.closest('.site-header')
    if (inHeader) {
      if (e.target.closest && e.target.closest('.site-nav a')) closeNav()
      return
    }
    closeNav()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav()
  })

  // hydrate the theme picker's active swatch on load
  function hydratePicker() {
    var picker = document.querySelector('.theme-picker')
    if (!picker) return
    var saved = null
    try { saved = localStorage.getItem(VKEY) } catch (e) {}
    if (saved && saved !== 'default') {
      picker.querySelectorAll('.tp-swatch').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-variant') === saved)
      })
    } else {
      picker.querySelectorAll('.tp-swatch').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-variant') === 'default')
      })
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydratePicker)
  else hydratePicker()
})()
</script>
 `;
};
