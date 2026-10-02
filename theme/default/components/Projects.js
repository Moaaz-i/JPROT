import { esc, safeHref } from '../../../core/utils.js'

export default function Projects({ title = null, subtitle = '', projects = [], site }) {
  const L = site.labels || {}
  const heading = title || site.projectsTitle || L.projects || 'Projects'
  if (!projects.length) return ''

  const cards = projects.map((p) => {
    const tags = Array.isArray(p.data.tags)
      ? p.data.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')
      : ''
    // `p.body` is the raw Markdown source, not rendered HTML, so the fallback
    // excerpt must be escaped like any other author-controlled string.
    const desc = p.data.excerpt || p.data.description || p.body.split('\n').slice(0, 3).join(' ')
    const url = `/${p.url}`
    return `
      <article class="project-card">
        ${p.data.cover ? `<div class="project-cover"><img src="${esc(safeHref(p.data.cover, { image: true }))}" alt="${esc(p.data.title || '')}" loading="lazy"></div>` : ''}
        <div class="project-body">
          <h3 class="project-title"><a href="${esc(url)}">${esc(p.data.title || p.path)}</a></h3>
          ${p.data.date ? `<time class="project-date">${esc(p.data.date)}</time>` : ''}
          <p class="project-desc">${esc(desc)}</p>
          <div class="project-tags">${tags}</div>
          <div class="project-links">
            ${p.data.demo ? `<a class="btn btn-sm" href="${esc(safeHref(p.data.demo))}" target="_blank" rel="noopener">${esc(L.liveDemo || 'Live demo')}</a>` : ''}
            ${p.data.repo ? `<a class="btn btn-sm btn-outline" href="${esc(safeHref(p.data.repo))}" target="_blank" rel="noopener">${esc(L.source || 'Source')}</a>` : ''}
            <a class="btn btn-sm btn-outline" href="${esc(url)}">${esc(L.details || 'Details')}</a>
          </div>
        </div>
      </article>
    `
  }).join('\n      ')

  return `
    <section class="projects-section">
      <h2 class="section-title">${esc(heading)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="projects-grid">${cards}</div>
    </section>
  `
}
