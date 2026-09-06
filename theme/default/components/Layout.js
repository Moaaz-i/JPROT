export default function Layout(props) {
  const { content, header, footer, sidebar, site } = props
  const cls = sidebar ? 'site-main with-sidebar' : 'site-main'
  const body = sidebar
    ? `<div class="sidebar-layout"><aside class="sidebar-col">${sidebar}</aside><div class="main-col">${content}</div></div>`
    : content
  return `
    <div class="app" data-lang="${site.lang || 'en'}" dir="${site.dir || 'ltr'}">
      ${header}
      <main class="${cls}">${body}</main>
      ${footer}
    </div>
  `
}