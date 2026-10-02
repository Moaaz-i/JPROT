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
  // A link whose URL is refused becomes the literal text the author wrote, with
  // no element at all. It used to become `<a href="#">bad</a>`, which is worse
  // than useless in both directions: the href is a dead link the reader can
  // click, and the surrounding punctuation the author wrote — the closing `)` of
  // `alert(1)` — was left stranded in the page as a stray character.
  assert.doesNotMatch(html, /<a [^>]*href/)
  assert.doesNotMatch(html, /href="#"/)
  // The refused URL is visible as *text* — that is the point of leaving the
  // construct literal, and it is inert there. What must not happen is the scheme
  // reaching an attribute, which is what `scanHtml` checks in the fuzz suite.
  assert.doesNotMatch(html, /(?:href|src)="[^"]*(?:javascript:|data:text\/html)/)
  // An image keeps an element, because dropping it would drop its alt text, and
  // `src` is required. The URL is replaced rather than trusted.
  assert.match(html, /<img src="#" alt="bad">/)
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

test('a four-backtick line is text, and does not hide later definitions', () => {
  // Regression: the definition pre-scan tested for *any* run of backticks while
  // the block emitter required exactly three. A four-backtick line therefore
  // told the pre-scan the rest of the document was code — so it collected
  // nothing — while the emitter saw an ordinary paragraph and skipped the
  // `[^1]:` line as a definition it believed had already been consumed. Nothing
  // had consumed it, and the note text disappeared from the page.
  const src = '````\nSee [^1] here.\n\n[^1]: the note body'
  const html = md.render(src)
  assert.match(html, /footnote-ref/)
  assert.match(html, /the note body/)
  assert.match(html, /<li id="fn-1">the note body/)
})

test('the pre-scan and the block emitter agree on where code fences are', () => {
  // The same invariant as above, stated directly: for every line shape that
  // looks like a fence, the definitions the pre-scan collects have to be the
  // definitions the page can still show. If the two sides disagree about a line,
  // the text behind it is dropped silently.
  const openers = ['```', '```js', '````', '``` extra', '   ```', '~~~\n```']
  for (const opener of openers) {
    const html = md.render(`${opener}\nSee [^1] here.\n\n[^1]: the note body`)
    assert.match(html, /the note body/, `opener ${JSON.stringify(opener)} lost the definition text`)
  }
})

test('an unclosed fence inside a list item does not swallow the rest of the page', () => {
  // The second half of the same disagreement: where a fence *ends*. The emitter
  // ends one at the close of its container — the list item — while the pre-scan
  // sees one flat list of lines and runs it to the end of the document. Every
  // definition after the first fence inside a list item was therefore collected
  // by nobody and then skipped by the emitter as already-consumed text.
  //
  // The fix is not to make the pre-scan guess at containers, which it cannot see;
  // it is for the emitter to skip only what the pre-scan actually collected. So
  // the note below comes out as *text* rather than as a footnote. That is the
  // point: a disagreement degrades to something visible and harmless instead of
  // to a sentence leaving the page.
  const src = '1. a\n  ```\n  x\n\nSee [^1] here.\n\n[^1]: the note body'
  const html = md.render(src)
  assert.match(html, /<code[^>]*>x<\/code>/)
  assert.match(html, /the note body/)
  assert.match(html, /See \[\^1\] here\./)
})

test('a blank line inside a fenced block in a list item stays in the block', () => {
  // The counterpart to the test above: the boundary rule must not fire on a
  // blank line, because a blank line inside a list item's code block is content
  // and the container continues past it.
  const html = md.render('- a\n  ```\n  code\n\n  more\n  ```\n\ntail')
  assert.match(html, /code\n\nmore/)
  assert.match(html, /tail/)
})

test('a fenced code block inside a list item renders as code', () => {
  // An ordered marker is wider than a bullet (`1. ` is four columns, `- ` is
  // two), and the item's continuation lines were dedented by the full marker
  // width no matter how far they were actually indented. A two-space fence
  // inside a `1. ` item was therefore sliced down to a single stray backtick:
  // the code rendered as inline text, with no error. `1. a` followed by
  // `  hello` lost its first two letters the same way.
  const html = md.render('1. a\n  ```js\n  code\n  ```\n\ntail')
  assert.match(html, /<pre class="code-block">/)
  assert.match(html, /<code class="language-js">code<\/code>/)

  const continuation = md.render('1. a\n  hello\n  world')
  assert.match(continuation, /<li>a hello world<\/li>/)
})

test('a URL may contain balanced parentheses', () => {
  // `[^)]+` stops at the first `)`, so `![b](data:text/html,alert(1))` read the
  // source as `data:text/html,alert(1`, refused it, and left the real closing
  // paren behind as a visible `)` in the middle of the page.
  assert.equal(md.render('![b](javascript:alert(1))'), '<p><img src="#" alt="b"></p>\n')
  assert.match(md.render('[a](/wiki/Foo_(bar))'), /href="\/wiki\/Foo_\(bar\)"/)
})

