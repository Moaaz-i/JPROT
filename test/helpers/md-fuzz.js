// Adversarial Markdown generator and HTML inspector.
//
// The example-based tests in test/unit/markdown.test.js check the Markdown the
// author of those tests thought of. This file is the opposite: it manufactures
// Markdown nobody would write on purpose — every construct the engine supports
// plus the malformed neighbours of each one — and then inspects the *rendered
// result* for defects a reader would actually see.
//
// Two ideas do the work:
//
//   1. A marker oracle. Every generated block carries a unique token like
//      `Mk7q`. If the token is missing from the visible text of the output, the
//      renderer swallowed something the author wrote. That is the single most
//      common *visible* failure in a block parser — a mis-scanned line ending up
//      inside a list item, a paragraph dropped, a quote consumed as code — and
//      it is invisible to every snapshot test, because the snapshot records the
//      bug along with everything else.
//
//   2. An HTML inspector. The renderer's contract is that it emits a small set
//      of known tags, properly nested, with quoted attributes, unique ids, safe
//      URLs, and no raw source text that could become live markup. Each of those
//      is a separate property, so a failure names the defect instead of saying
//      "output changed".
//
// No dependency, on purpose: the generator is a 32-bit LCG, so every failing case
// is reproducible from a printed seed, and the file can be read as a list of
// things to try by hand.

import { createMarkdown } from '../../lib/markdown.js'

/* ---------------- the generator's randomness ---------------- */

/**
 * A 32-bit linear congruential generator.
 *
 * `s = (1664525 * s + 1013904223) mod 2^32` — the Numerical Recipes constants,
 * whose period is the full 2^32. `Math.imul` keeps the multiply in 32-bit
 * space; a plain `*` would lose precision in the float and shorten the period.
 */
export function makeRandom(seed) {
  let s = seed >>> 0
  return function random() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export const randInt = (rnd, n) => Math.floor(rnd() * n)
export const pick = (rnd, list) => list[randInt(rnd, list.length)]
export const chance = (rnd, p) => rnd() < p

function pickWeighted(rnd, entries) {
  let total = 0
  for (const [, w] of entries) total += w
  let n = rnd() * total
  for (const [value, w] of entries) {
    n -= w
    if (n < 0) return value
  }
  return entries[entries.length - 1][0]
}

const repeat = (s, n) => s.repeat(Math.max(0, n))
const spaces = (rnd, n) => repeat(' ', n || 1 + randInt(rnd, 4))

/** Every invisible character below is an escape sequence on purpose: typing the
 * character itself puts raw bytes in this file, which turns it into what `file(1)`
 * calls a binary file and makes the generator itself unreadable. */

/** The C0 controls, DEL, and the two placeholder characters the inline renderer
 * uses internally (U+0000 for code spans, U+0001 for backslash escapes). The
 * placeholders are the reason a few of these are here: text containing
 * `\u0000<digits>\u0000` collides with the renderer's own markers. */
const CONTROLS = [
  '\u0000', '\u0001', '\u0002', '\u0003', '\u0007', '\u0008', '\u000b',
  '\u000c', '\u000e', '\u001b', '\u001f', '\u007f',
  '\u0085', '\u009f',
]

/** Invisible and line-separating characters: they read as ordinary spaces to a
 * human, and they are exactly what a bad copy-paste or a hostile generator
 * produces. */
const INVISIBLE = [
  '\u00a0', '\u00ad', '\u200b', '\u200c', '\u200d', '\u200e', '\u200f',
  '\u202a', '\u202e', '\u2028', '\u2029', '\u2060', '\ufeff',
]

/** Non-ASCII text: a generator and a real author both produce it, and bidi marks
 * plus RTL text are the combination most likely to reorder a rendered line. */
const UNICODE = [
  '\u00e9', '\u00fc', '\u00f1', '\u00e5', '\u00e6\u00f8', '\u0416', '\u05d0',
  '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', '\u65e5\u672c\u8a9e', '\ud83c\udf89',
  '\u2764\ufe0f', '\u0301', '\u0e01', '\ufffd',
  // A lone surrogate, via fromCharCode so this file stays valid UTF-8. Typed
  // literally it would be mangled by any tooling that rewrites the file.
  String.fromCharCode(0xd800),
  String.fromCharCode(0xdfff),
]

/**
 * Strings that are hostile to *this* engine specifically, not just in general.
 * Each one attacks a rule the renderer implements: the escape regex, the URL
 * sanitiser, the emphasis guards, the fence detection, the table divider, the
 * callout syntax, or the internal placeholder scheme.
 */
export const HOSTILE = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "<img src=x onerror='alert(1)'>",
  '</p><script>alert(1)</script><p>',
  '<!-- comment -->',
  '<![CDATA[raw]]>',
  '<div class="x">unclosed',
  '<a href="#">x</a>',
  '<svg/onload=alert(1)>',
  '</textarea>', '</style>',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'data:image/svg+xml,<svg onload=alert(1)>',
  'data:,plain',
  '\u0000javascript:alert(1)',
  '&amp;', '&lt;script&gt;', '&#x41;', '&#0;', '&nbsp', '&;', '&&amp;',
  '`', '``', '```', '````', '~~~', '~~', '~', '*', '**', '***', '****', '*****',
  '_', '__', '___', 'a_b_c', 'snake_case_word', '2 * 3 * 4', 'a**b',
  '[', ']', '()', '(', ')', '\\', '\\*', '\\`', '\\[', '|', '||', '|---|',
  '>', '>>', '> ', '>>>>>>>>>>>>', '#', '##', '#######', '#no-space',
  '- ', '- [ ]', '- [x]', '1.', '1)', '1..', '+ ', '+\n+',
  '[a]: b', '[a]:', '[^a]:', '[^]', '[](', '[]()', '[!NOTE]',
  '\u0000', '\u0001', '\u00005\u0000', '\u0001abc\u0001', '\u0000\u0000',
  '\u2028', '\u2029', '\ufeff# heading', '\t- tab item', '    indented',
  '\ud800', 'x\u0000y',
]

