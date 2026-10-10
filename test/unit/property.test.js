// Property-based tests.
//
// The example-based tests elsewhere in this directory check the cases their
// author thought of. These check the cases they did not: for thousands of
// generated inputs, an invariant that must hold no matter what.
//
// Two rules shape this file:
//
//   1. No dependency. The generator is a 32-bit LCG (Numerical Recipes
//      constants) — deterministic, reproducible from a printed seed, and four
//      lines long. A fuzzing library would be more machinery than these
//      properties need, and would make a failure depend on a version bump.
//
//   2. Every failure must be debuggable. A failed property prints the seed that
//      produced it, so the exact input can be replayed, and shrinks the input
//      to a minimal failing case rather than dumping 200 characters of noise.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createMarkdown, escapeHtml, slugify } from '../../lib/markdown.js'
import { parseFrontmatter } from '../../lib/frontmatter.js'
import { esc, safeHref, slugify as utilsSlugify } from '../../lib/utils.js'

/* ---------------- the generator ---------------- */

/**
 * A 32-bit linear congruential generator.
 *
 * `s = (1664525 * s + 1013904223) mod 2^32` — the classic Numerical Recipes
 * constants, whose period is the full 2^32. `Math.imul` keeps the multiply in
 * 32-bit space; a plain `*` would lose precision in the float and quietly
 * shorten the period.
 */
