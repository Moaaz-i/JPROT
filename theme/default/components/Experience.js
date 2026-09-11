import { esc } from '../../../core/utils.js'

export default function Experience({ title = 'Experience', subtitle = '', items = [] }) {
  const rows = (items || []).map((it) => `
    <div class="exp-item">
      <div class="exp-head">
        <span class="exp-title">${esc(it.title || it.role || '')}</span>
        ${it.period ? `<span class="exp-period">${esc(it.period)}</span>` : ''}
      </div>
      ${it.company ? `<div class="exp-company">${esc(it.company)}</div>` : ''}
      ${it.description ? `<p class="exp-desc">${esc(it.description)}</p>` : ''}
    </div>`).join('')

  return `
    <section class="section section-experience">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="exp-list">${rows}</div>
    </section>
  `
}
