// Footnote section rendering. Definitions were collected in the document
// pre-scan; the order of `doc.noteOrder` is the order the references appeared in
// the text, which is what the numbers in the superscripts refer to.
export function renderFootnotes(doc, inline) {
  // This is a worklist rather than a `map` over `doc.noteOrder`, and that is not
  // a style choice. Rendering a note's body can *reference another note* — a
  // definition whose text cites a second footnote is ordinary prose — and doing so
  // pushes a new id onto `doc.noteOrder`. `Array.prototype.map` fixes the length
  // when the iteration begins, so the new id was never visited: no `<li>` was
  // emitted for it, its superscript linked to an `#fn-x` that did not exist, and
  // its text never reached the page at all. The loop keeps going until every
  // registered id has a list item, and `done` bounds it when notes cite each other.
  const lis = []
  const done = new Set()
  while (lis.length < doc.noteOrder.length) {
    const id = doc.noteOrder.find((x) => !done.has(x))
    if (id === undefined) break
    done.add(id)
    const body = doc.noteDefs[id] ? doc.noteDefs[id].join('\n') : ''
    const back = `<a href="#fnref-${id}" class="footnote-backref" aria-label="Back to reference">↩︎</a>`
    lis.push(`<li id="fn-${id}">${body.length ? inline.render(body) : ''}${back}</li>`)
  }
  return `<section class="footnotes"><ol>\n${lis.join('\n')}\n</ol></section>\n`
}