function makeRandom(seed) {
  let s = seed >>> 0
  return function random() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const randInt = (rnd, n) => Math.floor(rnd() * n)
const pick = (rnd, list) => list[randInt(rnd, list.length)]

// Every invisible character below is written as an escape sequence on purpose.
// Typing the character itself puts raw bytes in this file, which turns it into
// what `file(1)` calls a binary file and makes the fixture itself unreadable.

/** C0 controls and DEL — the characters `safeHref` exists to reject. */
const CONTROLS = [
  '\u0000', '\u0001', '\u0007', '\u0008', '\u000b', '\u000c', '\u000e',
  '\u001b', '\u001f', '\u007f',
]

/** Invisible and line-separating characters, which read as ordinary spaces. */
const INVISIBLE = ['\u00a0', '\u200b', '\u200e', '\u2028', '\u2029', '\ufeff']

/**
 * Characters chosen to be hostile rather than merely random: HTML metacharacters
 * that matter for escaping, URL-scheme characters that matter for link
 * sanitizing, the punctuation that drives the Markdown parser, and non-ASCII
 * text so the tests cover input a human would never type but a generator or a
 * bad copy-paste will.
 */
const ALPHABET = [
  ...'abcXYZ019',
  ...' \t\n\r',
  ...'<>&"\'',
  ...'`*_~[]()#+-.!|>\\',
  ...':/?=&;%$@^{}',
  ...'javascript:data:vbscript:',
  ...'\u00e9\u00fc\u00f1\u0627\u0644\u064a\u65e5\u672c\u8a9e',
  ...CONTROLS,
  ...INVISIBLE,
  // Lone surrogates, via fromCharCode so the test file stays valid UTF-8. A
  // mis-encoded one would decode as U+FFFD and quietly stop testing this.
  String.fromCharCode(0xd800),
  String.fromCharCode(0xdfff),
]

/** A random string of `n` characters drawn from {@link ALPHABET}. */
function genString(rnd, n) {
  let out = ''
  for (let i = 0; i < n; i++) out += pick(rnd, ALPHABET)
  return out
}

/**
 * The same idea, restricted to characters Markdown has no syntax for.
 *
 * Used by the "plain prose survives" property, whose claim is only about prose.
 * Feeding it a backtick would be like testing that `"a*b"` survives intact and
 * then wondering why the asterisks went missing: the renderer did its job.
 */
const PROSE_ALPHABET = [...'abcXYZ019 ', ...'éüñالعربية日本語', ...'.,!?']
function genProse(rnd, n) {
  let out = ''
  for (let i = 0; i < n; i++) out += pick(rnd, PROSE_ALPHABET)
  return out
}

/**
 * JSON.stringify leaves DEL (U+007F) unescaped, so a shrunk input containing one
 * prints as if the byte were not there — and the report points at a string that
 * does not reproduce the failure. Escaping the invisible control characters
 * makes the minimal case actually copy-pasteable.
 */
function show(s) {
  return JSON.stringify(s).replace(/[\u007f-\u009f]/g, (c) =>
    `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/* ---------------- the runner ---------------- */

/**
 * Run `property` against generated inputs.
 *
 * `property` returns `true` when the input satisfies the invariant and a string
 * explaining why not otherwise. On failure the input is shrunk — halving, then
 * bisecting to the first character that still reproduces — and the reason is
 * recomputed for the shrunk input, so the report is a minimal case and not a
 * stale explanation of a larger one. "A 200-character string failed" is not a
 * bug report; "`<` failed" is.
 */
function forAll({ seed, cases, make, property, name }) {
  const failures = []
  for (let i = 0; i < cases; i++) {
    // Vary the seed per case so one unlucky generator stream cannot bias the run.
    const caseSeed = (seed + i * 2654435761) >>> 0
    const input = make(makeRandom(caseSeed))
    let outcome
    try {
      outcome = property(input)
    } catch (e) {
      outcome = `threw ${e.name}: ${e.message}`
    }
    if (outcome !== true) failures.push({ input, outcome, seed: caseSeed })
  }
  if (failures.length === 0) return

  const { input, seed: badSeed } = failures[0]
  let smallest = input
  let smallestOutcome = failures[0].outcome
  let lo = 0
  let hi = input.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const candidate = input.slice(0, mid)
    let failed
    try {
      failed = property(candidate) !== true
    } catch {
      failed = true
    }
    if (failed) {
      smallest = candidate
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  if (smallest.length !== input.length) {
    try {
      smallestOutcome = property(smallest)
    } catch (e) {
      smallestOutcome = `threw ${e.name}: ${e.message}`
    }
  }

  assert.fail(
    `${name}\n` +
    `  minimal failing input: ${show(smallest)}\n` +
    `  reason: ${smallestOutcome}\n` +
    `  ${failures.length}/${cases} cases failed; first came from seed ${badSeed}\n` +
    `  replay with makeRandom(${badSeed}); the unshrunk input was ${show(input)}`,
  )
}

const CASES = 500
const SEED = 20260930

/* ---------------- escaping ---------------- */

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
const unescape = (s) => s.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENTITIES[m])

test('property: escapeHtml neutralises all five HTML metacharacters', () => {
  forAll({
    name: 'escapeHtml must leave no bare < > " \' & behind',
    seed: SEED, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 40)),
    property: (input) => {
      const out = escapeHtml(input)
      if (typeof out !== 'string') return `returned ${typeof out}`
      // Remove the entities it is supposed to produce; whatever is left must not
      // contain a bare metacharacter.
      const residue = out.replace(/&(?:amp|lt|gt|quot|#39);/g, '')
      for (const ch of ['<', '>', '"', "'", '&']) {
        if (residue.includes(ch)) return `bare ${JSON.stringify(ch)} survived: ${JSON.stringify(out)}`
      }
      return true
    },
  })
})

test('property: escapeHtml is total and information-preserving', () => {
  // Escaping must not add, drop or mangle anything beyond the substitution
  // itself. Comparing the unescaped output against the input proves the
  // transformation round-trips — the property that actually matters, since
  // `esc` is applied to every author-controlled string on the way to the page.
  forAll({
    name: 'escapeHtml must accept anything and round-trip losslessly',
    seed: SEED + 1, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 40)),
    property: (input) => {
      const out = escapeHtml(input)
      if (unescape(out) !== input) {
        return `round trip lost data: ${JSON.stringify(input)} -> ${JSON.stringify(out)}`
      }
      return true
    },
  })
})

/* ---------------- one definition per rule ---------------- */

test('property: esc and escapeHtml cannot drift apart', () => {
  // These are the same function reached by two names — one for the renderer's
  // internals, one for the theme components. They used to be two independent
  // copies, and nothing noticed. Mutation testing found it: breaking one copy
  // left every test green, because every test imported one name and the other
  // was never exercised. This property is what makes the duplication
  // impossible rather than merely absent today.
  forAll({
    name: 'esc and escapeHtml must produce identical output for any input',
    seed: SEED + 15, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 40)),
    property: (input) => {
      const a = esc(input)
      const b = escapeHtml(input)
      if (a !== b) return `esc gave ${show(a)} but escapeHtml gave ${show(b)}`
      return true
    },
  })
})

test('property: slugify and utilsSlugify cannot drift apart', () => {
  // Same story, same reason. A heading anchor produced by the renderer and a
  // page slug produced by the theme must be the same string, or a table of
  // contents links to nowhere.
  forAll({
    name: 'slugify and utilsSlugify must produce identical output for any input',
    seed: SEED + 16, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 40)),
    property: (input) => {
      const a = slugify(input)
      const b = utilsSlugify(input)
      if (a !== b) return `slugify gave ${show(a)} but utilsSlugify gave ${show(b)}`
      return true
    },
  })
})

test('property: a missing value renders as nothing, not as the text "null"', () => {
  // `esc` normalizes null/undefined to the empty string; the renderer's own copy
  // used to stringify them, so a frontmatter key that was absent printed the word
  // "null" into the page. Pinning the behavior keeps the fix from being
  // "simplified" back away — and covers the falsy values that must still render,
  // since `0` and `false` are content.
  forAll({
    name: 'esc/escapeHtml must render only null and undefined as empty',
    seed: SEED + 17, cases: CASES,
    make: (rnd) => pick(rnd, [null, undefined, 0, false, NaN, '', '0', 'false', [], {}, 1, -1]),
    property: (input) => {
      const out = esc(input)
      if (input === null || input === undefined) {
        if (out !== '') return `${JSON.stringify(input)} rendered as ${show(out)}`
        return true
      }
      // Everything else goes through String(), so it keeps its text.
      if (out !== String(input)) return `${JSON.stringify(input)} rendered as ${show(out)}`
      return true
    },
  })
})

test('property: slugify preserves every character it is supposed to keep', () => {
  // The complement of the safety property above, and the one that catches the
  // subtler bug. `slugify` must not merely produce a *safe* string, it must
  // produce the *right* string — two different headings have to keep producing
  // different anchors, or a table of contents quietly collapses.
  //
  // The exact claim: with hyphens removed, the output equals the input's
  // keepable characters in order, lowercased. A dropped `.toLowerCase()` before
  // the character-class filter passes every "is this a safe slug" check while
  // turning `aX` into `a` instead of `ax` — a mutation-testing pass confirmed
  // 324 two-character inputs where the two orderings differ.
  forAll({
    name: 'slugify must keep every alnum the character class allows, in order',
    seed: SEED + 18, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 40)),
    property: (input) => {
      const expected = [...String(input || '').toLowerCase()]
        .filter((c) => /[a-z0-9\u0600-\u06ff]/.test(c)).join('')
      const actual = slugify(input).replace(/-/g, '')
      if (actual !== expected) {
        return `kept ${show(actual)} but the input's keepable characters are ${show(expected)} (from ${show(input)})`
      }
      return true
    },
  })
})

