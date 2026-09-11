import { esc } from '../../../core/utils.js'

export default function Education({ title = 'Education', subtitle = '', items = [] }) {
  const rows = (items || []).map((it) => `
    <div class="exp-item edu-item">
      <div class="exp-head">
        <span class="exp-title">${esc(it.title || it.degree || '')}</span>
        ${it.period ? `<span class="exp-period">${esc(it.period)}</span>` : ''}
      </div>
      ${it.school || it.institution ? `<div class="exp-company">${esc(it.school || it.institution)}</div>` : ''}
      ${it.description ? `<p class="exp-desc">${esc(it.description)}</p>` : ''}
    </div>`).join('')

  return `
    <section class="section section-education">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="exp-list">${rows}</div>
    </section>
  `
}
