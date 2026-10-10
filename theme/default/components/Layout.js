import { esc } from '../../../lib/utils.js'

export default function Layout(props) {
  const { content, header, footer, sidebar, site } = props
  const cls = sidebar ? 'site-main with-sidebar' : 'site-main'
  const body = sidebar
    ? `<div class="sidebar-layout"><aside class="sidebar-col">${sidebar}</aside><div class="main-col">${content}</div></div>`
    : content
  return `
    <a class="skip-link" href="#jprot-main">Skip to content</a>
    <p class="sr-only" id="jprot-announce" role="status"></p>
    <div class="app" data-lang="${esc(site.lang || 'en')}" dir="${esc(site.dir || 'ltr')}">
      ${header}
      <main id="jprot-main" tabindex="-1" class="${cls}">${body}</main>
      ${footer}
    </div>
  `
}