/* ---------------- link sanitizing ---------------- */

// The characters a browser ignores or removes when it works out a URL's scheme.
// Per the WHATWG URL standard, tab/LF/CR are removed from *anywhere* in the URL
// and leading/trailing C0 controls and spaces are trimmed — which is why
// `java<TAB>script:alert(1)` is a real XSS vector and why `safeHref` refuses any
// URL containing one of these rather than trying to strip them.
//
// Deliberately *not* in this set: NBSP, zero-width space, LRM and the BOM.
// Browsers percent-encode those rather than removing them, so they cannot be
// used to disguise a scheme, and rejecting them would mangle legitimate URLs
// pasted from a word processor. The generator emits all of them anyway, so this
// choice is pinned rather than assumed.
const STRIPPED_BY_URL_PARSER = /[\u0000-\u001f\u007f]/
const EXECUTABLE_SCHEME = /^(?:javascript|vbscript):/i

test('property: safeHref never returns something a browser would execute', () => {
  // The security boundary. Whatever the input — obfuscated with control
  // characters, padded with whitespace, mixed case, half-deleted — what comes
  // back must be inert.
  forAll({
    name: 'safeHref must never emit an executable or control-character URL',
    seed: SEED + 2, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 40)),
    property: (input) => {
      const out = safeHref(input)
      if (typeof out !== 'string') return `returned ${typeof out}`
      if (STRIPPED_BY_URL_PARSER.test(out)) return `control character survived: ${show(out)}`
      // With the stripped characters gone, the scheme is what the browser will
      // read — so test it the way the browser does, case-insensitively.
      const scheme = out.trim().toLowerCase()
      if (/^(?:javascript|vbscript|data):/.test(scheme)) return `executable scheme survived: ${show(out)}`
      return true
    },
  })
})

