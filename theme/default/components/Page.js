export default function Page(props) {
  const { page, content, sectionsHtml } = props
  return `
    <article class="content-page">
      <header class="page-header">
        <h1 class="page-title">${page.data.title || ''}</h1>
        ${page.data.subtitle ? `<p class="page-subtitle">${page.data.subtitle}</p>` : ''}
      </header>
      <div class="page-content">
        ${content}
      </div>
      ${sectionsHtml || ''}
    </article>
  `
}
