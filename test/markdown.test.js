import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMarkdown } from '../lib/markdown.js'

const md = createMarkdown()

test('renders headings and collects toc entries', () => {
  const headings = []
  const html = md.render('# Title\n\n## Sub\n\nparagraph', headings)
  assert.match(html, /<h1 id="title">Title<\/h1>/)
  assert.match(html, /<h2 id="sub">Sub<\/h2>/)
  assert.match(html, /<p>paragraph<\/p>/)
  assert.ok(headings.some((h) => h.text === 'Title' && h.level === 1))
  assert.ok(headings.some((h) => h.text === 'Sub' && h.level === 2))
})

test('inline code is HTML-escaped (XSS guard)', () => {
  const html = md.render('Use `alert("<b>")` inline')
  assert.match(html, /<code>alert\(&quot;&lt;b&gt;&quot;\)<\/code>/)
})

test('inline code content is not parsed as bold/emphasis', () => {
  const html = md.render('Keep `**literal**` as-is')
  assert.match(html, /<code>\*\*literal\*\*<\/code>/)
})

test('fenced code block is escaped', () => {
  const html = md.render('```js\nconst x = "<tag>"\n```')
  assert.match(html, /<pre class="code-block"><button[^>]+>Copy<\/button><code class="language-js">const x = &quot;&lt;tag&gt;&quot;<\/code><\/pre>/)
})

test('indented fenced code renders as code (matches buffer logic)', () => {
  const html = md.render('- item\n\n    ```js\n    const y = 1\n    ```\n')
  assert.match(html, /<pre class="code-block">/)
  assert.match(html, /language-js/)
})

test('code blocks have copy controls and callouts render by severity', () => {
  const html = md.render('```js\nconst x = 1\n```\n\n> [!WARNING] Be careful')
  assert.match(html, /data-action="copy-code"/)
  assert.match(html, /callout callout-warning/)
  assert.match(html, /<strong>Warning<\/strong>/)
})

test('links and images render', () => {
  const html = md.render('[link](https://x.dev) ![alt](img.png)')
  assert.match(html, /<a href="https:\/\/x\.dev">link<\/a>/)
  assert.match(html, /<img src="img\.png" alt="alt">/)
})

test('unsafe URL schemes are neutralized', () => {
  const html = md.render('[bad](javascript:alert(1)) ![bad](data:text/html,alert(1))')
  assert.match(html, /href="#"/)
  assert.match(html, /src="#"/)
  assert.doesNotMatch(html, /javascript:|data:text\/html/)
})

test('internal .md links are canonicalized to clean URLs', () => {
  const html = md.render(
    '[a](quick-start.md) [b](../customization.md) [c](blog/index.md) [d](./index.md) [e](https://x.dev) [f](#top) ![g](img.png)'
  )
  assert.match(html, /<a href="quick-start">a<\/a>/)
  assert.match(html, /<a href="\.\.\/customization">b<\/a>/)
  assert.match(html, /<a href="blog\/">c<\/a>/)
  assert.match(html, /<a href="\.\/">d<\/a>/)
  assert.match(html, /<a href="https:\/\/x\.dev">e<\/a>/)
  assert.match(html, /<a href="#top">f<\/a>/)
  assert.match(html, /<img src="img\.png" alt="g">/)
  assert.doesNotMatch(html, /\.md/)
  const withAnchor = md.render('[x](guide.md#install)')
  assert.match(withAnchor, /<a href="guide#install">x<\/a>/)
})

test('unordered and ordered lists', () => {
  const ul = md.render('- a\n- b')
  assert.match(ul, /<li>a<\/li>\s*<li>b<\/li>/)
  const ol = md.render('1. one\n2. two')
  assert.match(ol, /<li>one<\/li>\s*<li>two<\/li>/)
})

test('tables render', () => {
  const html = md.render('| A | B |\n|---|---|\n| 1 | 2 |')
  assert.match(html, /<table>/)
  assert.match(html, /<th>A<\/th>/)
  assert.match(html, /<td>1<\/td>/)
})
