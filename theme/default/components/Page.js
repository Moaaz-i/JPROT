import { esc } from '../../../core/utils.js'

function safeHref(url) {
  const s = String(url || '')
  if (!s || /^(?:javascript:|vbscript:|data:)/i.test(s)) return '#'
  return s
}

export default function Page(props) {
  const { page, content, sectionsHtml, site, nav, docsNav: docsNavList } = props
  const docs = site?.docs === true
  const pagePath = String(page.url || '/')
  const pageHref = (u) => {
    const s = String(u || '')
    const href = /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(s) ? s || '/' : '/' + s
    return safeHref(href)
  }
  // Prev/next walk a reading order of real pages: the full docs nav when
  // available, otherwise the passed nav — always excluding external links and
  // the homepage so the chain never leaves the site or points at a hole.
  const list = docs && Array.isArray(docsNavList) && docsNavList.length ? docsNavList : (nav || [])
  const pageLinks = (list || []).filter((item) =>
    item && item.url && item.url !== '/' && !/^(?:[a-z][a-z\d+.-]*:|#)/i.test(String(item.url || ''))
  )
  const currentIndex = pageLinks.findIndex((item) => pageHref(item.url) === pagePath)
  const previous = currentIndex > 0 ? pageLinks[currentIndex - 1] : null
  const next = currentIndex >= 0 && currentIndex < pageLinks.length - 1 ? pageLinks[currentIndex + 1] : null
  const link = (item) => {
    return `<a href="${pageHref(item.url)}">${esc(item.label)}</a>`
  }
  const docsNav = docs ? `
      <nav class="docs-breadcrumbs" aria-label="Breadcrumb">
        <a href="/">${esc(site.title || 'Home')}</a><span aria-hidden="true">/</span><span>${esc(page.data.title || '')}</span>
      </nav>` : ''
  const docsFooter = docs && (previous || next) ? `
      <nav class="docs-pagination" aria-label="Page navigation">
        ${previous ? `<a class="docs-prev" href="${pageHref(previous.url)}"><small>Previous</small><strong>← ${esc(previous.label)}</strong></a>` : '<span></span>'}
        ${next ? `<a class="docs-next" href="${pageHref(next.url)}"><small>Next</small><strong>${esc(next.label)} →</strong></a>` : '<span></span>'}
      </nav>` : ''
  return `
    <article class="content-page">
      ${docsNav}
      <header class="page-header">
        <h1 class="page-title">${esc(page.data.title || '')}</h1>
        ${page.data.subtitle ? `<p class="page-subtitle">${esc(page.data.subtitle)}</p>` : ''}
      </header>
      <div class="page-content">
        ${content}
      </div>
      ${sectionsHtml || ''}
      ${docsFooter}
    </article>
  `
}
