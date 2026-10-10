import { esc, safeHref } from '../../../lib/utils.js'

export default function CTA({ title = '', text = '', label = 'Get in touch', url = '/contact' }) {
  return `
    <section class="section section-cta">
      ${title ? `<h2 class="section-title">${esc(title)}</h2>` : ''}
      ${text ? `<p class="cta-text">${esc(text)}</p>` : ''}
      ${url ? `<a class="btn btn-cta" href="${esc(safeHref(url))}">${esc(label)}</a>` : ''}
    </section>
  `
}