test('property: safeHref only lets data:image through when it is asked for an image', () => {
  // The `image` flag exists so `<img src="data:image/svg+xml,…">` works while
  // `<a href="data:text/html,…">` does not. This pins which side of that line
  // each input lands on.
  forAll({
    name: 'safeHref({ image: true }) must accept only data:image/',
    seed: SEED + 3, cases: CASES,
    make: (rnd) => pick(rnd, [
      'data:', 'data:image/png;base64,AAA', 'data:image/svg+xml,<svg/>',
      'data:text/html,<script>', 'data:text/html;base64,AAA',
      'data:IMAGE/PNG,x', ' data:image/png,x', 'xdata:image/png,x',
      'data:image/', 'data:image', 'data:imagex/png',
    ]) + genString(rnd, randInt(rnd, 8)).replace(/[\u0000-\u0020]/g, 'z'),
    property: (input) => {
      const out = safeHref(input, { image: true })
      const asSeen = out.replace(/[\u0000-\u001f\u007f]/g, '')
      if (!/^data:/i.test(asSeen)) return true
      if (!/^data:image\//i.test(asSeen)) return `non-image data: allowed for an image src: ${show(out)}`
      return true
    },
  })
})

test('property: safeHref does not over-reject well-formed links', () => {
  // The complement of the property above, and the one that catches a fix which
  // "hardens" safeHref by rejecting anything it does not recognise — that would
  // pass the security test while silently breaking every link on the site.
  // Preconditions are checked in the generator, not the property, so the
  // assertion states exactly what it claims.
  const SAFE_PREFIX = /^(?:https?:\/\/|mailto:|tel:|\/|#|\.\/|\.\.\/|\?)/i
  forAll({
    name: 'safeHref must pass a well-formed link through unchanged',
    seed: SEED + 4, cases: CASES,
    make: (rnd) => {
      const tail = genString(rnd, randInt(rnd, 24))
        // Keep the tail free of control characters and scheme introducers, so
        // the generated string really is a well-formed link. DEL has to go too:
        // `safeHref` rejects any URL containing one, and `JSON.stringify` leaves
        // it invisible, which makes such a case look inexplicable in a report.
        .replace(/[\u0000-\u0020\u007f]/g, 'x')
        .replace(/:/g, 'z')
      return pick(rnd, ['https://example.com/', 'http://example.com/', 'mailto:a@b.co/', 'tel:+1234', '/blog/', '#section', './rel', '../up', '?q=1']) + tail
    },
    property: (input) => {
      if (!SAFE_PREFIX.test(input)) return true
      const out = safeHref(input)
      if (out !== input.trim()) return `a well-formed link was altered: ${JSON.stringify(input)} -> ${JSON.stringify(out)}`
      return true
    },
  })
})

/* ---------------- slugs ---------------- */

const SAFE_SLUG = /^[a-z0-9\u0600-\u06ff-]*$/

test('property: slugify always produces a URL-safe anchor', () => {
  forAll({
    name: 'slugify output must be a bare lowercase anchor',
    seed: SEED + 5, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 40)),
    property: (input) => {
      const slug = slugify(input)
      if (typeof slug !== 'string') return `returned ${typeof slug}`
      if (!SAFE_SLUG.test(slug)) return `unsafe slug ${JSON.stringify(slug)}`
      // A leading or trailing hyphen makes an anchor that looks valid in markup
      // and does not resolve in a URL.
      if (slug.startsWith('-') || slug.endsWith('-')) return `edge hyphen: ${JSON.stringify(slug)}`
      return true
    },
  })
})

test('property: slugify is idempotent', () => {
  // Heading ids are derived from text and can end up nested (a slug rendered as
  // a heading, a link text reused as a title). Re-slugging must be a no-op or an
  // id drifts every time it passes through.
  forAll({
    name: 'slugify(slugify(x)) must equal slugify(x)',
    seed: SEED + 6, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 40)),
    property: (input) => {
      const once = slugify(input)
      const twice = slugify(once)
      if (once !== twice) return `${JSON.stringify(once)} became ${JSON.stringify(twice)}`
      return true
    },
  })
})

/* ---------------- frontmatter ---------------- */

test('property: parseFrontmatter always returns a well-formed result and never throws', () => {
  forAll({
    name: 'parseFrontmatter must return { data, body, diagnostics } for any input',
    seed: SEED + 7, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 60)),
    property: (input) => {
      const out = parseFrontmatter(input)
      if (!out || typeof out !== 'object') return `returned ${typeof out}`
      if (typeof out.body !== 'string') return `body was ${typeof out.body}`
      // `data` must never be null: every caller reads `data.title`, so a null
      // here surfaces as a TypeError deep inside a page render, with nothing in
      // the stack trace pointing at the malformed file that caused it.
      if (out.data === null || typeof out.data !== 'object') {
        return `data was ${out.data === null ? 'null' : typeof out.data}`
      }
      if (!Array.isArray(out.diagnostics)) return `diagnostics was ${typeof out.diagnostics}`
      for (const d of out.diagnostics) {
        if (!d || typeof d.message !== 'string') return `diagnostic without a message: ${JSON.stringify(d)}`
        if (!Number.isInteger(d.line)) return `non-integer diagnostic line: ${JSON.stringify(d.line)}`
      }
      return true
    },
  })
})

