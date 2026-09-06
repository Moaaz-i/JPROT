/* =========================================================
   Example component: Header.js (replaces the default header)
   Copy this file to  theme/components/Header.js
   ========================================================= */

export default function Header({ site, nav }) {
  const links = (nav || []).map((item) => {
    const rel = String(item.url || '')
    const href = rel.startsWith('/') || rel === '' ? rel || '/' : '/' + rel
    return `<a href="${href}" class="nav-link">${item.label}</a>`
  }).join('')
  return `
    <header class="site-header">
      <a class="brand" href="/">${site.title || 'JPROT'}</a>
      <nav class="site-nav">
        ${links}
        <a href="https://github.com" class="nav-link" target="_blank" rel="noopener">GitHub</a>
      </nav>
    </header>
  `
}