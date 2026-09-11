import { esc } from '../../../core/utils.js'

export default function Stats({ items = [] }) {
  const cells = (items || []).map((it) => {
    const value = typeof it === 'object' ? it.value : it
    const label = typeof it === 'object' ? it.label : ''
    return `
      <div class="stat">
        <span class="stat-value">${esc(value)}</span>
        ${label ? `<span class="stat-label">${esc(label)}</span>` : ''}
      </div>`
  }).join('')

  if (!cells) return ''
  return `
    <section class="stats-strip">
      ${cells}
    </section>
  `
}
