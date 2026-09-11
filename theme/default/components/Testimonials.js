import { esc } from '../../../core/utils.js'

export default function Testimonials({ title = 'Testimonials', subtitle = '', items = [] }) {
  const cards = (items || []).map((it) => `
    <figure class="quote">
      <blockquote>${esc(it.text || it.quote || '')}</blockquote>
      <figcaption class="quote-attribution">
        <strong>${esc(it.name || it.author || '')}</strong>
        ${it.role ? `<span>${esc(it.role)}</span>` : ''}
      </figcaption>
    </figure>`).join('')

  return `
    <section class="section section-testimonials">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="quotes-grid">${cards}</div>
    </section>
  `
}
