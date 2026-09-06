export default function Footer(props) {
  const { site } = props
  return `
    <footer class="site-footer">
      <p>${site.footerText || '© ' + new Date().getFullYear() + ' ' + (site.title || 'JPROT')}</p>
    </footer>
  `
}