test('property: a reported diagnostic points at a line that exists', () => {
  // `jprot check` prints `file:line` and an editor jumps there. Line 0, or a
  // line past the end of the document, sends the author somewhere that is not
  // the problem.
  forAll({
    name: 'a diagnostic line must be within the document',
    seed: SEED + 8, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 60)),
    property: (input) => {
      const lineCount = input.split(/\r?\n/).length
      for (const d of parseFrontmatter(input).diagnostics) {
        if (d.line < 1 || d.line > lineCount) {
          return `line ${d.line} reported for a ${lineCount}-line document`
        }
      }
      return true
    },
  })
})

test('property: an unterminated frontmatter fence is reported, never silently accepted', () => {
  // A document that opens with `---` promises a `---` will close it. Either the
  // promise is kept or the author gets a diagnostic. Silently succeeding hands
  // the entire file — prose included — to the YAML parser.
  forAll({
    name: 'an unterminated fence must produce a diagnostic',
    seed: SEED + 9, cases: CASES,
    make: (rnd) => '---\n' + genString(rnd, 1 + randInt(rnd, 50)).replace(/\n/g, ' '),
    property: (input) => {
      const { diagnostics } = parseFrontmatter(input)
      // This generator never emits a closing fence on its own line, so there is
      // nothing for a well-formed document to close with.
      if (diagnostics.length === 0) return 'no diagnostic for an unterminated fence'
      return true
    },
  })
})

test('property: a closed frontmatter block leaves the body byte-for-byte intact', () => {
  // The complement: `parseFrontmatter` must not eat one character more than the
  // fence it matched. Silently truncating a document is the worst failure mode
  // for a content pipeline — the page still builds, just shorter.
  forAll({
    name: 'body must equal the source minus exactly the frontmatter block',
    seed: SEED + 10, cases: CASES,
    make: (rnd) => {
      const body = genString(rnd, randInt(rnd, 40)).replace(/\n/g, ' ')
      const keys = ['title', 'description', 'date', 'draft', 'tags']
      const front = pick(rnd, keys) + ': ' + genString(rnd, randInt(rnd, 12)).replace(/\n/g, ' ')
      return `---\n${front}\n---\n${body}`
    },
    property: (input) => {
      const { body } = parseFrontmatter(input)
      const fence = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/m.exec(input)
      if (!fence) return 'the generator produced an unterminated fence'
      if (body !== input.slice(fence[0].length)) {
        return `body mismatch:\n  source ${JSON.stringify(input)}\n  body   ${JSON.stringify(body)}`
      }
      return true
    },
  })
})

test('property: every key written in the frontmatter survives into the data', () => {
  // Random text almost never produces a *well-formed* frontmatter block, so the
  // properties above could only ever assert "does not throw". This one generates
  // actual YAML — keys and values from a fixed vocabulary, with the occasional
  // deliberate defect — and then asserts the only property that actually matters
  // to an author: the metadata they typed is readable.
  //
  // Mutation testing earned this test. Dropping the parser's
  // "Expected key: value" diagnostic passed every property above, because a
  // dropped line is silent: `data` simply lacks the key, and the page renders
  // with the field missing and no explanation.
  const KEYS = ['title', 'description', 'date', 'draft', 'weight', 'tags', 'image', 'lang']
  const VALUES = ['Hello world', '123', '-4.5', 'true', 'false', 'null', '[a, b, c]', '"quoted"', "'single'", '2026-01-01']

  forAll({
    name: 'a key present in the source must be present in parseFrontmatter().data',
    seed: SEED + 20, cases: CASES,
    make: (rnd) => {
      const lines = []
      const expected = new Set()
      const count = 1 + randInt(rnd, 6)
      for (let i = 0; i < count; i++) {
        const key = pick(rnd, KEYS)
        // One in six lines is a deliberate defect: a bare word with no colon,
        // or a stray tab. The parser is expected to survive it *and* complain.
        if (rnd() < 1 / 6) {
          lines.push(pick(rnd, ['bare word with no colon', '\tstray tab line', '   ', 'just some prose']))
          continue
        }
        lines.push(`${key}: ${pick(rnd, VALUES)}`)
        expected.add(key)
      }
      return { source: `---\n${lines.join('\n')}\n---\nBody text.`, expected: [...expected] }
    },
    property: ({ source, expected }) => {
      const { data } = parseFrontmatter(source)
      for (const key of expected) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) {
          return `key ${JSON.stringify(key)} vanished; data has ${JSON.stringify(Object.keys(data))}`
        }
      }
      return true
    },
  })
})

