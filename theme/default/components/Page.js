export default function Page(props) {
  const { page, content, sectionsHtml, site, nav } = props
  const docs = site?.docs === true
  const pagePath = String(page.url || '/')
  const pageLinks = (nav || []).filter((item) => item.url && item.url !== '/')
  const currentIndex = pageLinks.findIndex((item) => '/' + String(item.url).replace(/^\/+/, '') === pagePath)
  const previous = currentIndex > 0 ? pageLinks[currentIndex - 1] : null
  const next = currentIndex >= 0 && currentIndex < pageLinks.length - 1 ? pageLinks[currentIndex + 1] : null
  const link = (item) => {
    const href = String(item.url || '').startsWith('/') ? item.url : '/' + item.url
    return `<a href="${href}">${item.label}</a>`
  }
  const docsNav = docs ? `
      <nav class="docs-breadcrumbs" aria-label="Breadcrumb">
        <a href="/">${site.title || 'Home'}</a><span aria-hidden="true">/</span><span>${page.data.title || ''}</span>
      </nav>` : ''
  const docsFooter = docs && (previous || next) ? `
      <nav class="docs-pagination" aria-label="Page navigation">
        ${previous ? `<a class="docs-prev" href="${String(previous.url).startsWith('/') ? previous.url : '/' + previous.url}"><small>Previous</small><strong>← ${previous.label}</strong></a>` : '<span></span>'}
        ${next ? `<a class="docs-next" href="${String(next.url).startsWith('/') ? next.url : '/' + next.url}"><small>Next</small><strong>${next.label} →</strong></a>` : '<span></span>'}
      </nav>` : ''
  return `
    <article class="content-page">
      ${docsNav}
      <header class="page-header">
        <h1 class="page-title">${page.data.title || ''}</h1>
        ${page.data.subtitle ? `<p class="page-subtitle">${page.data.subtitle}</p>` : ''}
      </header>
      <div class="page-content">
        ${content}
      </div>
      ${sectionsHtml || ''}
      ${docsFooter}
    </article>
  `
}