test('a link definition with trailing text is text, not a definition', () => {
  // The emitter skipped anything shaped like `[x]: <non-space>` while the
  // collector required the whole line to be the definition. A line with a
  // fragment and a space after it was therefore skipped as a definition nobody
  // had consumed, and the sentence after it left the page.
  const html = md.render('[a]: /url #frag and more words\n\nthe next sentence')
  assert.match(html, /the next sentence/)
  assert.match(html, /\[a\]:/)
})

test('a link definition carries its title through to the anchor', () => {
  // The title was parsed off the definition line and discarded, so the author's
  // title disappeared from the page while the line was consumed either way.
  assert.match(md.render('[a]: /url "Title"\n\nSee [a].'), /<a href="\/url" title="Title">a<\/a>/)
  assert.match(md.render("[a]: /url 'T'\n\nSee [a][]."), /<a href="\/url" title="T">a<\/a>/)
  assert.match(md.render('[a]: /url (T)\n\nSee [a].'), /<a href="\/url" title="T">a<\/a>/)
  // First definition still wins.
  assert.match(md.render('[a]: /first\n[a]: /second\n\nSee [a].'), /href="\/first"/)
})

test('a stray bracket does not claim the rest of the page as link text', () => {
  // The label pattern ran to the *first* `]`, so a stray `[` in prose took
  // everything up to the next one as a link label. In a document whose lines were
  // joined by CRs that turned forty words into one anchor — and the emphasis
  // inside it then closed outside the `</a>`, leaving the reader with a repaired
  // mess of nested tags. Brackets are now matched rather than merely forbidden, so
  // the inner link is found on its own and the stray bracket stays literal.
  const html = md.render('[r stray\n\nsome *emphasis* and [a real](https://x.example) link')
  assert.match(html, /\[r stray/)
  assert.match(html, /<a href="https:\/\/x\.example">a real<\/a>/)
  assert.match(html, /<em>emphasis<\/em>/)

  // A balanced bracket inside a label is still the author's label.
  assert.match(md.render('[see [1] here](https://x.example)'),
    /<a href="https:\/\/x\.example">see \[1\] here<\/a>/)
})

test('a footnote whose body cites another footnote renders both', () => {
  // The section was built with `Array.prototype.map` over `doc.noteOrder`, which
  // fixes the length when the iteration begins. Rendering a note's body can
  // reference a second note, and that pushes a new id onto `noteOrder` *during* the
  // map — so no `<li>` was emitted for it, its superscript linked to an `#fn-…`
  // that did not exist, and the second note's text never reached the page.
  const html = md.render('See [^a].\n\n[^a]: first, and see [^b].\n[^b]: the second note')
  assert.match(html, /id="fn-a"/)
  assert.match(html, /id="fn-b"/)
  assert.match(html, /the second note/)
})

test('a fence inside a footnote definition ends the definition, not the page', () => {
  // The emitter skipped a definition line *plus every indented line after it*,
  // while the collector stopped at a code fence — backticks are a fence to both
  // sides of the parser. So the lines between the two decisions were skipped by
  // one and stored by neither, and everything below the fence left the page. The
  // collector now reports the span it claimed and the emitter skips that many
  // lines, so the two cannot drift.
  const html = md.render('See [^1] here.\n\n[^1]: the note\n  ```\n  fenced body\n  ```\n\ntail')
  assert.match(html, /<li id="fn-1">the note</)
  // The block's content keeps the indentation the author wrote: this fence is at
  // the top level of the document, not inside a list item, so there is no marker
  // column to dedent by.
  assert.match(html, /<code>  fenced body<\/code>/)
  assert.match(html, /<p>tail<\/p>/)

  // Same document with the fence left open. The fence then runs to the end of the
  // container, which is correct, and the point is that `tail` is code rather than
  // gone: the earlier version of this skipped the fenced lines and stored nothing,
  // so the text left the page entirely instead of becoming a code block.
  const open = md.render('See [^1] here.\n\n[^1]: the note\n  ```\n  fenced body\n\ntail')
  assert.match(open, /<code[^>]*>\s*fenced body/)
  assert.match(open, /tail<\/code>/)
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

/* ------------------------------------------------------------------ *
 * Found by the seed sweep in test/unit/markdown-fuzz.test.js. Each of
 * these lost text that the author wrote, and none of them was visible
 * to a snapshot: the snapshot simply recorded the missing sentence.
 * ------------------------------------------------------------------ */

test('a code fence ends a footnote definition', () => {
  // The definition's extent is stored as a *count* of lines, and the emitter
  // spends it as "skip the next N lines from here". A fence between the count
  // and the spend makes the two disagree, and the emitter skips the fence
  // *opener* — which leaves the fence unclosed and takes the rest of the page
  // with it. Before the fix this document rendered nothing at all.
  const html = md.render(['See [^a] here.', '', '[^a]: dolor', 'gone Mk1', 'after Mk2', '```', '    tail Mk3', '```'].join('\n'))
  assert.match(html, /<li id="fn-a">dolor</)
  // The counted lines are still paragraphs — the fence did not swallow them.
  assert.match(html, /<p>gone Mk1\nafter Mk2<\/p>/)
  // And the fence still works: it opens and closes on its own lines.
  assert.match(html, /<pre class="code-block"><button[^>]+>Copy<\/button><code>    tail Mk3<\/code><\/pre>/)
})

test('a fence immediately after a footnote definition does not become its body', () => {
  // Same mismatch, minimal form: the emitter used to skip the fence *opener*
  // as part of the definition, so the block never opened and `code Mk1`
  // rendered as a paragraph instead.
  const html = md.render(['See [^a] here.', '', '[^a]: dolor', '```', 'code Mk1', '```'].join('\n'))
  assert.match(html, /<pre class="code-block"><button[^>]+>Copy<\/button><code>code Mk1<\/code><\/pre>/)
  assert.match(html, /<li id="fn-a">dolor</)
})

test('a fence does not extend a footnote definition when the fence comes first', () => {
  const html = md.render(['See [^a] here.', '```', '```', '', '[^a]: dolor Mk1'].join('\n'))
  assert.match(html, /<li id="fn-a">dolor Mk1</)
})

test('a table does not swallow a footnote definition line', () => {
  // The table's row loop is the one block rule that reaches further than a
  // single line, and it used to run straight past the line the emitter has
  // promised to skip. The definition became a table cell, so the `[^a]` in it
  // rendered as a *live* reference while the footnote it named had no
  // definition at all: a number on the page that jumped nowhere, and no note.
  const html = md.render(['See [^a] here.', '', '| a |', '|---|', '| b |', '[^a]: the note Mk1'].join('\n'))
  assert.match(html, /<li id="fn-a">the note Mk1</)
  // The definition is not a row, so the table ends where the author's rows end.
  assert.doesNotMatch(html, /<td>the note Mk1<\/td>/)
  assert.match(html, /<tr><td>b<\/td><\/tr>/)
})

test('a table does not swallow a link definition line', () => {
  const html = md.render(['See [x] here.', '', '| a |', '|---|', '| b |', '[x]: /url "t"'].join('\n'))
  // The definition is consumed, so it renders as nothing at all — and, before the
  // fix, it rendered as a table *row* instead.
  assert.doesNotMatch(html, /\[x\]: \/url/)
  // …while the reference still resolves to the url and title it named.
  assert.match(html, /<a href="\/url" title="t">x<\/a>/)
})

test('a table row loop still stops at a non-definition line with a pipe', () => {
  // The stop condition is "a definition the pre-scan consumed", not "a pipe".
  const html = md.render(['| a |', '|---|', '| b |', '| c |'].join('\n'))
  assert.match(html, /<tr><td>b<\/td><\/tr>\n<tr><td>c<\/td><\/tr>/)
})

test('an indented definition is still not a definition', () => {
  // The stop condition is the same question the other branches ask — "did the
  // pre-scan collect this?" — so an indented `[^a]:`, which it did not, still
  // renders as the list item it is.
  const html = md.render(['See [^a] here.', '', '- [^a]: in a list Mk1', '', '[^a]: the real note'].join('\n'))
  assert.match(html, /<li><sup class="footnote-ref"><a href="#fn-a">1<\/a><\/sup>: in a list Mk1<\/li>/)
  assert.match(html, /<li id="fn-a">the real note</)
})

test('a table inside a container is not stopped by a definition', () => {
  // `isCollectedDefinition()` takes `toc`, so inside a quote — where the emitter
  // does not skip definitions — it answers "no" and the row loop keeps claiming
  // the line, exactly as it would for any other row. Answering "yes" there would
  // end the table early and hand the line to a branch that renders it, so a
  // definition would silently change a table's shape.
  //
  // The control has to be a *non*-definition with the same shape, and the two
  // cannot be the same line, so the comparison is over the tag skeleton: the
  // question is whether the element structure changed, not what it says.
  const skeleton = (html) => html.replace(/>[^<]*</g, '><')
  const withDefinition = md.render(['> | a |', '> |---|', '> | b |', '> [^a]: x'].join('\n'))
  const withText = md.render(['> | a |', '> |---|', '> | b |', '> plain'].join('\n'))
  assert.equal(skeleton(withDefinition), skeleton(withText))
  // And the definition is a paragraph inside the quote, as it is without a table.
  assert.match(withDefinition, /<\/table><p>\[\^a\]: x<\/p>\n<\/blockquote>/)
})

test('a table at top level *is* stopped by a definition', () => {
  // The mirror image, so the two together say the condition is `toc` and not
  // "looks like a definition".
  const html = md.render(['See [^a] here.', '', '| a |', '|---|', '| b |', '[^a]: the note Mk1'].join('\n'))
  assert.match(html, /<li id="fn-a">the note Mk1</)
  assert.doesNotMatch(html, /<td>the note Mk1<\/td>/)
})