test('property: a malformed frontmatter line is reported, not silently skipped', () => {
  // The complement of the previous test. A line the parser cannot read as
  // `key: value` is a mistake in the author's file, and the only useful thing
  // JPROT can do is say so. Dropping this diagnostic passed every other
  // property here: the line is still skipped, `data` still has every valid key,
  // and the frontmatter still parses — so the author's typo simply vanishes.
  forAll({
    name: 'a line that is not "key: value" must produce a diagnostic',
    seed: SEED + 23, cases: CASES,
    make: (rnd) => {
      // Only bare lines the parser genuinely cannot read. Note what is *not*
      // here: a line starting with `#` is a comment and blank lines are ignored,
      // so `###` and `   ` would correctly produce no diagnostic — and a
      // generator that included them would be asserting a bug.
      const bad = ['bare word', 'another bare line', '!!!', '???', 'just prose here', '@@@', '***', '---extra']
      const lines = [`title: Hello`, pick(rnd, bad), `description: x`]
      return `---\n${lines.join('\n')}\n---\nBody.`
    },
    property: (input) => {
      // Domain guard. The shrinker hands this property arbitrary prefixes, and a
      // prefix that no longer contains a bare line has nothing to complain
      // about. Without this, the property would "fail" on `""` and the report
      // would name an input the generator cannot produce.
      if (!/^---/.test(input)) return true
      const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(input)
      if (!fence) return true
      const hasBareLine = fence[1].split(/\r?\n/).some((l) => l.trim() && !l.includes(':'))
      if (!hasBareLine) return true

      const { diagnostics } = parseFrontmatter(input)
      const malformed = diagnostics.filter((d) => /Expected "key: value"/.test(d.message))
      if (malformed.length === 0) return `no diagnostic for a malformed line in ${show(input)}`
      return true
    },
  })
})

test('property: a duplicate key is reported at the exact file line of the second occurrence', () => {
  // A duplicated frontmatter key means one of the two values is silently
  // ignored. The parser does warn about it — the property is that the warning
  // carries the *exact* line number, because `reportFrontmatterDiagnostics`
  // prints `${file}:${line}` and an editor jumps straight there. Getting this
  // wrong is not cosmetic: the parser originally numbered lines from the start of
  // the YAML block, so every diagnostic pointed one line above the real problem,
  // and an author was sent to the wrong line to fix it.
  forAll({
    name: 'a duplicated key must be reported at the second occurrence\'s file line',
    seed: SEED + 21, cases: CASES,
    make: (rnd) => {
      // Distinct keys only, so the inserted duplicate is the *only* collision.
      // Repeating a key here would produce two diagnostics and make "the reported
      // line" ambiguous — the parser correctly reports every collision, and this
      // property is about line arithmetic, not about that.
      const count = 2 + randInt(rnd, 4)
      const keys = [...KEYS_FOR_DUPES].sort(() => rnd() - 0.5).slice(0, count)
      const lines = keys.map((k) => `${k}: value ${k}`)
      const at = randInt(rnd, lines.length)
      // Put the copy immediately *after* its original. The parser warns when it
      // assigns a key it already holds, so the diagnostic belongs to the second
      // occurrence — the copy, at index `at + 1`.
      lines.splice(at + 1, 0, `${keys[at]}: duplicate`)
      // File line = index in `lines` + 2, because file line 1 is the `---` fence.
      return { source: `---\n${lines.join('\n')}\n---\nBody.`, expectedLine: at + 3 }
    },
    property: ({ source, expectedLine }) => {
      const { diagnostics } = parseFrontmatter(source)
      const duplicates = diagnostics.filter((d) => /Duplicate frontmatter key/.test(d.message))
      if (duplicates.length === 0) return 'a duplicated key was accepted without a diagnostic'
      for (const d of duplicates) {
        // Exactly this line, not merely a line that exists — an off-by-one here is
        // a wrong jump target and nothing else would notice.
        if (d.line !== expectedLine) {
          const reported = source.split('\n')[d.line - 1]
          return `reported line ${d.line} (${show(reported)}), but the duplicate "${KEYS_FOR_DUPES.find((k) => source.split('\n')[expectedLine - 1].startsWith(k + ':'))}" is on line ${expectedLine}`
        }
      }
      return true
    },
  })
})

