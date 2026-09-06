const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function Sidebar(props) {
  const { site, page, nav, docsNav } = props
  if (!site.sidebar) return ''
  const L = site.labels || {}
  // Docs mode prefers the full content reading order; otherwise fall back to
  // the navigation passed in (navbar) so non-docs sites keep previous behavior.
  const list = site.docs && Array.isArray(docsNav) && docsNav.length ? docsNav : (nav || [])
  const current = String((page && page.url) || '/').split('#')[0]
  const home = { label: site.title || L.home || 'Home', url: '/', active: current === '/' }
  const links = [home, ...list].map((n) => {
    const href = String(n.url || '')
    const path = /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href) ? href || '/' : '/' + href
    const isExternal = /^(?:[a-z][a-z\d+.-]*:|#)/i.test(href)
    const target = path.replace(/\/+$/, '') || '/'
    const active = !isExternal && current.length > 1 && (current === target || current + '/' === path)
    return `<a href="${esc(path)}" class="sb-link${active ? ' active' : ''}">${esc(n.label || n.text)}</a>`
  }).join('')

  const headings = (page.headings || []).filter((h) => h.level >= 2 && h.level <= 3)
  const onpage = headings.length
    ? headings.map((h) => `<a href="#${esc(h.id)}" class="sb-anchor${h.level === 3 ? ' sb-anchor-3' : ''}">${esc(h.text)}</a>`).join('')
    : ''

  return `
    <aside class="site-sidebar" id="sidebar">
      <nav class="sb-links">
        ${links}
      </nav>
      ${onpage ? `<div class="sb-onpage"><h4>${esc(L.onThisPage || 'On this page')}</h4>${onpage}</div>` : ''}
    </aside>
  `
}