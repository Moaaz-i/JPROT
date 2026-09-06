export default async function HomePage(props) {
  const { site, page, content, projects, sectionsHtml } = props
  const hero = page.data.hero || site.hero || {}
  const title = hero.title || page.data.title || site.title || 'Hello'
  const subtitle = hero.subtitle || page.data.subtitle || site.tagline || ''
  const avatar = hero.avatar || site.avatar || ''
  const L = site.labels || {}

  const avatarHtml = avatar
    ? `<div class="hero-avatar"><img src="${avatar}" alt=""></div>`
    : ''

  const projectCards = (projects || []).map((p) => {
    const tags = Array.isArray(p.data.tags)
      ? p.data.tags.map((t) => `<span class="tag" data-tag="${esc(t)}">${t}</span>`).join('')
      : ''
    const tagAttrs = Array.isArray(p.data.tags) ? p.data.tags.map((t) => `tag-${esc(t)}`).join(' ') : ''
    const desc = p.data.excerpt || p.data.description || p.body.split('\n').slice(0, 3).join(' ')
    return `
      <article class="project-card" data-tags="${tagAttrs}">
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

  const filterBar = (projects || []).length > 1
    ? buildFilterBar(projects, L)
    : ''

  return `
    <section class="hero">
      ${avatarHtml}
      <h1 class="hero-title">${title}</h1>
      ${subtitle ? `<p class="hero-subtitle">${subtitle}</p>` : ''}
      ${Array.isArray(hero.links) && hero.links.length
        ? `<div class="hero-links">${hero.links.map((l) => `<a href="${l.url}" class="btn">${l.label}</a>`).join('')}</div>`
        : ''}
    </section>
    ${content}
    ${projectCards ? `
      <section class="projects-section">
        <h2 class="section-title">${site.projectsTitle || L.projects || 'Projects'}</h2>
        ${filterBar}
        <div class="projects-grid">${projectCards}</div>
      </section>
    ` : ''}
    ${sectionsHtml}
  `
}

function buildFilterBar(projects, L) {
  const tags = []
  for (const p of projects) {
    for (const t of (p.data.tags || [])) {
      if (!tags.includes(t)) tags.push(t)
    }
  }
  const btns = (tags.length ? ['*', ...tags] : []).map((t) => {
    const key = esc(t)
    const label = t === '*' ? (L.all || 'All') : t
    const active = t === '*' ? ' class="filter-btn active"' : ' class="filter-btn"'
    return `<button type="button" data-filter="${key}"${active}>${label}</button>`
  }).join('')
  return `
    <div class="project-filters">
      ${btns}
    </div>
  `
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))