/**
 * The subset of {@link HOSTILE} that carries no markup.
 *
 * Raw HTML in a Markdown body is **passed through, not escaped** — a documented,
 * deliberate decision (README, "Raw HTML in Markdown") whose safety rests on the
 * per-response Content-Security-Policy rather than on escaping. So a property
 * like "the output contains no tag the renderer did not emit" cannot be asserted
 * on a document that contains raw HTML: the document's own `<script>` is
 * supposed to arrive in the output verbatim.
 *
 * Generating from this list instead is what lets those properties assert at full
 * strength. Everything else — the URL schemes, the Markdown punctuation, the
 * control characters, the placeholders — is still there, so nothing is given up
 * except the one construct that is explicitly meant to pass through.
 */
export const HOSTILE_NO_MARKUP = HOSTILE.filter((s) => !/[<>]/.test(s))

/* ---------------- marker tokens ---------------- */

/**
 * The token every generated block carries so a swallowed fragment is detectable.
 *
 * `[A-Za-z0-9]` only: no Markdown syntax character, so the token cannot change
 * how the surrounding construct parses, and `compact()` (below) can look for it
 * without having to un-escape anything.
 */
let markerSeq = 0
function marker() {
  markerSeq = (markerSeq + 1) >>> 0
  return `Mk${(markerSeq >>> 4).toString(36)}q${(markerSeq & 15).toString(36)}`
}

/**
 * The same token, prefixed differently so a caller can tell the two pools apart.
 *
 * The `N` prefix is chosen to be impossible in the `M` pool's output and vice
 * versa, so a report that mixes documents from both modes is still readable, and
 * so `markersOf` can be asked for one pool's markers without matching the other.
 */
function markerNoMarkup() {
  markerSeq = (markerSeq + 1) >>> 0
  return `Nk${(markerSeq >>> 4).toString(36)}q${(markerSeq & 15).toString(36)}`
}

/**
 * Which hostile pool the current document draws from.
 *
 * Set per `fuzzDocument` call, because the atoms are plain functions with no
 * parameter for it and threading a second argument through every one of them
 * would obscure the generator more than the option is worth. Single-threaded,
 * and the value is restored on the way out.
 */
// Both pools are assigned in `fuzzDocument`, before any atom runs. They are
// declared here — above the pools they point at — so the accessors can be
// written once; a document is generated synchronously, so reading the current
// value at each use is equivalent to passing it down.
let hostilePool = HOSTILE
let inlinePool = []
/**
 * Whether the document being built is allowed to carry an author's `<`.
 *
 * Separate from the pools because some atoms splice markup in by hand rather
 * than drawing from a pool, and those are exactly the ones that quietly broke the
 * `markup: false` guarantee: a fence atom that appended `<img` to its info string,
 * and a link-definition atom whose URL was an angle-bracket autolink. The
 * structural properties then failed on documents the renderer had passed through
 * untouched, which is a report about the test's own premise rather than a defect.
 * `fuzz: the generator produces markup-free documents when asked` holds this to
 * account.
 */
