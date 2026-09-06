const SEARCH_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>`

const BURGER_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`

export default function Header(props) {
  const { page, nav, site } = props
  const items = (nav || []).map((item) => {
    const rel = String(item.url || '')
    const href = rel.startsWith('/') || rel === '' ? rel || '/' : '/' + rel
    const active = page && page.path === item.path ? ' class="active"' : ''
    return `<a href="${href}"${active} class="nav-link">${item.label}</a>`
  }).join('\n      ')

  const sidebarToggle = site.sidebar !== false
    ? `<button class="sidebar-toggle" aria-label="Toggle sidebar" title="Toggle sidebar">☰</button>`
    : ''

  const hasNav = site.showNav !== false && items.length > 0
  const navHtml = hasNav
    ? `<nav class="site-nav" id="site-nav">${items}</nav>`
    : ''
  // Hamburger only needed when there are links; hidden on desktop via CSS.
  const navToggle = hasNav
    ? `<button class="nav-toggle" data-action="toggle-nav" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav" title="Menu">${BURGER_ICON}</button>`
    : ''

  const variantCycle = site.themePicker !== false ? `
        <button class="variant-cycle" data-action="cycle-variant" aria-label="Cycle theme variant" title="Cycle theme">◈</button>` : ''

  return `
    <header class="site-header">
      <a class="brand" href="/">${site.title || 'JPROT'}</a>
      ${navHtml}
      <div class="header-actions">
        ${navToggle}
        ${sidebarToggle}
        <button class="search-toggle" data-action="search" aria-label="Search" title="Search">${SEARCH_ICON}</button>
        ${variantCycle}
        <button class="theme-toggle" data-action="toggle-theme" aria-label="Toggle theme" title="Toggle theme">◐</button>
      </div>
    </header>
  `
}