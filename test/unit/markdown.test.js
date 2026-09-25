import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMarkdown } from '../../lib/markdown.js'

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

test('consecutive lines join into a single paragraph', () => {
  const html = md.render('line one\nline two\n\nnext para')
  assert.ok(html.indexOf('<p>line one\nline two</p>') !== -1)
  assert.match(html, /<p>next para<\/p>/)
})

test('nested lists render', () => {
  const html = md.render('- a\n  - b\n      - c\n  - d\n- e')
  assert.match(html, /<ul>\s*<li>a<ul>\s*<li>b<ul>\s*<li>c<\/li>\s*<\/ul>\s*<\/li>\s*<li>d<\/li>\s*<\/ul>\s*<\/li>\s*<li>e<\/li>\s*<\/ul>/)
})

test('ordered list nested inside an unordered item', () => {
  const html = md.render('- step\n  1. first\n  2. second\n- tail')
  assert.match(html, /<li>step<ol>\s*<li>first<\/li>\s*<li>second<\/li>\s*<\/ol>\s*<\/li>/)
})

test('list item with a continuation paragraph stays a single item', () => {
  const html = md.render('- first line\n  continued here')
  assert.match(html, /<li>first line continued here<\/li>/)
})

test('loose list (blank line) wraps items in paragraphs', () => {
  const html = md.render('- a\n\n- b')
  assert.match(html, /<li><p>a<\/p>\s*<\/li>\s*<li><p>b<\/p>\s*<\/li>/)
})

test('footnotes render references, backlinks and the notes section', () => {
  const html = md.render('Cats[^1] and dogs[^2][^2].\n\n[^1]: The footnote body.\n[^2]: Second note with **bold**.')
  assert.match(html, /<sup class="footnote-ref" id="fnref-1"><a href="#fn-1">1<\/a><\/sup>/)
  assert.match(html, /<sup class="footnote-ref" id="fnref-2"><a href="#fn-2">2<\/a><\/sup>/)
  assert.match(html, /<section class="footnotes">/)
  assert.match(html, /<li id="fn-1">The footnote body\.<a href="#fnref-1"/)
  assert.match(html, /<li id="fn-2">Second note with <strong>bold<\/strong>\.<a href="#fnref-2"/)
})

test('unresolved footnote references stay literal', () => {
  const html = md.render('No ref for[^missing].')
  assert.match(html, /No ref for\[\^missing\]\./)
  assert.doesNotMatch(html, /class="footnotes"/)
})

test('footnote definitions inside code fences are not parsed', () => {
  const html = md.render('```\n[^1]: not a footnote in code\n```\n\nUses nothing.')
  assert.doesNotMatch(html, /class="footnotes"/)
})

test('autolinks for http, ftp and email addresses', () => {
  const html = md.render('Visit <https://x.dev/path> or <ftp://files.example.com> or <hey@example.com>')
  assert.match(html, /<a href="https:\/\/x\.dev\/path">https:\/\/x\.dev\/path<\/a>/)
  assert.match(html, /<a href="mailto:hey@example\.com">hey@example\.com<\/a>/)
})

test('autolinks are skipped inside inline code', () => {
  const html = md.render('Use `<https://x.dev>`')
  assert.match(html, /<code>&lt;https:\/\/x\.dev&gt;<\/code>/)
})

test('markdown feature flags disable footnotes and autolinks', () => {
  const off = createMarkdown({ footnotes: false, autolinks: false })
  const html = off.render('Note[^1] via <https://x.dev>.\n\n[^1]: body')
  assert.match(html, /Note\[\^1\] via <https:\/\/x\.dev>\./)
  assert.doesNotMatch(html, /class="footnotes"/)
  assert.doesNotMatch(html, /<a href="https:\/\/x\.dev/)
})

test('backslash escaping keeps punctuation literal', () => {
  const html = md.render('\\*literal\\* and \\[not a link\\] and \\`not code\\` and \\\\ backslash')
  assert.match(html, /<p>\*literal\* and \[not a link\] and `not code` and \\ backslash<\/p>/)
  assert.doesNotMatch(html, /<em>|<strong>|<code>|<a |<img /)
})

test('escaped punctuation and real markup coexist', () => {
  const html = md.render('\\*literal\\* and *em*')
  assert.match(html, /\*literal\* and <em>em<\/em>/)
})

test('nested emphasis renders inner emphasis inside strong', () => {
  const html = md.render('**bold *inner* mark** and ***bold italic*** and **a** and _b_')
  assert.match(html, /<strong>bold <em>inner<\/em> mark<\/strong>/)
  assert.match(html, /<strong><em>bold italic<\/em><\/strong>/)
  assert.match(html, /<strong>a<\/strong>/)
  assert.match(html, /<em>b<\/em>/)
})

test('pathological delimiter runs stay literal', () => {
  const html = md.render('**** and ** ** and * *')
  assert.match(html, /<p>\*\*\*\* and \*\* \*\* and \* \*<\/p>/)
  assert.doesNotMatch(html, /<strong>|<em>/)
})

test('reference-style links resolve from definitions', () => {
  const html = md.render('[text][id] [collapsed][] [shortcut]\n\n[id]: https://x.dev\n[collapsed]: /page.md\n[shortcut]: https://y.dev')
  assert.match(html, /<a href="https:\/\/x\.dev">text<\/a>/)
  assert.match(html, /<a href="\/page">collapsed<\/a>/)
  assert.match(html, /<a href="https:\/\/y\.dev">shortcut<\/a>/)
})

test('reference labels are case-insensitive and definitions may follow use', () => {
  const html = md.render('See [page] and [the][ID] later.\n\n[id]: index.md\n[PAGE]: https://z.dev')
  assert.match(html, /<a href="https:\/\/z\.dev">page<\/a>/)
  assert.match(html, /<a href="\.\/">the<\/a>/)
})

test('unknown reference links stay literal', () => {
  const html = md.render('[ghost][nope]')
  assert.match(html, /<p>\[ghost\]\[nope\]<\/p>/)
  assert.doesNotMatch(html, /<a /)
})

test('reference-style links are skipped inside inline code', () => {
  const html = md.render('`[x][id]`\n\n[id]: https://y.dev')
  assert.match(html, /<code>\[x\]\[id\]<\/code>/)
  assert.doesNotMatch(html, /<a /)
})

test('link definitions inside code fences are not parsed', () => {
  const html = md.render('```\n[x]: https://nope.dev\n```\n\nStill literal [x].')
  assert.match(html, /<p>Still literal \[x\]\.<\/p>/)
  assert.doesNotMatch(html, /<a /)
})

test('task lists render checkboxes with list-item class', () => {
  const html = md.render('- [x] done\n- [ ] todo\n- plain')
  assert.match(html, /<li class="task-list-item"><input class="task-checkbox" type="checkbox" checked disabled> done<\/li>/)
  assert.match(html, /<li class="task-list-item"><input class="task-checkbox" type="checkbox" disabled> todo<\/li>/)
  assert.match(html, /<li>plain<\/li>/)
})

test('task list items still render inline markup', () => {
  const html = md.render('- [ ] `code` and **bold**')
  assert.match(html, /<li class="task-list-item"><input class="task-checkbox" type="checkbox" disabled> <code>code<\/code> and <strong>bold<\/strong><\/li>/)
})

test('task lists can be disabled via markdown.taskLists', () => {
  const off = createMarkdown({ taskLists: false })
  const html = off.render('- [x] done')
  assert.match(html, /<li>\[x\] done<\/li>/)
  assert.doesNotMatch(html, /task-checkbox|task-list-item/)
})
