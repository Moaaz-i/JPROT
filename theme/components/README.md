# components/ — Your custom overrides

Any `ComponentName.js` you place here **overrides** the built-in component with the same name.

Built-in components you can replace: `Layout`, `Header`, `Footer`, `Home`, `Page`.

Example of replacing `Header.js`:

```js
export default function Header({ site, nav }) {
  return `
    <header>
      <a href="/" class="brand">${site.title}</a>
      <nav>${nav.map(n => `<a href="/${n.url}">${n.label}</a>`).join('')}</nav>
    </header>
  `
}
```

Each component receives `props` and returns HTML as a string. Common props:

| Prop | Description |
|---|---|
| `site` | The whole `jprot.config.js` object |
| `page` | Current page: `data`, `body`, `slug`, `url` |
| `nav` | Navigation array: `[{ label, url, order }]` |
| `content` | Rendered HTML of the current page body |
| `projects` | Projects list (homepage) |
| `posts` | Blog posts list (`blog` layout) |
| `sectionsHtml` | Already-rendered section markup |
| `children` | Inner Markdown of a `:::Name … :::` shortcode (nested) |

The deeper guide lives in the project docs — see the repository
[Customization](../content/customization.md) page. Ready-made component examples
live in `examples/components/`.