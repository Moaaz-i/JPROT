/* =========================================================
   Example component: Footer.js (replaces the default footer)
   Copy this file to  theme/components/Footer.js
   ========================================================= */

export default function Footer({ site }) {
  const year = new Date().getFullYear()
  const socials = Array.isArray(site.social)
    ? site.social.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>`).join(' · ')
    : ''
  return `
    <footer class="site-footer">
      ${socials ? `<div class="footer-social">${socials}</div>` : ''}
      <p>© ${year} ${site.title || 'Your Name'} · Built with JPROT</p>
    </footer>
  `
}