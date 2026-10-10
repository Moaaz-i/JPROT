import { esc, safeHref } from '../../../lib/utils.js'

export default function Gallery({ title = 'Gallery', subtitle = '', items = [] }) {
  const tiles = (items || []).map((it) => {
    const raw = typeof it === 'string' ? it : it.src
    const alt = typeof it === 'string' ? '' : it.alt || it.caption || ''
    // An <img> src may be an inline data: image; the lightbox link may not.
    const src = esc(safeHref(raw, { image: true }))
    const href = esc(safeHref(raw))
    return `<a class="gallery-item" href="${href}"><img src="${src}" alt="${esc(alt)}" loading="lazy"></a>`
  }).join('')

  return `
    <section class="section section-gallery">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="gallery-grid">${tiles}</div>
    </section>
  `
}
