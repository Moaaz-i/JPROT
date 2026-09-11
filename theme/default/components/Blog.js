import { esc } from '../../../core/utils.js'

export default function Blog(props) {
  const { page, content, posts = [], site } = props
  const L = site.labels || {}
  const items = (posts || []).map((p) => {
    const tags = Array.isArray(p.data.tags)
      ? p.data.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')
      : ''
    return `
      <article class="post-item">
        <h3 class="post-title"><a href="/${p.url}">${esc(p.data.title || p.slug)}</a></h3>
        ${p.data.date ? `<time class="post-date">${esc(p.data.date)}</time>` : ''}
        <p class="post-excerpt">${esc(p.excerpt)}</p>
        <div class="post-tags">${tags}</div>
      </article>
    `
  }).join('\n      ')

  return `
    <article class="content-page">
      <header class="page-header">
        <h1 class="page-title">${esc(page.data.title || L.blog || 'Blog')}</h1>
        ${page.data.subtitle ? `<p class="page-subtitle">${esc(page.data.subtitle)}</p>` : ''}
      </header>
      <div class="page-content">
        ${content}
        <div class="posts-list">${items || `<p>${esc(L.noPosts || 'No posts yet.')}</p>`}</div>
      </div>
    </article>
  `
}
