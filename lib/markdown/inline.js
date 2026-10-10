// Inline (span-level) Markdown: code spans, links, images, reference links,
// autolinks, footnote references, emphasis, strikethrough and backslash
// escapes.
//
// The pipeline is placeholder-based rather than AST-based: code spans and
// backslash escapes are lifted out into numbered placeholders, the text rules
// run over the reduced string, then the placeholders are restored. That keeps
// `**literal**` inside a code span and `` `code` `` inside emphasis correct
// without a full inline parser.
import { canonicalLink, referenceLink, renderImage, renderLink } from './links.js'
import { ESCAPE_RE, escapeHtml, safeUrl } from './sanitize.js'

// A *maximal* run of three or more of the same delimiter, opened and closed.
//
// Each of the single-run rules below sees only its own slice of a longer run,
// which is how `****bold****` came out as `*<strong><em>bold</em></strong>*`: the
// `***` rule started one character into a run of four and left the leftover `*`
// on the page. CommonMark pairs the runs as a whole, so four is two strongs and
// five wraps an emphasis around them. Both sides have to be at least three long
// — that keeps `**a *b* c**` on the ordinary rules, where it belongs.
//
// `(?<!\*)` / `(^|[^\w_])` make the run start where it actually starts: without
// them the engine can begin mid-run, and the underscores need the same intraword
// guard the single `_` rule uses so `snake_case____x` stays text.
const RUN_STARS = /(?<!\*)(\*{3,})(?!\s)([\s\S]+?)(?<!\s)(\*{3,})(?!\*)/g
const RUN_UNDERSCORES = /(^|[^\w_])(_{3,})(?!\s)([\s\S]+?)(?<!\s)(_{3,})(?!_)/g

// How a run of `n` delimiters nests. Four or more follows CommonMark
// (`____x____` → two strongs, `_____x_____` → emphasis around them). Three is
// the one case the `***` rule below already answered, and it is a tested answer,
// so three keeps it rather than silently reordering every `***…***` on the site.
function runTags(n) {
  if (n === 3) return ['<strong><em>', '</em></strong>']
  const strong = '<strong>'.repeat(Math.floor(n / 2))
  const close = '</strong>'.repeat(Math.floor(n / 2))
  return n % 2 === 0 ? [strong, close] : [`<em>${strong}`, `${close}</em>`]
}

// `[a](<https://x/a b>)` — the angle form, and the only place a destination may
// hold a space. Unwrapped here so the inline and reference rules agree about
// where a URL starts, instead of `links.js` having to know about brackets.
const unwrapDest = (u) => (u.startsWith('<') && u.endsWith('>') ? u.slice(1, -1) : u)

// Trailing punctuation that ends the sentence rather than the URL. A closing
// bracket goes only when it has no opener inside the URL, so `https://x/a_(b)`
// keeps its paren while `see https://x).` gives both back to the prose.
function trimUrlEnd(url) {
  let end = url.length
  while (end > 0 && '.,;:!?'.includes(url[end - 1])) end--
  for (const [close, open] of [[')', '('], [']', '['], ['}', '{']]) {
    while (end > 0 && url[end - 1] === close) {
      const head = url.slice(0, end)
      if (head.split(close).length > head.split(open).length) end--
      else break
    }
  }
  return [url.slice(0, end), url.slice(end)]
}

/**
 * An inline code span: a run of backticks, a body, and the *same* run again.
 *
 * Exported because the prose model in `test/unit/markdown-fuzz.test.js` has to
 * answer "is this `[^a]` inside a span?" with the same rule this file renders
 * with. The two used to be written separately — this one as a run match, that one
 * as "the next backtick anywhere" — and the difference is not academic: on a line
 * with an unclosed backtick, the old pairing swallowed every line beneath it, so
 * the model reported a reference the page correctly did not have.
 *
 * `(?<!`)` and `(?!`)` make the delimiters *runs*: the engine may not start
 * mid-run and may not stop inside one, which is what lets `` a ` b `` close at a
 * run of two rather than at the single backtick in the middle of it.
 */