let markupOn = true
const useHostile = (rnd) => pick(rnd, hostilePool)

const MARK_RE = /[MN]k[0-9a-z]{2,8}/g

/** Every marker still present in a (possibly shrunk) document. Deriving the
 * markers from the source text rather than from the generator means shrinking
 * works: a shrunk document has fewer markers, and the property only asks about
 * the ones it still contains. */
export function markersOf(src) {
  return [...new Set(src.match(MARK_RE) || [])]
}

/**
 * The visible text of a document, with all non-alphanumeric noise removed.
 *
 * Compaction exists because a hostile token injected next to a marker can split
 * it — `*em Mk7q*` with a `*` spliced into the middle still shows the reader
 * every character of the marker, and failing on that would be the test's bug,
 * not the renderer's. Requiring the marker's characters to appear in order and
 * without intervening punctuation is the strongest claim that survives that.
 */
export function compact(s) {
  return String(s).replace(/[^0-9A-Za-z\u00c0-\uffff]+/g, '')
}

/* ---------------- inline atoms ---------------- */

const WORDS = [
  'alpha', 'beta', 'gamma', 'lorem', 'ipsum', 'dolor', 'elit', 'elit',
  'a', 'in', 'the', 'middle', '42', '007', 'x1y2z3',
  'caf\u00e9', 'na\u00efve', '\u65e5\u672c\u8a9e', '\u0627\u0644\u0639\u063b',
  '\ud83c\udf89party', 'e\u0301lan',
]

const word = (rnd) => pick(rnd, WORDS)

/**
 * Inline atoms that put a tag the *author* wrote into the output.
 *
 * Kept out of {@link INLINE} because they are the one construct a markup-free
 * document must not contain: the renderer is documented to pass raw HTML
 * through, so a structural property can only claim "every tag here came from
 * the renderer" over a document that had none to begin with.
 */
const RAW_HTML_INLINE = [
  (r, mk) => `raw <b>${mk()}</b> in prose`,
  (r, mk) => `raw <script>${mk()}</script> in prose`,
  // These two embed markup *inside a URL*. When the link regex does not match —
  // and a URL with an unbalanced `)` never does — the construct stays literal,
  // and that literal text carries a real `<script>` / `<svg onload=…>` into the
  // output. Which is to be expected: an unmatched construct is author text, and
  // author text passes through.
  (r, mk) => `[data ${mk()}](data:text/html,<script>)`,
  (r, mk) => `![data ${mk()}](data:image/svg+xml,<svg onload=alert(1)>)`,
  // The autolink atoms. A *complete* one — `<https://x.example>` — is Markdown
  // syntax the renderer consumes, so it belongs in the ordinary pool. But a
  // mutation that truncates one leaves a bare `<https` in the output, and since
  // raw HTML passes through by design, that reaches the page as a tag. There is
  // no way to make a structural property meaningful on a document that may
  // contain a half-typed tag, so these live here and the markup-free documents
  // carry the URL-scheme attacks instead — which is the part worth asserting.
  (r, mk) => `<https://example.com/${word(r)}>`,
  (r, mk) => `<a@${word(r)}.example.com>`,
]

/**
 * Inline constructs. Every one takes `mk`, the marker's factory, and returns a
 * fragment with exactly one marker in a position a reader can see.
 *
 * The list is ordered roughly by how likely the construct is to be mis-parsed:
 * images and links first, because they have the most moving parts (a regex with
 * three capture groups, a URL sanitiser, and a `.md`-rewriting canonicaliser),
 * then emphasis, then the constructs that are *meant* to stay literal.
 *
 * Anything that emits a tag the *author* wrote lives in {@link RAW_HTML_INLINE}
 * rather than here, so `fuzzDocument` can leave it out of a markup-free
 * document with one check.
 */
