import { esc, safeHref } from '../../../core/utils.js'

export default function Sidebar(props) {
  const { site, page, nav, docsNav } = props
  // The server already decides *whether* to render the sidebar (core/server.js
  // applies the site-wide, per-page and layout rules). This guard used to be
  // `if (!site.sidebar) return ''`, which silently discarded a sidebar that the
  // server had decided to show because a single page had `sidebar: true` — a
  // per-page opt-in that could therefore never work. An explicit
  // `sidebar: false` still opts out, so the component can also be used
  // standalone from a section.
  if (site.sidebar === false) return ''
  const L = site.labels || {}
  // Docs mode prefers the full content reading order; otherwise fall back to
  // the navigation passed in (navbar) so non-docs sites keep previous behavior.
  const list = site.docs && Array.isArray(docsNav) && docsNav.length ? docsNav : (nav || [])
  const current = String((page && page.url) || '/').split('#')[0]
  const home = { label: site.title || L.home || 'Home', url: '/', active: current === '/' }
  const links = [home, ...list].map((n) => {
    const href = String(n.url || '')
    const path = /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(href) ? href || '/' : '/' + href
    // nav entries come from `site.nav` / page frontmatter, so the scheme has to
    // be vetted: escaping alone stops the quote breakout but still lets a
    // script scheme through into the href.
    const safe = safeHref(path)
    const isExternal = /^(?:[a-z][a-z\d+.-]*:|#)/i.test(href)
    const target = path.replace(/\/+$/, '') || '/'
    const active = !isExternal && current.length > 1 && (current === target || current + '/' === path)
    return `<a href="${esc(safe)}" class="sb-link${active ? ' active' : ''}">${esc(n.label || n.text)}</a>`
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