export const CODE_SPAN_RE = /(?<!`)(`+)([\s\S]+?)\1(?!`)/g

// Creates the inline renderer for one document. `options` are the user-facing
// `markdown: { … }` feature flags, `doc` is the per-render document state that
// holds link definitions and the footnote order.
export function createInlineRenderer(options, doc) {
  const { links: linksOn, autolinks, footnotes, emphasis } = options

  // Whether this document defined any `[id]: url` at all. The pre-scan owns the
  // answer, and every reference form is a no-op without it — see the guard in
  // `render`. Computed once per document rather than per call, because `render`
  // runs once per line group and a document with no definitions should not pay
  // for the check repeatedly.
  const hasLinkDefs = Object.keys(doc.linkDefs).length > 0

  // Delimiter-aware emphasis. Strong runs are resolved first (so a single `*`
  // inside `**…**` stays available for nesting), then single-em runs. Guards
  // reject delimiters squeezed against whitespace or another delimiter, which
  // keeps pathology like `****` literal instead of mangled.
  function renderEmphasis(s) {
    if (!emphasis) return s
    return emphasisPasses(s, [])
  }

  // Emphasis runs are resolved strongest-first, so a single `*` inside `**…**` is
  // still available for nesting. That ordering has a hazard the earlier passes
  // create for the later ones: once `**a **` has become `<strong>a </strong>`, a
  // following rule can match a delimiter pair *across* the tags that were just
  // generated, because `<strong>` is ordinary text to the next regex.
  // `_____a _____b` came out as `___<strong>a <em></strong>_</em>b` — an `<em>`
  // closed by the tag that was supposed to close the `<strong>`, so the browser's
  // parser has to repair the nesting and the reader sees a stray `_`. Output the
  // renderer built must never be reinterpreted as its own input.
  //
  // So between passes, the tags generated so far are masked out with U+0002
  // placeholders: no delimiter character, not whitespace, and not `~`, so no
  // later rule can match through one.
  //
  // The registry (`masked`) is threaded through the recursion rather than created
  // per call, and that detail is load-bearing. A per-call registry unmasked its
  // own tags on the way out, which left a nested call looking at the *outer*
  // call's placeholders with an empty registry of its own — so it resolved them
  // to `undefined` and the page printed the word "undefined" inside the emphasis.
  // With one registry for the whole traversal, every placeholder is resolved by
  // the outermost call, which is the only one that has seen all of them.
  //
  // Masking is necessary but not sufficient on its own. The mask character is
  // not a word character, so it satisfies the `(^|[^\w*])` guard the single-
  // delimiter rules use to reject a delimiter glued to prose — which means a
  // delimiter pair can still pair *across* a masked tag, the very thing the mask
  // is there to prevent. The second half of the rule is therefore explicit: a
  // match whose tags do not nest inside it is not a delimiter pair at all and is
  // left literal. Nesting, not presence, is the test. `**<a href="…">Quick start</a>**`
  // has to match — that is how a bold link is written, and refusing it prints the
  // asterisks on the page — while `<a href="…">foo **</a> bar**`, which would open
  // a `<strong>` inside the anchor and close it outside, has to be refused. So
  // `crossesTag` walks the placeholders inside the match and counts depth: a
  // closing tag is one level out, an opening tag one level in, a void `<img>`
  // neither; a negative depth, or one still open at the end, refuses the match.
  // Only this renderer's own tags are masked, so `<img>` is the only void element
  // that can appear here. Raw HTML is deliberately left unmasked (README, "Raw
  // HTML in Markdown") and so is never considered.
  function emphasisPasses(s, masked) {
    // Every tag the renderer itself emits. `strong`, `em` and `del` come from the
    // passes below; `a`, `img` and `sup` are already in the string when this
    // function is first called, because links, images, autolinks and footnote
    // references all run earlier. Leaving those unmasked is how a link came out
    // wrapping an unbalanced `<em>`: `[r … [mail](mailto:x)` aside, the ordinary
    // case is an emphasis pair that pairs *across* a link's closing tag, giving
    // `<a …>a</a><em>…</a>`'s mirror image — `<em>` opened inside the anchor and
    // `</a>` emitted before `</em>`, so the browser's parser has to repair it.
    //
    // The alternation is an allowlist, not `<\/?[a-z][^>]*>`, because the author's
    // own raw HTML also lives in this string. A half-typed `<htt` would make a
    // general tag pattern swallow everything up to the next `>`, including
    // delimiter characters that still need to be seen. Raw HTML in a body is
    // passed through on purpose (README, "Raw HTML in Markdown"), so the tags the
    // renderer did not emit are left exactly as the author wrote them.
    const mask = (str) => str.replace(/<\/?(?:strong|em|del|a|img|sup)\b[^>]*>/gi, (tag) => {
      masked.push(tag)
      return `\u0002${masked.length - 1}\u0002`
    })
    // True when the tags inside `inner` would not nest inside whatever the
    // delimiters around them emit — see the note above `emphasisPasses`.
    const crossesTag = (inner) => {
      let depth = 0
      for (const t of inner.matchAll(/\u0002(\d+)\u0002/g)) {
        const tag = masked[Number(t[1])] || ''
        if (tag.startsWith('</')) {
          if (--depth < 0) return true
        } else if (!tag.startsWith('<img')) depth++
      }
      return depth !== 0
    }

    // Mask before the first pass, not after it, so that a delimiter pair cannot
    // reach across a tag that was already there on entry either.
    s = mask(s)
    // Long runs before every single-run rule, so they see the run whole.
    s = s.replace(RUN_STARS, (m, open, inner, close) => {
      if (!inner.trim() || crossesTag(inner)) return m
      const n = Math.min(open.length, close.length)
      const [openTag, closeTag] = runTags(n)
      return `${open.slice(n)}${openTag}${emphasisPasses(inner, masked)}${closeTag}${close.slice(n)}`
    })
    s = mask(s)
    s = s.replace(RUN_UNDERSCORES, (m, pre, open, inner, close) => {
      if (!inner.trim() || crossesTag(inner)) return m
      const n = Math.min(open.length, close.length)
      const [openTag, closeTag] = runTags(n)
      return `${pre}${open.slice(n)}${openTag}${emphasisPasses(inner, masked)}${closeTag}${close.slice(n)}`
    })
    s = mask(s)
    s = s.replace(/\*\*\*(?![\s*])([\s\S]+?)(?<!\s)\*\*\*/g, (m, inner) => {
      if (!inner.trim() || crossesTag(inner)) return m
      return `<strong><em>${emphasisPasses(inner, masked)}</em></strong>`
    })
    s = mask(s)
    s = s.replace(/\*\*(?![\s*])([\s\S]+?)(?<!\s)\*\*/g, (m, inner) => {
      if (!inner.trim() || crossesTag(inner)) return m
      return `<strong>${emphasisPasses(inner, masked)}</strong>`
    })
    s = mask(s)
    s = s.replace(/__(?![\s_])([\s\S]+?)(?<!\s)__/g, (m, inner) => {
      if (!inner.trim() || crossesTag(inner)) return m
      return `<strong>${emphasisPasses(inner, masked)}</strong>`
    })
    s = mask(s)
    s = s.replace(/(^|[^\w*])\*(?![\s*])([\s\S]+?)(?<!\s)\*(?!\*)/g, (m, pre, inner) => {
      if (!inner.trim() || crossesTag(inner)) return m
      return `${pre}<em>${emphasisPasses(inner, masked)}</em>`
    })
    s = mask(s)
    s = s.replace(/(^|[^\w_])_(?![\s_])([\s\S]+?)(?<!\s)_(?!_)/g, (m, pre, inner) => {
      if (!inner.trim() || crossesTag(inner)) return m
      return `${pre}<em>${emphasisPasses(inner, masked)}</em>`
    })
    s = mask(s)
    // Strikethrough runs last, inside this function rather than after it, for the
    // same reason the others are here: it is another delimiter rule that must not
    // reach across a tag an earlier pass generated. Run outside, `___~~___~~`
    // matched its `~~` pair *across* the `<strong>` boundary the `__` pass had just
    // built and came out as `_<strong><del></strong>_</del>` — the browser's parser
    // then has to repair the nesting, and the reader sees stray underscores. It
    // gets the same mask and the same `crossesTag` guard as the rest, so a `~~` pair
    // that reaches across a tag is left literal.
    s = s.replace(/~~([^~]+)~~/g, (m, inner) => {
      if (!inner.trim() || crossesTag(inner)) return m
      return `<del>${inner}</del>`
    })
    return s.replace(/\u0002(\d+)\u0002/g, (m, i) => masked[Number(i)])
  }

  // The inline renderer marks out code spans and backslash escapes with two C0
  // control characters, then restores them once the text rules have run. That
  // makes the marker characters part of the input's meaning, which a document
  // can collide with: `a \u0000<digits>\u0000` in the source restores to a code
  // span found *earlier in the same paragraph*, so its content appears a second
  // time somewhere the author never wrote it, and an out-of-range index restores
  // to the literal text "undefined". Both are visible on the page, and the
  // duplicate is the worse of the two because the rendered page then says
  // something the author did not write.
  //
  // So all three are dropped before any rule runs. They are C0 controls, which a
  // browser replaces with U+FFFD or discards outright, so no text a reader could
  // have seen is lost — and the marker schemes stop being reachable from the
  // document. `test/unit/markdown-fuzz.test.js` pins it: a generated document
  // containing these characters must never duplicate a span or print
  // "undefined".
  //
  // U+0002 is the third: the emphasis passes use it to hide the tags they have
  // already generated (see `emphasisPasses`).
  const PLACEHOLDER_CHARS_RE = /[\u0000\u0001\u0002]/g

  function render(str) {
    let s = String(str).replace(PLACEHOLDER_CHARS_RE, '')
    const codes = []
    const escapes = []

    // Backslash escapes first, so escaped ASCII punctuation can't trigger any
    // later inline rule (emphasis, code spans, links, images, autolinks).
    s = s.replace(ESCAPE_RE, (m, ch) => {
      escapes.push(escapeHtml(ch))
      return `\u0001${escapes.length - 1}\u0001`
    })

    // Protect inline code spans first so emphasis/bold rules can't touch
    // their contents. Placeholders are restored after all inline rules run.
    //
    // The opener is a *run* of backticks and the closer is the same run again, so
    // `` a ` b `` survives: the old one-backtick rule allowed a body with no
    // backtick at all, and it matched from the second backtick of a double — so a
    // span containing a backtick came out as three pieces of stray punctuation
    // around whatever the second pair happened to enclose.
    s = s.replace(CODE_SPAN_RE, (m, ticks, code) => {
      codes.push(escapeHtml(code))
      return `\u0000${codes.length - 1}\u0000`
    })

    // A hard line break: two or more trailing spaces, or a trailing backslash.
    // Resolved here rather than in the block emitter because everything that must
    // *not* break has already been lifted above — `\\` at the end of a line is a
    // literal backslash and is already a placeholder, and spaces inside a code
    // span are inside one too. Trailing spaces on the last line of a paragraph
    // have no newline after them and produce nothing, which is the right answer:
    // that is where a stray pair of spaces is most likely to be typed.
    s = s.replace(/(?: {2,}|\\)\n/g, '<br>\n')

    // `renderLink` returns null for a URL it refuses to link, which leaves the
    // construct as the literal text the author wrote. See links.js.
    //
    // Every one of these four rules is quadratic on its own. `[^\]]+` starts a
    // match at each `[` and then scans to the end of the string looking for a
    // `]` that never comes, so a document of n open brackets costs O(n²) — and
    // 16 000 of them took 2.4 seconds, which is a way to make a build hang from
    // a page nobody would notice was wrong. The guard below is a linear scan for
    // a substring the rule cannot match without, so the quadratic case never
    // starts. Prose without a bracket run pays one `indexOf`.
    if (s.includes('](')) {
      // The URL pattern allows one level of balanced parentheses, because the
      // obvious shorthand `[^)\s]+` stops at the first `)` and misreads a URL
      // that contains a call: `![b](data:text/html,alert(1))` parsed the source
      // as `data:text/html,alert(1`, refused it, and left the real closing
      // paren behind as a stray `)` in the middle of the page. CommonMark
      // balances parens here for the same reason.
      // A destination is either a `<…>` run — the only form that may contain a
      // space — or a run with no spaces, and it may be empty for `[a]()`. The `*`
      // rather than `+` is what makes the empty form match; every non-empty URL
      // still stops in the same place, because `)` and whitespace are excluded
      // exactly as they were before.
      const URL = '((?:<[^<>\\n]*>)|(?:[^()\\s]|\\([^()\\s]*\\))*)'
      // The label allows one level of balanced brackets, for the same reason and
      // against a worse failure. `[^\]]+` runs from an opening bracket to the
      // *first* closing one, so a stray `[` in prose claimed everything up to the
      // next `]`: in a document whose lines were joined by CRs, one stray `[r`
      // turned the next forty words into a single anchor, and the emphasis inside
      // it then closed outside the `</a>`. Matching brackets rather than
      // forbidding them keeps `[a [b] c](url)` working, which is what the author
      // meant, while `[r … [x](y)` no longer matches at the outer bracket — the
      // inner `[x](y)` is found on its own, and the stray `[` stays literal.
      const LABEL = '((?:[^\\[\\]]|\\[[^\\[\\]]*\\])*)'
      const LABEL1 = '((?:[^\\[\\]]|\\[[^\\[\\]]*\\])+)'

      s = s.replace(new RegExp(`!\\[${LABEL}\\]\\(${URL}(?:\\s+"([^"]*)")?\\)`, 'g'),
        (m, alt, src, title) => renderImage(alt, unwrapDest(src), title) || m)

      s = s.replace(new RegExp(`\\[${LABEL1}\\]\\(${URL}(?:\\s+"([^"]*)")?\\)`, 'g'),
        (m, text, url, title) => renderLink(text, unwrapDest(url), title) || m)
    }

    // The three reference forms can only produce a link when the document
    // actually defined one, and `referenceLink` returns null otherwise — so with
    // no definitions all three are provably no-ops and are skipped. This is the
    // common case: most pages have no `[id]: url` definitions at all.
    if (linksOn && hasLinkDefs) {
      // Same balanced-bracket label as the inline forms above, and for the same
      // reason: these rules resolve against the document's definitions, so a
      // greedy `[^\]]+` that claimed an unrelated `]` turned a stray bracket plus
      // a `[x][id]` further along the line into one large link.
      const REFLABEL = '((?:[^\\[\\]]|\\[[^\\[\\]]*\\])+)'
      if (s.includes('][')) {
        s = s.replace(new RegExp(`\\[${REFLABEL}\\]\\[([^\\]]+)\\]`, 'g'),
          (m, text, id) => referenceLink(text, id, doc.linkDefs) || m)
        s = s.replace(new RegExp(`\\[${REFLABEL}\\]\\[\\]`, 'g'),
          (m, text) => referenceLink(text, text, doc.linkDefs) || m)
      }
      s = s.replace(new RegExp(`\\[${REFLABEL}\\](?!\\()`, 'g'),
        (m, id) => referenceLink(id, id, doc.linkDefs) || m)
    }

    if (autolinks) {
      s = s.replace(/<((?:https?|ftp):\/\/[^<>\s]+)>/g, (m, url) => {
        const safe = safeUrl(url)
        return safe === '#' ? m : `<a href="${escapeHtml(safe)}">${escapeHtml(url)}</a>`
      })
      s = s.replace(/<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>/g, (m, email) => {
        return `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
      })

      // …and bare URLs, which is how people actually write them.
      //
      // Every tag is lifted first. The obvious target — the href="…" inside the
      // anchor just built — would otherwise be wrapped in a second anchor, and
      // that anchor’s text (usually the same URL again) would get a nested one,
      // which the browser then "repairs" into markup nobody wrote. Lifting all
      // tags rather than only anchors also leaves <img src="https://…"> and any
      // raw-HTML attribute alone, while text between tags stays reachable, so
      // "see https://x" inside a <div> still links.
      if (s.includes('http')) {
        const lifted = []
        const lift = (m) => {
          lifted.push(m)
          return '\u0002L' + (lifted.length - 1) + '\u0002'
        }
        const reduced = s
          .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, lift)
          .replace(/<[^>\n]+>/g, lift)
        s = reduced
          .replace(/(^|[^\w/:.-])(https?:\/\/[^\s<>"']+)/g, (m, pre, url) => {
            const [bare, rest] = trimUrlEnd(url)
            const safe = bare ? safeUrl(bare) : '#'
            if (safe === '#') return m
            return pre + '<a href="' + escapeHtml(safe) + '">' + escapeHtml(bare) + '</a>' + rest
          })
          .replace(/\u0002L(\d+)\u0002/g, (m, i) => lifted[Number(i)])
      }
    }

    // Footnote references. `[^id]` has no `(` or definition match, so it is
    // safe against the link rules above; unresolved references stay literal.
    if (footnotes) {
      s = s.replace(/\[\^([A-Za-z0-9_\-]+)\]/g, (m, id) => {
        if (!(id in doc.noteDefs)) return m
        // Whether *this* reference is the first, captured before the id joins the
        // order. Asking afterwards — `noteOrder.indexOf(id) === 0` — is wrong:
        // `render` runs once per block, and on a later block the id is already at
        // position 0, so every reference after the first was told it was the first
        // and the id was emitted again.
        const first = !doc.noteOrder.includes(id)
        if (first) doc.noteOrder.push(id)
        const n = doc.noteOrder.indexOf(id) + 1
        // Only the *first* reference gets the `fnref-` id. A second reference to
        // the same note repeats it, and a repeated id is not merely untidy: the
        // back-link at the bottom of the page has to name one element, so it
        // lands on whichever the browser happens to find first — which is the
        // first reference, not the one the reader just came from. The repeat
        // still links forward to the note and still shows the same number, which
        // is what the reader is actually looking at.
        const idAttr = first ? ` id="fnref-${id}"` : ''
        return `<sup class="footnote-ref"${idAttr}><a href="#fn-${id}">${n}</a></sup>`
      })
    }

    s = renderEmphasis(s)

    // Restore the escaped inline code spans, then backslash escapes.
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[Number(i)]}</code>`)
    s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => escapes[Number(i)])

    return s
  }

  return { render, renderEmphasis, canonicalLink }
}
