// RTL and direction-neutrality.
//
// `dir: "rtl"` is a documented config key, but nothing tested it and nothing in
// the theme's CSS was required to be direction-neutral. Five rules were written
// with physical properties, so an RTL site got: a code-block Copy button on the
// wrong side, a "next" page label reading against its own arrow, a corporate
// project accent bar on the right instead of the leading edge, a mobile nav
// dropdown spanning from the wrong origin, and `direction: ltr` from the
// `--dir` variable overriding the `dir="rtl"` attribute on <html> entirely.
//
// The first two tests pin behaviour. The third is the regression guard: it
// fails when a physical direction-dependent property is added back, which is the
// whole point — nobody should have to re-derive that `text-align: right` is
// wrong for a next-page label.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createJprot } from '../../core/server.js'
import { makeSite, REPO_ROOT } from '../helpers/site.js'

const STYLES = join(REPO_ROOT, 'theme/default/styles.css')

/** The stylesheet with comments removed, so prose in a comment is not a match. */
const declarations = async () => {
  const css = await readFile(STYLES, 'utf8')
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Properties whose meaning depends on the writing direction. `center`, `start`,
// `end` and `justify` are direction-neutral; the ones listed here are not.
const PHYSICAL = [
  'margin-left', 'margin-right',
  'padding-left', 'padding-right',
  'border-left', 'border-right',
  'left', 'right',
]

test('dir: "rtl" puts dir="rtl" on <html>', async () => {
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\ndescription: Home.\n---\n\nHello.' },
    config: { title: 'T', lang: 'ar', dir: 'rtl' },
  })
  const app = await createJprot({ root: site.root, watch: false })
  try {
    const base = `http://127.0.0.1:${await app.listen(0)}`
    const html = await (await fetch(base + '/')).text()
    assert.match(html, /<html[^>]*\sdir="rtl"/)
    assert.match(html, /<html[^>]*\slang="ar"/)
  } finally {
    app.server.close()
    await app.closeWatcher()
    await site.cleanup()
  }
})

test('a right-to-left lang with no dir is warned about, not silently mirrored', async () => {
  // Inferred `dir` would be the wrong fix: an explicit declaration the author
  // can grep for beats a guess that silently overrides them, and "ltr" is what a
  // browser does by default. What was missing was the *warning* — an Arabic
  // author who set only `lang` got a correctly-rendered page laid out in the
  // wrong direction, with nothing anywhere saying so.
  const { validateConfig } = await import('../../core/content/schema.js')

  const messages = (config) =>
    validateConfig({ title: 'T', ...config }).warnings.map((w) => `${w.path}: ${w.message}`).join('\n')

  assert.match(messages({ lang: 'ar' }), /dir: .*lang "ar" is right-to-left/)
  // Subtags still carry the language, so `ar-EG` counts too.
  assert.match(messages({ lang: 'ar-EG' }), /right-to-left/)
  assert.match(messages({ lang: 'he' }), /right-to-left/)
  assert.match(messages({ lang: 'fa-IR' }), /right-to-left/)

  // Declared, so the warning goes away. It stays advisory rather than an error:
  // an Arabic interface inside an LTR shell is a legitimate layout choice.
  assert.doesNotMatch(messages({ lang: 'ar', dir: 'rtl' }), /right-to-left/)

  // Left-to-right languages are untouched, and an explicit ltr is not nagged
  // about either.
  assert.doesNotMatch(messages({ lang: 'en' }), /right-to-left/)
  assert.doesNotMatch(messages({ lang: 'en', dir: 'ltr' }), /right-to-left/)
})

test('the shipped theme declares no direction-dependent physical properties', async () => {
  const css = await declarations()
  const offenders = []

  for (const prop of PHYSICAL) {
    // Match the property as a declaration, not as a substring: `padding-inline-start`
    // contains "start", `text-align: right` contains "right", and a custom
    // property or a class name may contain the word at all.
    const re = new RegExp(`(^|[;{])\\s*${prop}\\s*:`, 'g')
    let m
    while ((m = re.exec(css))) {
      const line = css.slice(0, m.index).split('\n').length
      offenders.push(`${prop} at line ${line}`)
    }
  }

  // `text-align` is the one property that reads naturally as left/right, so it
  // gets a separate check: `center`, `start`, `end` and `justify` are fine.
  const align = /(^|[;{])\s*text-align\s*:\s*(left|right)\b/g
  let a
  while ((a = align.exec(css))) {
    offenders.push(`text-align: ${css.slice(a.index, a.index + 40).match(/text-align\s*:\s*(\w+)/)[1]} at line ${css.slice(0, a.index).split('\n').length}`)
  }

  assert.deepEqual(offenders, [], `theme/default/styles.css must be direction-neutral:\n  ${offenders.join('\n  ')}`)
})

test('the theme flips --dir for RTL and mirrors the horizontal animations', async () => {
  const css = await declarations()

  // `--dir` feeds `direction`, which is a physical keyword and so cannot be
  // logical. Without this override, `dir="rtl"` on <html> was overridden by
  // `direction: ltr` from the :root variable — the attribute said one thing and
  // the layout said the other.
  assert.match(css, /\[dir="rtl"\]\s*\{[^}]*--dir:\s*rtl/, 'no [dir="rtl"] block flipping --dir')

  // `translateX` has no logical form, so the horizontal slide animations are the
  // one place that has to be mirrored by hand.
  assert.match(css, /\[dir="rtl"\][^{]*\[data-animate="slide-left"\][^{]*\{\s*transform:\s*translateX\(\s*\+?30px/,
    'slide-left is not mirrored for RTL')
  assert.match(css, /\[dir="rtl"\][^{]*\[data-animate="slide-right"\][^{]*\{\s*transform:\s*translateX\(\s*-30px/,
    'slide-right is not mirrored for RTL')
})

test('the direction block is documented as the single RTL switch', async () => {
  // Guards the comment rather than the behaviour, but the comment is the thing
  // that stops the next `[dir="rtl"]` block from being scattered through the
  // file instead of collected in one place.
  const raw = await readFile(STYLES, 'utf8')
  assert.match(raw, /scattering `\[dir="rtl"\]` blocks through the file/,
    'the [dir="rtl"] block lost its "collect overrides here" note')
})
