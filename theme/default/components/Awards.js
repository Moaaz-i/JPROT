import { esc } from '../../../core/utils.js'

export default function Awards({ title = 'Awards', subtitle = '', items = [] }) {
  const rows = (items || []).map((it) => `
    <div class="award-item">
      <span class="award-year">${esc(it.year || '')}</span>
      <div class="award-body">
        <h3 class="award-title">${esc(it.title || it.name || '')}</h3>
        <p class="award-meta">${esc(it.org || it.organization || '')}${it.place ? ' · ' + esc(it.place) : ''}</p>
        ${it.description ? `<p class="award-desc">${esc(it.description)}</p>` : ''}
      </div>
    </div>`).join('') || '<p class="muted">Nothing yet.</p>'

  return `
    <section class="section section-awards">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="awards-list">${rows}</div>
    </section>
  `
}
