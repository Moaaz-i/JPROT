const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function Skills({ title = 'Skills', subtitle = '', items = [] }) {
  const rows = (items || []).map((it) => {
    const name = typeof it === 'string' ? it : it.name
    const level = typeof it === 'string' ? 80 : Number(it.level) || 80
    return `
      <div class="skill">
        <div class="skill-head"><span class="skill-name">${esc(name)}</span><span class="skill-level">${level}%</span></div>
        <div class="skill-track"><div class="skill-fill" style="width:${Math.max(0, Math.min(100, level))}%"></div></div>
      </div>`
  }).join('')

  return `
    <section class="section section-skills">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="skills-grid">${rows}</div>
    </section>
  `
}