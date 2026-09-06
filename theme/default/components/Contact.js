const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export default async function Contact(props) {
  const { site, page } = props
  const d = page ? page.data : {}
  const L = site.labels || {}
  const action = d.formspree || d.form || site.formspree || ''
  const email = d.email || site.email || ''
  const title = d.title || L.contactTitle || 'Get in touch'
  const subtitle = d.subtitle || L.contactSubtitle || ''

  const formHtml = action
    ? `<form class="contact-form" action="${esc(action)}" method="POST" target="_blank">
        <div class="form-row">
          <label for="cf-name">${esc(L.name || 'Name')}</label>
          <input id="cf-name" name="name" type="text" required placeholder="${esc(L.namePlaceholder || 'Your name')}">
        </div>
        <div class="form-row">
          <label for="cf-email">${esc(L.email || 'Email')}</label>
          <input id="cf-email" name="email" type="email" required placeholder="${esc(L.emailPlaceholder || 'you@example.com')}">
        </div>
        <div class="form-row">
          <label for="cf-message">${esc(L.message || 'Message')}</label>
          <textarea id="cf-message" name="message" rows="5" required placeholder="${esc(L.messagePlaceholder || 'How can I help you?')}"></textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">${esc(L.sendMessage || 'Send message')}</button>
        </div>
      </form>
      <div class="contact-success" style="display:none">
        <p>${esc(L.sentSuccess || 'Message sent! I\'ll get back to you soon.')}</p>
      </div>`
    : email
      ? `<div class="contact-row">
          <a class="contact-email" href="mailto:${esc(email)}">${esc(email)}</a>
        </div>`
      : ''

  return `
    <section class="contact-section section">
      <h2 class="section-title">${esc(title)}</h2>
      ${subtitle ? `<p class="section-subtitle">${esc(subtitle)}</p>` : ''}
      ${formHtml}
    </section>
  `
}
