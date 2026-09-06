const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function CTA({ title = '', text = '', label = 'Get in touch', url = '/contact' }) {
  return `
    <section class="section section-cta">
      ${title ? `<h2 class="section-title">${esc(title)}</h2>` : ''}
      ${text ? `<p class="cta-text">${esc(text)}</p>` : ''}
      ${url ? `<a class="btn btn-cta" href="${esc(url)}">${esc(label)}</a>` : ''}
    </section>
  `
}