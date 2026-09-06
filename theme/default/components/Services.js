const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function Services({ title = 'Services', subtitle = '', items = [] }) {
  let i = 0
  const cards = (items || []).map((it) => {
    const icon = it.icon
    const iconHtml = icon ? `<span class="service-icon">${esc(icon)}</span>`
      : `<span class="service-icon">${String(++i).padStart(2, '0')}</span>`
    return `
      <div class="service-card">
        ${iconHtml}
        <h3 class="service-title">${esc(it.title || '')}</h3>
        ${it.description ? `<p class="service-desc">${esc(it.description)}</p>` : ''}
        ${it.link ? `<a class="service-link" href="${esc(it.link)}">Learn more →</a>` : ''}
      </div>`
  }).join('')

  return `
    <section class="section section-services">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="services-grid">${cards}</div>
    </section>
  `
}