const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function Gallery({ title = 'Gallery', subtitle = '', items = [] }) {
  const tiles = (items || []).map((it) => {
    const src = typeof it === 'string' ? it : it.src
    const alt = typeof it === 'string' ? '' : it.alt || it.caption || ''
    return `<a class="gallery-item" href="${esc(src)}"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy"></a>`
  }).join('')

  return `
    <section class="section section-gallery">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="gallery-grid">${tiles}</div>
    </section>
  `
}