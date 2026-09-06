const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

const THEMES = [
  { id: 'default', label: 'Default', swatch: '#4f46e5' },
  { id: 'minimal', label: 'Minimal', swatch: '#111111' },
  { id: 'creative', label: 'Creative', swatch: '#d946ef' },
  { id: 'corporate', label: 'Corporate', swatch: '#0369a1' },
]

export default function ThemePicker(props) {
  const { site } = props
  const themes = Array.isArray(site.themes) ? site.themes : THEMES

  const swatches = themes.map((t) => {
    const color = t.swatch || t.color || '#4f46e5'
    return `<button type="button" class="tp-swatch" data-variant="${esc(t.id)}" title="${esc(t.label || t.id)}" style="--swatch-bg:${esc(color)}" aria-label="Theme: ${esc(t.label || t.id)}"></button>`
  }).join('')

  return `
    <div class="theme-picker" role="radiogroup" aria-label="Choose theme">
      ${swatches}
    </div>
  `
}