const INLINE = [
  (r, mk) => `prose ${mk()} ${word(r)}`,
  (r, mk) => `*em ${mk()}*`,
  (r, mk) => `_em ${mk()}_`,
  (r, mk) => `**strong ${mk()}**`,
  (r, mk) => `__strong ${mk()}__`,
  (r, mk) => `***both ${mk()}***`,
  (r, mk) => `~~struck ${mk()}~~`,
  (r, mk) => `\`code ${mk()}\``,
  (r, mk) => `\`\`double ${mk()}\`\``,
  (r, mk) => `\`unclosed ${mk()}`,
  (r, mk) => `[link ${mk()}](https://example.com/${word(r)})`,
  (r, mk) => `[link ${mk()}](https://example.com/${word(r)} "${word(r)}")`,
  (r, mk) => `[js ${mk()}](javascript:alert(1))`,
  (r, mk) => `[js ${mk()}](JaVaScRiPt:alert(1))`,
  (r, mk) => `[vb ${mk()}](vbscript:msgbox(1))`,
  (r, mk) => `[tele ${mk()}](tel:+15550100)`,
  (r, mk) => `[mail ${mk()}](mailto:a@b.com)`,
  (r, mk) => `[md ${mk()}](dir/page.md)`,
  (r, mk) => `[md ${mk()}](dir/index.md)`,
  (r, mk) => `[md ${mk()}](./index.md#frag)`,
  (r, mk) => `[md ${mk()}](page.md?x=1#y)`,
  (r, mk) => `[rel ${mk()}][ref]`,
  (r, mk) => `[rel ${mk()}][REF]`,
  (r, mk) => `[rel ${mk()}][]`,
  (r, mk) => `[rel ${mk()}]`,
  (r, mk) => `[missing ${mk()}][nope]`,
  (r, mk) => `![alt ${mk()}](/img/${word(r)}.png)`,
  (r, mk) => `![alt ${mk()}](/img/${word(r)}.png "${word(r)}")`,
  (r, mk) => `![quote ${mk()}](/a"b.png)`,
  // The `data:image/` carve-out, in all three directions it can go. `safeHref`
  // allows it for an image and refuses it everywhere else, so this pair is the only
  // thing that keeps the allowance from quietly widening into `data:text/html` — and
  // the image half is what proves the allowance still works, which a property that
  // only asserted refusals never could. `svg+xml` is included deliberately: an SVG
  // loaded through `<img src>` is a passive document and cannot run script, so it is
  // part of the deliberate rule rather than an oversight in it.
  (r, mk) => `![inline ${mk()}](data:image/png;base64,iVBORw0K)`,
  (r, mk) => `![inline ${mk()}](data:image/svg+xml;base64,PHN2Zy8+)`,
  (r, mk) => `[inline ${mk()}](data:image/png;base64,iVBORw0K)`,
  (r, mk) => `![inline ${mk()}](data:text/html;base64,PGI+)`,
  (r, mk) => `[^${mk()}]`,
  (r, mk) => `[^${mk()}] and [^${mk()}]`,
  (r, mk) => `escaped \\*not em ${mk()}\\*`,
  (r, mk) => `&amp; ${mk()} &lt; ${mk()}`,
  (r, mk) => `a${pick(r, INVISIBLE)}b ${mk()}`,
  (r, mk) => `a${pick(r, CONTROLS)}b ${mk()}`,
  (r, mk) => `${pick(r, UNICODE)} ${mk()}`,
  (r, mk) => `${repeat(pick(r, ['*', '_', '~', '`']), 2 + randInt(r, 6))}${mk()}`,
  (r, mk) => `${word(r)}*${word(r)}_${word(r)}~${word(r)} ${mk()}`,
  (r, mk) => `[${mk()}](${')'}${repeat(')', 1 + randInt(r, 4))}`,
  (r, mk) => `${repeat('[', 1 + randInt(r, 5))}${mk()}${repeat(']', 1 + randInt(r, 5))}`,
  (r, mk) => `${word(r)} | ${word(r)} ${mk()}`,
  (r, mk) => `hard${chance(r, 0.5) ? '  ' : '\\'}break ${mk()}`,
]

/**
 * The full inline pool, including the atoms that emit an author's tag.
 *
 * The autolink atoms are in both pools: their angle brackets are Markdown
 * syntax the renderer consumes, so `<https://…>` is not a tag and the renderer
 * never emits one for it. `RAW_HTML_INLINE` is only in this one.
 */
const INLINE_ALL = INLINE.concat(RAW_HTML_INLINE)

/* ---------------- block atoms ---------------- */

// `'<img>'` is here because an info string carrying markup is worth attacking —
// it is the one place the renderer must not let the language attribute become a
// tag. It carries a `<`, so it is withheld from markup-free documents, whose
// whole purpose is to have no author `<` to blame. See `markupOn`.
const CODE_LANGS = ['', 'js', 'javascript', 'html', 'c++', 'a b', 'x"y', '<img>', '\u0000', 'py', 'ts']
const CODE_LANGS_NO_MARKUP = CODE_LANGS.filter((l) => !/[<>]/.test(l))

