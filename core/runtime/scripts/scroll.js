// The client-side JavaScript, as strings.
//
// Nothing here imports anything: these are template strings, and the only
// coupling is the `nonce` argument, which every script must carry to satisfy
// the page CSP. Anything non-trivial enough to deserve its own file should ship
// as a real asset instead — see the customisation docs.

/* ============ Scroll animation script ============ */

export const scrollAnimScript = (nonce) => `
<script nonce="${nonce}">
(function () {
  if (!window.IntersectionObserver) return
  function init() {
    var targets = document.querySelectorAll('[data-animate], [data-stagger]')
    if (!targets.length) return
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) }
      })
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' })
    targets.forEach(function (el) { observer.observe(el) })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
</script>
`;
