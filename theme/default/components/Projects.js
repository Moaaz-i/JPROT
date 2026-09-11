import { esc } from '../../../core/utils.js'

export default function Projects({ title = null, subtitle = '', projects = [], site }) {
  const L = site.labels || {}
  const heading = title || site.projectsTitle || L.projects || 'Projects'
  if (!projects.length) return ''

  const cards = projects.map((p) => {
    const tags = Array.isArray(p.data.tags)
      ? p.data.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')
      : ''
    const desc = p.data.excerpt || p.data.description || p.body.split('\n').slice(0, 3).join(' ')
    return `
      <article class="project-card">
        ${p.data.cover ? `<div class="project-cover"><img src="${esc(p.data.cover)}" alt="${esc(p.data.title || '')}" loading="lazy"></div>` : ''}
        <div class="project-body">
          <h3 class="project-title"><a href="/${p.url}">${esc(p.data.title || p.path)}</a></h3>
          ${p.data.date ? `<time class="project-date">${p.data.date}</time>` : ''}
          <p class="project-desc">${desc}</p>
          <div class="project-tags">${tags}</div>
          <div class="project-links">
            ${p.data.demo ? `<a class="btn btn-sm" href="${esc(p.data.demo)}" target="_blank" rel="noopener">${esc(L.liveDemo || 'Live demo')}</a>` : ''}
            ${p.data.repo ? `<a class="btn btn-sm btn-outline" href="${esc(p.data.repo)}" target="_blank" rel="noopener">${esc(L.source || 'Source')}</a>` : ''}
            <a class="btn btn-sm btn-outline" href="/${p.url}">${esc(L.details || 'Details')}</a>
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