function fence(rnd, open, mk) {
  const ticks = repeat('`', 3 + randInt(rnd, 3))
  const lang = pick(rnd, markupOn ? CODE_LANGS : CODE_LANGS_NO_MARKUP)
  const body = []
  const lines = 1 + randInt(rnd, 4)
  for (let i = 0; i < lines; i++) {
    body.push(chance(rnd, 0.25) ? useHostile(rnd) : `${word(rnd)} ${mk()}`)
  }
  const close = chance(rnd, 0.15) ? '' : open
  return `${ticks}${lang}\n${body.join('\n')}\n${close}${ticks ? repeat('`', ticks.length) : ''}`
}

function listBlock(rnd, mk, depth) {
  const kind = depth <= 0 ? pick(rnd, ['ul', 'ul', 'ol', 'task']) : pick(rnd, ['ul', 'ol', 'task'])
  const items = 1 + randInt(rnd, 3)
  const lines = []
  for (let i = 0; i < items; i++) {
    const indent = repeat(' ', depth * (chance(rnd, 0.2) ? 3 : 2))
    let markerText
    if (kind === 'ol') {
      markerText = `${indent}${1 + randInt(rnd, 40)}${pick(rnd, ['.', ')'])} `
    } else if (kind === 'task') {
      markerText = `${indent}- [${pick(rnd, [' ', 'x', 'X'])}] `
    } else {
      markerText = `${indent}${pick(rnd, ['*', '-', '+'])} `
    }
    const lead = chance(rnd, 0.25) ? useHostile(rnd) : `${word(rnd)} ${mk()}`
    lines.push(markerText + lead)
    if (chance(rnd, 0.35)) lines.push('')
    if (depth < 2 && chance(rnd, 0.35)) lines.push(nestedBlock(rnd, mk, depth + 1))
    if (chance(rnd, 0.3)) lines.push('  ' + useHostile(rnd))
    if (chance(rnd, 0.25)) lines.push(`${' '.repeat(markerText.length)}${word(rnd)} ${mk()}`)
    if (chance(rnd, 0.15)) lines.push('  ```')
    if (chance(rnd, 0.15)) lines.push('  ' + word(rnd) + ' ' + mk())
  }
  return lines.join('\n')
}

function nestedBlock(rnd, mk, depth) {
  const choices = [
    () => listBlock(rnd, mk, depth),
    () => quoteBlock(rnd, mk, depth),
    () => inlineSentence(rnd, mk),
  ]
  return pick(rnd, choices)()
}

function quoteBlock(rnd, mk, depth) {
  const levels = 1 + randInt(rnd, 2)
  const inner = []
  const n = 1 + randInt(rnd, 3)
  for (let i = 0; i < n; i++) inner.push(`${word(rnd)} ${mk()}`)
  if (depth < 2 && chance(rnd, 0.4)) inner.push(nestedBlock(rnd, mk, depth + 1))
  if (chance(rnd, 0.2)) inner.push(useHostile(rnd))
  return inner.map((l) => repeat('>', levels) + ' ' + l).join('\n')
}

function callout(rnd, mk) {
  const kind = pick(rnd, ['NOTE', 'TIP', 'WARNING', 'DANGER', 'note', 'Warning'])
  const body = [`${word(rnd)} ${mk()}`]
  if (chance(rnd, 0.4)) body.push(`> ${word(rnd)} ${mk()}`)
  if (chance(rnd, 0.3)) body.push(`> - ${word(rnd)} ${mk()}`)
  return [`[!${kind}] ${body[0]}`, ...body.slice(1)].join('\n')
}

function table(rnd, mk) {
  const cols = 1 + randInt(rnd, 4)
  const cells = (n) => Array.from({ length: n }, () => {
    const base = chance(rnd, 0.3) ? useHostile(rnd) : `${word(rnd)} ${mk()}`
    // A pipe inside a cell is the classic way a table gets mis-measured.
    return chance(rnd, 0.15) ? `${base} | ${word(rnd)}` : base
  })
  const align = () => pick(rnd, [':---', '---:', ':--:', '---', ':-', '-', ':', '----'])
  const rows = randInt(rnd, 3)
  const lines = [`| ${cells(cols).join(' | ')} |`, `|${Array.from({ length: cols }, align).join('|')}|`]
  for (let i = 0; i < rows; i++) {
    // Ragged rows on purpose: a real author forgets a cell.
    const n = chance(rnd, 0.25) ? Math.max(1, cols - 1 - randInt(rnd, 2)) : cols
    lines.push(`| ${cells(n).join(' | ')} |`)
  }
  if (chance(rnd, 0.2)) lines.push('|')
  return lines.join('\n')
}

/**
 * Every block construct, weighted. The weights are rough "how often does this
 * turn up in a real page", with a floor of 1 on the rare ones so a soak run
 * covers them and an ordinary run still touches each of them several times.
 */
