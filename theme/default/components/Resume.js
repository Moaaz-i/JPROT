const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function Resume(props) {
  const { site, page, content, posts } = props
  const d = page.data || {}
  const L = site.labels || {}
  const name = d.name || site.title || ''
  const role = d.role || site.tagline || ''
  const contactRows = [
    d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : '',
    d.phone ? esc(d.phone) : '',
    d.location ? esc(d.location) : '',
    ...(Array.isArray(d.social) ? d.social.map((s) => `<a href="${esc(s.url)}">${esc(s.label)}</a>`) : []),
  ].filter(Boolean).join(' · ')

  const blocks = (name, items) => (Array.isArray(items) && items.length
    ? `<section class="rv-block"><h2>${esc(name)}</h2>${items.map((it) => `
      <div class="rv-item">
        <div class="rv-head"><strong>${esc(it.title || it.role || it.degree || it.name || '')}</strong>
          <span class="rv-right">${esc(it.company || it.school || it.org || '')} ${it.period ? ' · ' + esc(it.period) : ''}</span></div>
        ${it.description ? `<p class="rv-desc">${esc(it.description)}</p>` : ''}
      </div>`).join('')}</section>`
    : '')

  return `
    <div class="resume">
      <header class="rv-header">
        <h1 class="rv-name">${esc(name)}</h1>
        ${role ? `<p class="rv-role">${esc(role)}</p>` : ''}
        <p class="rv-contact">${contactRows}</p>
        <button class="btn btn-sm rv-print" data-action="print">${esc(L.printResume || 'Download / Print')}</button>
      </header>
      ${content}
      ${blocks(L.resumeExperience || 'Experience', d.experience)}
      ${blocks(L.resumeEducation || 'Education', d.education)}
      ${blocks(L.resumeSkills || 'Skills', d.skills)}
    </div>
  `
}