import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esc, isInside, slugify, MIME, safeHref, safeColor, editDistance } from '../../core/utils.js'
import { resolveRelativeUrl } from '../../core/urls.js'
import { safeUrl, escapeHtml } from '../../lib/markdown/sanitize.js'

test('esc escapes HTML metacharacters', () => {
  assert.equal(esc('a&b<c>"d"'), 'a&amp;b&lt;c&gt;&quot;d&quot;')
  assert.equal(esc(null), '')
  assert.equal(esc(undefined), '')
  assert.equal(esc(42), '42')
})

// The apostrophe used to survive escaping, which is live in a single-quoted
// attribute or a JS string literal. `escapeHtml` and `esc` had drifted apart
// here; they must now agree on all five characters.
test('esc and escapeHtml agree on all five metacharacters', () => {
  for (const ch of ['&', '<', '>', '"', "'"]) {
    assert.equal(escapeHtml(ch), esc(ch), `escapeHtml and esc disagree on ${ch}`)
  }
  assert.ok(!escapeHtml("it's").includes("'"))
})

test('safeHref rejects dangerous schemes and control characters', () => {
  assert.equal(safeHref('javascript:alert(1)'), '#')
  assert.equal(safeHref('JavaScript:alert(1)'), '#')
  assert.equal(safeHref('  javascript:alert(1)  '), '#')
  assert.equal(safeHref('vbscript:msgbox(1)'), '#')
  assert.equal(safeHref('data:text/html,<script>'), '#')
  assert.equal(safeHref('java\u0000script:alert(1)'), '#')
  assert.equal(safeHref(''), '#')
  assert.equal(safeHref(null), '#')
})

test('safeHref allows http, mailto, relative paths and inline images', () => {
  assert.equal(safeHref('https://example.test/x'), 'https://example.test/x')
  assert.equal(safeHref('mailto:a@b.test'), 'mailto:a@b.test')
  assert.equal(safeHref('/blog/hello'), '/blog/hello')
  assert.equal(safeHref('./relative'), './relative')
  // data: images are only allowed for src, never for a navigable href.
  assert.equal(safeHref('data:image/png;base64,AAA', { image: true }), 'data:image/png;base64,AAA')
  assert.equal(safeHref('data:image/png;base64,AAA'), '#')
})

// One definition of "safe link", shared by the renderer and the theme: these
// were three copies that had already drifted.
test('safeUrl in the renderer is the same function as safeHref', () => {
  assert.equal(safeUrl, safeHref)
})

test('safeColor only lets a real color value through', () => {
  assert.equal(safeColor('#4f46e5'), '#4f46e5')
  assert.equal(safeColor('#FFF'), '#FFF')
  assert.equal(safeColor('rgb(79 70 229)'), 'rgb(79 70 229)')
  assert.equal(safeColor('hsl(240, 70%, 60%)'), 'hsl(240, 70%, 60%)')
  assert.equal(safeColor('var(--color-accent, #4f46e5)'), 'var(--color-accent, #4f46e5)')
  // Escaping alone would not stop these: `}` ends a declaration and `/*`
  // opens a comment, either of which rewrites the rest of a <style> block.
  assert.equal(safeColor('red}</style><script>alert(1)</script>'), '')
  assert.equal(safeColor('red; } body { display:none'), '')
  assert.equal(safeColor('red/*'), '')
  assert.equal(safeColor('"onload=alert(1) x="'), '')
  assert.equal(safeColor(''), '')
  assert.equal(safeColor(undefined), '')
})

test('editDistance is symmetric and zero for equal strings', () => {
  assert.equal(editDistance('title', 'title'), 0)
  assert.equal(editDistance('tite', 'title'), 1)   // one insertion
  assert.equal(editDistance('title', 'tite'), 1)
  assert.equal(editDistance('titel', 'title'), 2)  // a rotation costs two
  assert.equal(editDistance('title', 'titel'), 2)
  assert.equal(editDistance('', 'abc'), 3)
  assert.equal(editDistance('abc', ''), 3)
})

test('isInside guards parent/child paths', () => {
  assert.equal(isInside('/a/b', '/a/b/c.md'), true)
  assert.equal(isInside('/a/b', '/a/b'), true)
  assert.equal(isInside('/a/b', '/a/bc/x.md'), false)
  assert.equal(isInside('/a/b', '/etc/passwd'), false)
  assert.equal(isInside('/a/b', '/a/b/../secret.md'), false)
})

test('slugify is lowercase and dash-separated', () => {
  assert.equal(slugify('Hello World!'), 'hello-world')
  assert.equal(slugify('  My   Post  '), 'my-post')
  assert.equal(slugify(''), '')
  assert.equal(slugify('مرحبا بالعالم'), 'مرحبا-بالعالم')
})

test('MIME covers common types', () => {
  assert.equal(MIME['.css'], 'text/css; charset=utf-8')
  assert.equal(MIME['.svg'], 'image/svg+xml')
})

test('relative content URLs resolve from the current page', () => {
  assert.equal(resolveRelativeUrl('../about', '/docs/guide'), '/about')
  assert.equal(resolveRelativeUrl('/blog', '/docs/guide'), '/blog')
  assert.equal(resolveRelativeUrl('https://example.test/x', '/docs/guide'), 'https://example.test/x')
})