test('property: every diagnostic line is a real line of the real file', () => {
  // The pair to the property above, and the check that keeps the two honest: a
  // diagnostic must land inside the document the author is editing. This also
  // pins the fence offset, since the opening `---` is file line 1 and the first
  // YAML line is file line 2 — an off-by-one in either direction shows up as a
  // line that is out of range or points at the wrong text.
  forAll({
    name: 'diagnostic lines must address a line of the source document',
    seed: SEED + 22, cases: CASES,
    make: (rnd) => {
      const count = 2 + randInt(rnd, 5)
      const lines = []
      for (let i = 0; i < count; i++) lines.push(`${pick(rnd, KEYS_FOR_DUPES)}: value ${i}`)
      if (rnd() < 0.5) lines.push(pick(rnd, ['bare word', '\tstray tab', '  ', 'prose here']))
      return `---\n${lines.join('\n')}\n---\nBody.`
    },
    property: (input) => {
      const fileLines = input.split(/\r?\n/)
      for (const d of parseFrontmatter(input).diagnostics) {
        if (d.line < 1 || d.line > fileLines.length) {
          return `line ${d.line} is outside a ${fileLines.length}-line document`
        }
        // A line number is only useful if it addresses text. Landing on the
        // closing fence or the body means the offset is wrong.
        const text = fileLines[d.line - 1]
        if (text === undefined || /^---\s*$/.test(text) || /^Body\./.test(text)) {
          return `line ${d.line} addresses ${JSON.stringify(text)}, which cannot be the problem`
        }
      }
      return true
    },
  })
})

const KEYS_FOR_DUPES = ['title', 'description', 'date', 'draft']

/* ---------------- markdown rendering ---------------- */

const md = createMarkdown()

test('property: render never throws, for any input', () => {
  // The widest property here and the most valuable: a crash in the block or
  // inline parser takes down a page render, and a page render is what a visitor
  // sees. `test/unit/markdown.test.js` covers intended syntax; this covers
  // everything the author did not think to write down.
  forAll({
    name: 'createMarkdown().render must accept any string and return a string',
    seed: SEED + 11, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 120)),
    property: (input) => {
      const out = md.render(input)
      if (typeof out !== 'string') return `render returned ${typeof out}`
      return true
    },
  })
})

test('property: render is deterministic, with no state leaking between calls', () => {
  // Footnote numbering and duplicate-heading ids are document-scoped. If any of
  // that state escaped between calls, the second render of the same text would
  // come out different — which an author experiences as heading anchors that
  // change as they edit the file above them.
  forAll({
    name: 'rendering the same text twice must give the same HTML',
    seed: SEED + 12, cases: CASES,
    make: (rnd) => genString(rnd, 1 + randInt(rnd, 120)),
    property: (input) => {
      const a = md.render(input)
      const b = md.render(input)
      if (a !== b) return `second render differed:\n  ${JSON.stringify(a)}\n  ${JSON.stringify(b)}`
      return true
    },
  })
})

test('property: no href or src in rendered HTML carries an executable scheme', () => {
  // Link and image destinations go through `safeHref`, so nothing the renderer
  // emits may navigate somewhere that runs code. Asserted on the parsed
  // attribute values rather than by scanning for the word "javascript", which
  // would also trip over that word appearing correctly as escaped *text*.
  forAll({
    name: 'rendered href/src values must never be executable',
    seed: SEED + 13, cases: CASES,
    make: (rnd) => {
      const schemes = [
        'javascript:', 'JaVaScRiPt:', 'java\tscript:', ' javascript:', 'java\nscript:',
        'data:text/html,', 'data:text/html;base64,', 'vbscript:', 'VBScript:',
      ]
      const shape = pick(rnd, ['[t](%s)', '![i](%s)', '[t](%s "title")', '[t][%s]', '> [t](%s)', '[%s]: %s'])
      const payload = genString(rnd, randInt(rnd, 10)).replace(/[\u0000-\u0020]/g, 'x')
      const scheme = pick(rnd, schemes) + payload
      return shape.includes('%s', 2) ? shape.replace(/%s/g, scheme) : shape.replace('%s', scheme)
    },
    property: (input) => {
      const out = md.render(input)
      for (const m of out.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
        const asSeen = m[1].replace(/[\u0000-\u0020]/g, '')
        if (/^(?:javascript|vbscript):/i.test(asSeen)) return `executable URL survived: ${JSON.stringify(m[1])}`
        if (/^data:/i.test(asSeen) && !/^data:image\//i.test(asSeen)) {
          return `non-image data: URL survived: ${JSON.stringify(m[1])}`
        }
      }
      return true
    },
  })
})

