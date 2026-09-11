import { esc } from '../../../core/utils.js'

export default function Clients({ title = 'Clients', subtitle = '', items = [] }) {
  const tiles = (items || []).map((it) => {
    const name = it.name || it
    const mark = it.logo
      ? `<img class="client-logo" src="${esc(it.logo)}" alt="${esc(name)}" loading="lazy">`
      : `<span class="client-mark">${esc(String(name).slice(0, 2).toUpperCase())}</span>`
    const inner = `<div class="client-tile">${mark}</div>`
    return it.url
      ? `<a class="client-link" href="${esc(it.url)}" target="_blank" rel="noopener">${inner}</a>`
      : inner
  }).join('')

  return `
    <section class="section section-clients">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="clients-grid">${tiles}</div>
    </section>
  `
}
