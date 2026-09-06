const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function Sidebar(props) {
  const { site, page, nav } = props
  if (!site.sidebar) return ''
  const L = site.labels || {}
  const home = { label: site.title || L.home || 'Home', url: '/', active: page.url === '/' }
  const links = [home, ...(nav || [])].map((n) => {
    const href = String(n.url || '')
    const path = href.startsWith('/') ? href : '/' + href
    const active = page && page.path && n.path === page.path
      ? true
      : path !== '/' && page && page.path && page.path.endsWith(path.slice(1))
    return `<a href="${path}" class="sb-link${active ? ' active' : ''}">${esc(n.label || n.text)}</a>`
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