const BLOCKS = [
  [(r, mk) => proseLine(r, mk), 10],
  [(r, mk) => `${repeat('#', 1 + randInt(r, 6))} ${headingText(r, mk)}${chance(r, 0.2) ? ' ' + repeat('#', 1 + randInt(r, 3)) : ''}`, 6],
  [(r, mk) => `${repeat('#', 1 + randInt(r, 9))}${chance(r, 0.5) ? ' ' : ''}${headingText(r, mk)}`, 2],
  [(r, mk) => fence(r, true, mk), 5],
  [(r, mk) => repeat(' ', 1 + randInt(r, 6)) + fence(r, true, mk), 1],
  [(r, mk) => `${repeat('`', 3 + randInt(r, 3))}\n${word(r)} ${mk()}\n`, 1],
  [(r, mk) => listBlock(r, mk, 0), 8],
  [(r, mk) => listBlock(r, mk, 1), 3],
  [(r, mk) => quoteBlock(r, mk, 0), 4],
  [(r, mk) => callout(r, mk), 2],
  [(r, mk) => table(r, mk), 3],
  [(r, mk) => pick(r, ['---', '***', '___', '- - -', '------', '===', '*** * *', '   ---   ']), 2],
  // A footnote definition always brings its own reference. A definition nothing
  // points at is dropped by design — `doc.noteOrder` only collects ids that were
  // referenced, and the section is only emitted when that list is non-empty — so
  // an orphan definition is a token the token oracle would (correctly) report as
  // missing. Pairing them keeps the property about the renderer's *parsing*
  // rather than about its footnote policy.
  //
  // The pair also covers the case the policy is there for: a reference with no
  // definition, which must stay literal, is generated by the `[^…]` inline atoms.
  [(r, mk) => {
    const id = mk()
    return `See [${'^'}${id}] here.\n\n[^${id}]: ${word(r)} ${mk()}`
  }, 2],
  [(r, mk) => {
    const id = mk()
    return `See [${'^'}${id}] here.\n\n[^${id}]: ${word(r)}\n  ${word(r)} ${mk()}`
  }, 1],
  [(r, mk) => `[ref]: https://example.com/${word(r)} "${word(r)}"`, 2],
  [(r, mk) => (markupOn
    ? `[other]: <https://example.com/${word(r)}>`
    : `[other]: https://example.com/${word(r)}`), 1],
  [(r, mk) => `[dup]: https://first.example\n[dup]: https://second.example`, 1],
  [(r, mk) => useHostile(r), 4],
  [(r, mk) => repeat(useHostile(r), 1 + randInt(r, 6)), 2],
  [(r, mk) => `${word(r)}\n${pick(r, ['===', '---', '=='])}`, 1],
  [(r, mk) => `${' '.repeat(1 + randInt(r, 7))}${word(r)} ${mk()}`, 1],
  [(r, mk) => `\t${word(r)} ${mk()}`, 1],
  [(r, mk) => inlineSentence(r, mk), 12],
  [(r, mk) => repeat(word(r) + ' ', 1 + randInt(r, 30)).trim() + ' ' + mk(), 1],
  [(r, mk) => `| ${word(r)} ${mk()} |\n| --- |`, 1],
]

function headingText(rnd, mk) {
  const inline = 1 + randInt(rnd, 2)
  let out = ''
  for (let i = 0; i < inline; i++) out += `${pick(rnd, inlinePool)(rnd, mk)} `
  return out.trim()
}

function inlineSentence(rnd, mk) {
  const n = 1 + randInt(rnd, 4)
  const parts = []
  for (let i = 0; i < n; i++) parts.push(pick(rnd, inlinePool)(rnd, mk))
  return parts.join(pick(rnd, [' ', ' ', '  ', '\n', '']))
}

/** Several ordinary words on one line: the shape most of a real page is, and the
 * one whose failure would be loudest, because it is the only block type with no
 * markup around it to make a defect legible. */
function proseLine(rnd, mk) {
  const n = 2 + randInt(rnd, 8)
  const parts = []
  for (let i = 0; i < n; i++) parts.push(word(rnd))
  return `${parts.join(' ')} ${mk()}.`
}

/* ---------------- document assembly ---------------- */

const SEPARATORS = ['\n\n', '\n\n', '\n', '\n', '\n   ', '\n\n\n', '\n\r\n', '\n\t', ' \n']

/** Damaging mutations applied after assembly, which is where a generator earns
 * its keep: a document built only from well-formed blocks tests the happy path
 * of every rule, and the rules are where the bugs are one unbalanced character
 * away from being wrong. */
const MUTATORS = [
  (rnd, lines) => {
    const i = randInt(rnd, lines.length)
    lines.splice(i, 0, useHostile(rnd))
    return lines
  },
  (rnd, lines) => {
    if (!lines.length) return lines
    const i = randInt(rnd, lines.length)
    lines[i] = lines[i] + ' ' + useHostile(rnd)
    return lines
  },
  (rnd, lines) => {
    if (!lines.length) return lines
    const i = randInt(rnd, lines.length)
    lines[i] = lines[i] + lines[i]
    return lines
  },
  (rnd, lines) => {
    if (!lines.length) return lines
    const i = randInt(rnd, lines.length)
    lines[i] = lines[i].slice(0, Math.floor(lines[i].length * rnd()))
    return lines
  },
  (rnd, lines) => {
    if (!lines.length) return lines
    const i = randInt(rnd, lines.length)
    lines[i] = ' '.repeat(randInt(rnd, 12)) + lines[i]
    return lines
  },
  (rnd, lines) => {
    if (!lines.length) return lines
    const i = randInt(rnd, lines.length)
    lines[i] = lines[i].replace(/\S/, useHostile(rnd))
    return lines
  },
  (rnd, lines) => {
    const i = randInt(rnd, Math.max(1, lines.length))
    const j = randInt(rnd, Math.max(1, lines.length))
    const tmp = lines[i]
    lines[i] = lines[j]
    lines[j] = tmp
    return lines
  },
]

/**
 * Build one adversarial document.
 *
 * `markup: false` produces a document containing no raw HTML from the author.
 * That is the mode the structural properties use, because raw HTML in a body is
 * passed through on purpose (the CSP is the security boundary) — so "no unknown
 * tag in the output" is only a claim about the renderer on a document that has
 * no markup of its own to blame.
 *
 * The `deep` wrappers are what exercise the block emitter's recursion: every
 * level re-enters `emit`, and the paragraph/list/quote state machine is
 * re-initialised each time. A generator that only ever produced top-level blocks
 * would never notice a leaked buffer between those levels.
 */
export function fuzzDocument(rnd, { markup = true } = {}) {
  hostilePool = markup ? HOSTILE : HOSTILE_NO_MARKUP
  inlinePool = markup ? INLINE_ALL : INLINE
  markupOn = markup
  markerSeq = 0
  const mk = markup ? marker : markerNoMarkup
  const blocks = 1 + randInt(rnd, 10)
  const lines = []

  for (let i = 0; i < blocks; i++) {
    const atom = pickWeighted(rnd, BLOCKS)
    if (chance(rnd, 0.1)) lines.push('')
    lines.push(...String(atom(rnd, mk)).split('\n'))
  }

  const mutations = randInt(rnd, 4)
  for (let i = 0; i < mutations; i++) pick(rnd, MUTATORS)(rnd, lines)

  const deep = pickWeighted(rnd, [
    [(r) => lines, 6],
    [(r) => lines.map((l) => `- ${l}`), 2],
    [(r) => lines.map((l) => `  - ${l}`), 1],
    [(r) => lines.map((l) => `> ${l}`), 2],
    [(r) => lines.map((l) => `> > ${l}`), 1],
    [(r) => lines.map((l) => `> [!NOTE] ${l}`), 1],
    [(r) => ['- ' + lines[0], ...lines.slice(1)], 1],
  ])

  let src = deep(rnd).join(pick(rnd, SEPARATORS))
  if (chance(rnd, 0.06)) src = '\ufeff' + src
  if (chance(rnd, 0.04)) src = src + '\n' + useHostile(rnd)
  if (chance(rnd, 0.03)) src = src.replace(/\n/g, '\r')
  return src
}

/* ---------------- the HTML inspector ---------------- */

/** Elements the renderer is allowed to emit. Anything else in the output means
 * source text escaped escaping, which is both a visible defect and a security
 * one. Void elements never get a closing tag. */
const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'wbr', 'col'])

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&apos;': "'", '&nbsp;': '\u00a0',
}

