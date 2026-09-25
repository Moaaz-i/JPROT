// Footnote section rendering. Definitions were collected in the document
// pre-scan; the order of `doc.noteOrder` is the order the references appeared in
// the text, which is what the numbers in the superscripts refer to.
export function renderFootnotes(doc, inline) {
  const lis = doc.noteOrder.map((id) => {
    const body = doc.noteDefs[id] ? doc.noteDefs[id].join('\n') : ''
    const back = `<a href="#fnref-${id}" class="footnote-backref" aria-label="Back to reference">↩︎</a>`
    return `<li id="fn-${id}">${body.length ? inline.render(body) : ''}${back}</li>`
  }).join('\n')
  return `<section class="footnotes"><ol>\n${lis}\n</ol></section>\n`
}
