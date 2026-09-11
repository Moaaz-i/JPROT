import { esc } from '../../../core/utils.js'

export default function Footer(props) {
  const { site } = props
  return `
    <footer class="site-footer">
      <p>${esc(site.footerText || '© ' + new Date().getFullYear() + ' ' + (site.title || 'JPROT'))}</p>
    </footer>
  `
}