test('property: heading anchors and footnote numbers are stable across renders', () => {
  // Random text almost never begins a line with `#` or `[^`, so the property
  // above — which renders random strings twice — almost never reaches the two
  // features that carry *document-scoped* state: duplicate-heading disambiguation
  // and footnote ordering. A mutation that made the renderer share that state
  // between calls survived it, and would have shipped as heading anchors that
  // renumber themselves every time a page is re-rendered.
  //
  // So this property generates the syntax deliberately.
  forAll({
    name: 're-rendering a document must not renumber its heading ids or footnotes',
    seed: SEED + 24, cases: CASES,
    make: (rnd) => {
      const blocks = []
      const n = 1 + randInt(rnd, 5)
      for (let i = 0; i < n; i++) {
        const word = genProse(rnd, 3 + randInt(rnd, 8)).trim()
        const roll = rnd()
        if (roll < 0.4) {
          // Duplicate heading text on purpose: the second must become `-2`.
          blocks.push(`## ${pick(rnd, ['Intro', 'Setup', 'Notes', 'نظرة عامة'])}`)
        } else if (roll < 0.7) {
          blocks.push(`## ${word}`)
        } else if (roll < 0.9) {
          blocks.push(`Some prose with a note[^a] inline.`)
        } else {
          blocks.push(`[^a]: The footnote body ${word}`)
        }
      }
      return blocks.join('\n\n')
    },
    property: (input) => {
      // Domain guard: a prefix with no heading and no footnote in it exercises
      // none of the document-scoped state this property is about.
      if (!/^#{1,6} /m.test(input) && !/\[\^/.test(input)) return true
      const a = md.render(input)
      const b = md.render(input)
      if (a !== b) {
        return `second render differed:\n  first:  ${show(a).slice(0, 220)}\n  second: ${show(b).slice(0, 220)}`
      }
      // Also stable after an unrelated document has been rendered in between —
      // the failure mode of shared state is order-dependent, not immediate.
      md.render('# Unrelated\n\ntext[^z]\n\n[^z]: other')
      const c = md.render(input)
      if (a !== c) {
        return `render differed after an unrelated document:\n  before: ${show(a).slice(0, 220)}\n  after:  ${show(c).slice(0, 220)}`
      }
      return true
    },
  })
})

test('property: a duplicate heading gets a distinct anchor, and the first keeps the plain one', () => {
  // The user-visible consequence of the property above: a table of contents with
  // two "Setup" sections has to link to two different places, and the first one
  // has to keep the id a reader might already have bookmarked.
  forAll({
    name: 'repeated heading text must yield distinct ids',
    seed: SEED + 25, cases: CASES,
    make: (rnd) => {
      const title = pick(rnd, ['Intro', 'Setup', 'Notes', 'نظرة عامة', 'a b c'])
      const n = 2 + randInt(rnd, 4)
      return Array.from({ length: n }, () => `## ${title}`).join('\n\n')
    },
    property: (input) => {
      // Domain guard: the shrinker feeds this property prefixes, and a prefix
      // with no heading in it has nothing to assert.
      if (!/^#{1,6} /m.test(input)) return true
      const headings = []
      md.render(input, headings)
      if (headings.length === 0) return true
      const ids = headings.map((h) => h.id)
      if (new Set(ids).size !== ids.length) return `duplicate ids: ${show(JSON.stringify(ids))}`
      // The first occurrence keeps the unsuffixed id — a reader may already have
      // bookmarked it.
      const base = slugify(headings[0].text)
      if (ids[0] !== base) return `first heading got id ${JSON.stringify(ids[0])}, expected ${JSON.stringify(base)}`
      return true
    },
  })
})

test('property: plain prose survives parseFrontmatter and render', () => {
  // End to end over the two stages a content file passes through. The input is
  // drawn from an alphabet Markdown has no syntax for, so the claim is exactly
  // what it says: a paragraph that is only words and spaces comes out the
  // other side, whole. A vanishing word is a real bug; a turned `*` is not, which
  // is why the punctuation lives in the *other* tests.
  forAll({
    name: 'plain prose must survive parseFrontmatter and render',
    seed: SEED + 14, cases: CASES,
    make: (rnd) => genProse(rnd, 1 + randInt(rnd, 80)),
    property: (input) => {
      const { body } = parseFrontmatter(input)
      if (body !== input) return `parseFrontmatter altered a bodyless document: ${JSON.stringify(input)} -> ${JSON.stringify(body)}`
      const words = input.trim().split(/\s+/).filter((w) => w.length > 2)
      if (words.length === 0) return true
      const out = md.render(body)
      for (const word of words) {
        if (!out.includes(word)) return `word ${JSON.stringify(word)} vanished from ${JSON.stringify(out)}`
      }
      return true
    },
  })
})