/** Decode only the entities the renderer emits. A general HTML entity decoder
 * would let a double-escaped `&amp;lt;` look decoded and hide the bug. */
export function unescapeEntities(s) {
  return String(s).replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m])
}

const DANGEROUS_SCHEME = /^\s*(?:javascript|vbscript|livescript|mocha|data|blob|file):/i

/**
 * Parse the rendered HTML well enough to find the defects a reader sees.
 *
 * Returns the visible text, the tag/attribute inventory, and a list of
 * structural problems. The parser is deliberately strict and deliberately small:
 * it understands quotes and void elements, and treats anything it cannot parse
 * as a problem rather than guessing, because a lenient parser is how these
 * checks end up green over broken output.
 */
export function scanHtml(html) {
  const s = String(html)
  const errors = []
  const ids = []
  const refs = []
  const tags = []
  const codeRegions = []
  // Every byte of output that is tag syntax rather than text, so never visible to a
  // reader. A caller can then tell "the renderer dropped this text" from "the text is
  // inside a tag", which is a statement about the author's markup, not the renderer.
  //
  // It has to include *closing* tags, and it does not need them to be malformed.
  // HTML attributes may contain newlines, so an author's unclosed `<b>x</b` produces
  // a `</b …>` whose attribute region runs on across the rest of the paragraph, and a
  // browser parses those bytes as attribute names and discards them — exactly as this
  // does. The tag closes the right element, nothing is malformed, and the text is
  // still gone: a closing tag renders nothing but its `>`.
  const tagSyntax = []
  let text = ''
  let last = 0
  const stack = []
  let m

  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(s)) !== null) {
    text += s.slice(last, m.index)
    last = m.index + m[0].length

    const [raw, slash, name, attrText] = m
    const tag = name.toLowerCase()
    tagSyntax.push(raw)

    if (slash) {
      if (!stack.length) {
        errors.push(`stray </${tag}> with nothing open`)
      } else if (stack[stack.length - 1] !== tag) {
        errors.push(`</${tag}> closes <${stack[stack.length - 1]}> instead of itself`)
        const at = stack.lastIndexOf(tag)
        if (at === -1) {
          errors.push(`</${tag}> was never opened`)
        } else {
          stack.length = at
        }
      } else {
        stack.pop()
      }
      continue
    }

    const selfClosing = /\/\s*$/.test(attrText)
    // A `<` left inside a tag means an attribute value was not escaped, and the
    // browser's parser will recover differently from any reader of the source.
    if (attrText.includes('<')) errors.push(`raw < inside a tag: ${JSON.stringify(raw)}`)
    const attrs = {}
    let badAttr = null
    let a
    ATTR_RE.lastIndex = 0
    while ((a = ATTR_RE.exec(attrText)) !== null) {
      const key = a[1].toLowerCase()
      const value = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : ''
      if (key in attrs) badAttr = badAttr || `duplicate attribute ${key} in <${tag}>`
      attrs[key] = value
      if (/^on/.test(key)) badAttr = badAttr || `event handler attribute ${key} in <${tag}>`
      if (a[3] !== undefined || a[4] !== undefined) badAttr = badAttr || `unquoted attribute ${key} in <${tag}>`
    }
    if (badAttr) errors.push(badAttr)

    if (attrs.id !== undefined) ids.push({ id: attrs.id, tag, raw })
    // `rawValue` is the attribute exactly as it appears in the output, still
    // escaped. A caller checking for a quote breakout must look at that, not at
    // the unescaped value — an escaped `&quot;` is correct output, and
    // unescaping it is what manufactures a false positive.
    if (attrs.href !== undefined) {
      refs.push({ kind: 'href', value: unescapeEntities(attrs.href), rawValue: attrs.href, tag, raw })
    }
    if (attrs.src !== undefined) {
      refs.push({ kind: 'src', value: unescapeEntities(attrs.src), rawValue: attrs.src, tag, raw })
    }

    if (!VOID.has(tag) && !selfClosing) stack.push(tag)
    tags.push({ tag, attrs, raw })
  }
  text += s.slice(last)

  if (stack.length) errors.push(`unclosed at end of output: ${stack.join(' > ')}`)

  return { text: unescapeEntities(text), tagSyntax: tagSyntax.join('\n'), errors, ids, refs, tags, stack }
}

/** The raw text inside `<code>` elements, before un-escaping — used to prove
 * that code content cannot contain live markup. */
export function codeContents(html) {
  const out = []
  const re = /<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/g
  let m
  while ((m = re.exec(String(html))) !== null) out.push(m[1])
  return out
}

/** The text of an attribute-free tag region, used to check attribute values. */
export function attributeValues(html) {
  const out = []
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  let m
  while ((m = re.exec(String(html))) !== null) {
    let a
    ATTR_RE.lastIndex = 0
    while ((a = ATTR_RE.exec(m[2])) !== null) {
      out.push({ tag: m[1].toLowerCase(), key: a[1].toLowerCase(), value: a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '' })
    }
  }
  return out
}
