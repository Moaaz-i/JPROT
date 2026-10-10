# Changelog

All notable changes to JPROT are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

A Markdown release: nine things writers actually type now render the way the
spec says, measured against CommonMark 0.31.2 — 225 → 274 examples identical and
365 → 408 usable (56.0% → 62.6%), with the five "unlicensed damage" cases
unchanged at 0.8%.

### Added

- **Setext headings.** `Heading\n===` and `Heading\n---` render as `<h1>`/`<h2>`.
  The rule is tested *before* the thematic break, so a rule between two
  paragraphs still renders as one — the blank line is what says so — and `- foo`
  followed by `---` is still a list and then a rule, as the spec has it.
- **`~~~` code fences**, matched on the opening character: a document that shows
  a tilde fence inside a backtick one no longer gets cut in half. `fence.js` now
  exports one `fenceStep()` state machine, used by the block emitter, the
  definition pre-scan and the fuzz suite's prose model alike. They used to
  re-type the toggle independently, and a fence one side can see while another
  cannot is a line that is counted but never stored — text leaving the page with
  no error anywhere.
- **Hard line breaks** from a trailing backslash as well as two trailing spaces.
  Both are resolved after escapes and code spans have been lifted, so `\\` at the
  end of a line stays a literal backslash, spaces inside a code span stay inside
  the span, and trailing spaces on the *last* line of a paragraph produce
  nothing.
- **Bare-URL autolinks** (`visit https://example.com`), behind the existing
  `markdown.autolinks` flag. Every tag is lifted first, so the `href` inside an
  anchor the renderer just built — and that anchor's own text — never gains a
  second one, and an `<img src="https://…">` is left alone. Trailing punctuation
  returns to the sentence, and a closing bracket only when it has no opener
  inside the URL.
- **`<…>` link destinations** — `[a](<https://x.com/a b>)`, the one form that may
  contain a space — and **the empty form**, `[a]()`, which now writes `href=""`
  instead of being read as a rejected URL and left as text.
- **Code spans delimited by a longer run of backticks**, so a span can hold a
  backtick of its own without ending early. The single-backtick rule is
  unchanged, so no existing span changes meaning.

### Fixed

- **A bold link printed its own asterisks: `**[Quick start](quick-start.md)**`
  came out as `**<a href="…">Quick start</a>**`.** Emphasis refuses any pair
  whose content holds a tag, so that the pair cannot open an element inside a tag
  and close it outside it — but that refusal was on *presence*, and a delimiter
  pair sitting around a whole link is exactly the balanced case. Every bold link
  on the index page rendered as literal asterisks. The test is now nesting: the
  placeholders inside the match are walked for depth, a closing tag is one level
  out and an opening tag one level in (a void `<img>` neither), and a negative
  depth or one still open at the end still refuses the pair. Emphasis wrapping a
  link, an image or an autolink now matches, as CommonMark has it; an emphasis
  pair crossing an anchor's boundary stays literal.
- **`****bold****` came out as `*<strong><em>bold</em></strong>*`.** Each
  single-run rule saw only its own slice of a longer run, so the `***` rule
  started one character into a run of four and left a literal `*` on either side
  of the page. Runs of three or more are now paired as a whole, which is what
  CommonMark says: four is two strongs, five wraps an emphasis around them.
  `____bold____` and `___bold___` were wrong the same way. The intraword guard on
  `_` was kept, so `snake_case` is still an identifier.
- **A code span containing a backtick was read as three pieces of stray
  punctuation.** The old rule allowed a body with no backtick at all and matched
  from the second backtick of a double.

### Not added, deliberately

- **Indented code blocks.** Four spaces of indent render as prose. Every other
  block rule is answered from one line at a time, which is what lets the
  definition pre-scan and the prose model re-derive the same answer; this one is
  answered from the emitter's position in the container tree, which a flat scan
  cannot see. Tried, and the fuzz suite failed 29 of 30 seeds for it: a `[^a]` on
  an indented line was prose to the model and code to the emitter, so the
  definition beneath it was skipped with its body rendered nowhere.

## [0.9.1] - 2026-10-07

A focused correctness release: a content-parsing bug that silently truncated
pages, the VS Code extension's highlighting finally reaching editors, and a
README that now describes the extension that exists.

### Fixed

- **Frontmatter could be detected in the middle of a file.** The opening regex
  in `parseFrontmatter` carried the `m` flag, so `^---` matched the first line
  that *looked* like a fence anywhere in the document — while `body` was sliced
  from `match[0].length`, which assumes index 0. Any page with a fenced
  `--- / key: value / ---` example lost its opening bytes on load, and
  `content/frontmatter.md`, which documents that very rule, silently dropped its
  first 19 characters (`"ence\n\nThe block between…"`). The block is now
  required at byte 0, as documented, and `body` is sliced from `match.index`, so
  an index that ever is not 0 becomes a wrong result rather than a truncated
  document. Three tests cover it, one reading the shipped reference page from
  disk so the parser and its own documentation cannot drift apart.
- **The VS Code extension's highlighting never reached an editor** (`jprot-vscode`
  0.2.1, 0.2.2). `injectTo` targeted `source.markdown`, a scope no VS Code or
  Cursor build has ever shipped, and the contribution also claimed
  `language: "markdown"` — which would have made four JPROT rules *replace* the
  built-in Markdown grammar for every `.md` file. With that repaired the next
  bug surfaced: the frontmatter rule used one regex for `begin` and `end`, so the
  closing `---` reopened it, `meta.embedded.block.frontmatter` stayed open to
  end-of-file, and every heading, link and fenced block after the frontmatter
  lost all highlighting. `jprot-vscode/test/grammar.test.js` now pins the scope,
  the anchor and the selector; details in `jprot-vscode/CHANGELOG.md`.
- **The incremental-export fixture failed on Node 18 only.** The site fixture
  wrote `theme/components/Footer.js` and a `jprot.config.js` into a temp dir with
  no `package.json`, so Node 18 parsed them as CommonJS
  (`[jprot] could not load component "Footer" … Unexpected token 'export'`).
  Node 20.19+/22 sniff ESM, which is why only the Node 18 leg of the matrix went
  red. The fixture now writes `{ "private": true, "type": "module" }`, the same
  thing `scaffoldSite` has always written.

### Changed

- **README — editor tooling now describes the extension that exists.** It still
  advertised the 0.1.0 live preview, the activity-bar panel and a
  `jprot-vscode-0.1.0.vsix` install command; the preview was removed in
  `jprot-vscode` 0.2.0 and the VSIX is at 0.2.2. The section now covers
  highlighting and snippets, how to build the current VSIX, and the project
  layout line no longer lists the preview.
- **README — new "Showcase — JPROT in production" section.** Two live sites,
  [Noor](https://moaaz-i.github.io/Noor/) (GitHub Pages, `basePath: '/Noor'`,
  Arabic RTL + English) and
  [moaaz-i.vercel.app](https://moaaz-i.vercel.app/) (Vercel, portfolio with
  resume, blog and a custom `/repos` page), each with the JPROT features it
  demonstrates.

## [0.9.0] - 2026-10-02

A correctness and security pass over the whole framework. Nothing here changes
the content authoring format; the only user-visible rendering change is that the
docs sidebar now works by default (see below).

### Security

- **XSS in the default theme's `Projects` component.** Project `description`,
  `date`, `demo` and `repo` were interpolated raw, and `cover` was placed in an
  `<img src>`. Any of them, taken from frontmatter, could close the attribute and
  inject markup. All are now escaped, and every URL goes through the shared
  `safeHref()`. `Home.js` (avatar `src`, project cover) and `Sidebar.js` (nav
  `href`) had the same class of bug and are fixed too.
- **One `safeHref` instead of four.** Three drifted copies existed in theme
  components (no control-character check; `data:` allowed even for links). They
  were replaced by a single implementation in `lib/utils.js`, shared with the
  Markdown renderer's `safeUrl`. A behavioural test now renders every component
  with hostile props, so a new component cannot reintroduce the class of bug.
- **`themeColor` could break out of `<style>` and the SVG attributes.** The 404
  page's inline stylesheet, the favicon and OG image, the web manifest and
  `<meta name="theme-color">` all interpolated it unescaped. They now go through
  `safeColor()`. The favicon also gets a real CSP.
- **The 500 page leaked the error.** The body was `"Server error: " + err.message`,
  disclosing absolute filesystem paths and internal module names, and it was
  sent through a bare `writeHead` that skipped every security header. The body is
  now generic, the detail stays in the server log, and the response carries the
  full header set.
- `escapeHtml()` now escapes `'` as well, matching `esc()`.

### Fixed

- **A broken config no longer degrades to an empty site.** A `jprot.config.js`
  that failed to parse produced a fully functional but completely unconfigured
  site — no nav, no theme, no plugins — which reads as "JPROT is broken" rather
  than "you have a typo". It is now fatal (`ConfigLoadError`): `jprot check`
  reports it with a line number, and every other command exits `1` with a
  readable message instead of a stack trace.
- **`jprot --root <dir>` served the current directory.** `--root` was documented
  and honoured by every subcommand except the dev server, which simply never
  passed it through. It now does.
- **The docs sidebar was dead by default.** `Sidebar.js` re-derived its own
  decision (`if (!site.sidebar) return ''`) and vetoed the server, so the sidebar
  never rendered unless the config literally set `sidebar: true` — and a
  per-page `sidebar: true` could never work at all. `jprot.d.ts` documents the
  default as `true` and the server already treated unset as "not false". The
  component now honours an explicit `false` and nothing else. Sites that follow
  the documented configuration (which sets `sidebar: true`) are unaffected.
- **CLI dispatch was substring matching on `args[0]`.** `jprot --root X new page
  foo` started the dev server and hung instead of scaffolding, and any project
  path or title containing a command word could hijack dispatch. Replaced with
  `positionals()`, which strips flags and their values.
- **`evictStaleCache()` was a no-op.** Its synchronous `try { stat(file) } catch`
  could never fire, because a missing file rejects the returned promise rather
  than throwing — so nothing was ever evicted. It also was never called. It is
  now awaited, called on every graph build, and the parse cache is capped.
- **A `sections:` entry could override the framework context.** In
  `renderSections`, the entry's own props were spread *after* `site`/`page`/`nav`,
  so a frontmatter key could replace what a component was rendering against.
- **A missing snapshot reported `match: true`.** `matchSnapshot` created the
  file and passed, so a new test was green on its first run. It now fails, and
  only `UPDATE_SNAPSHOTS=1` writes.
- **`jprot check` claimed a nonexistent file was valid.** Projects with no
  config file were reported as "`jprot.config.js` is valid". It now says there is
  no config file and points at `jprot init`.
- **`jprot.d.ts` declared exports the package did not have.** Every name in the
  type file's `export` statements had to resolve at runtime, but several did
  not, so a TypeScript user importing them got a clean compile and then a
  `SyntaxError` at import time. The API is now actually exported (above) and a
  test fails if the two ever diverge.

#### Markdown renderer: fifteen bugs found by fuzzing

Found by throwing generated hostile documents at the renderer and asserting on
the *visible* output rather than on HTML shape. Every one is pinned by a named
test in `test/unit/markdown.test.js` explaining the mechanism. The unifying
theme is text quietly leaving the page while the renderer reported success.

- **Text vanished instead of degrading to text.** Footnote and link definitions
  were skipped by the emitter based on its *own* pattern, while a separate
  pre-scan decided what was collected. Five separate disagreements each threw
  text away:
  - The pre-scan only looked at top-level lines, so `- [^a]: the note` was
    skipped by the emitter and never collected — an empty `<li>`. The emitter now
    asks the pre-scan (`footnote[1] in doc.noteDefs`, `link[1].toLowerCase() in
    doc.linkDefs`) and skips exactly the span the pre-scan claimed. A
    disagreement now degrades to "the definition renders as visible text".
  - The pre-scan accepted any run of backticks as a fence while the emitter
    required exactly three. `lib/markdown/fence.js` now owns `FENCE_OPEN_RE` and
    `forEachOutsideCode`, shared by every stage.
  - `[a]: /url #frag and more words` matched the emitter's shape but not the
    collector's, so the sentence after it left the page. Both sides now share one
    anchored `LINK_DEF_RE`.
  - A definition's extent is stored as a *count* of lines and the emitter spends
    it as "skip the next N lines from here", but `forEachOutsideCode` hides fence
    lines from the collector. A fence between the count and the spend made the
    emitter skip the fence **opener**, leaving the fence unclosed and taking the
    rest of the page with it — a document with one fence after one footnote
    definition rendered as nothing at all. `forEachOutsideCode` now reports fence
    lines through an optional `onFence` callback, and `collectFootnoteDefs` ends a
    definition at one. Lines *inside* a fence still neither extend nor end it.
  - A table's row loop is the only block rule that reaches further than a single
    line, and it ran straight past the line the emitter has promised to skip —
    the definition branches test `blockLines[j]`, and by the time they would run
    the row was already collected. `[^a]: the note` after a one-column table
    became a `<td>`, so the `[^a]` in it rendered as a *live* reference while the
    footnote it named had no definition: a number on the page that jumped
    nowhere, and no note. The loop now asks the same question the other branches
    ask, through a shared `isCollectedDefinition()` — and the question includes
    `toc`, because inside a list item or a quote the emitter renders a definition as
    the paragraph it looks like. Answering "yes" there would end the table early and
    let a definition change a table's shape.
- **A footnote whose body cited another footnote rendered only one of them.** The
  footnote section was built with `Array.prototype.map`, which fixes its length
  before iteration; rendering a note can register a *new* note during that map, so
  the second note got a superscript pointing at an `#fn-…` that did not exist and
  its text never reached the page. It is a worklist bounded by a `done` set now.
- **A link definition's title was parsed and thrown away**, so the author's title
  disappeared from the page while the line was consumed either way. It now
  reaches the anchor, and the first definition still wins.
- **A refused URL produced a dead `href="#"` and a stray `)`.** `renderLink`
  returns `null` for a refused destination, so the link renders as the literal
  text the author wrote. An image keeps `src="#"` so its alt text survives.
- **A placeholder injected by the renderer could be forged from user text.**
  A document containing a NUL-wrapped digit sequence restored a code span, or
  printed `undefined`. Placeholder characters are now rejected in source.
- **A duplicate `id="fnref-x"`** appeared when a footnote was referenced twice.
- **Emphasis rules paired across the renderer's own tags**, producing
  `_<strong><del></strong>_</del>` from `___~~___~~`. Emphasis, strikethrough and
  the rest now run inside one masked pipeline, and `~~` is no longer a pass that
  runs outside it.
- **A stray `[` claimed the rest of the page as link text.** Labels now match
  balanced brackets rather than running to the first `]`, and URLs allow one level
  of balanced parentheses — which also fixed `![b](data:…,alert(1))` printing a
  lone `)`.
- **A list item's continuation lines were dedented by the full marker column**, so
  a two-space fence inside `1. ` was sliced to a stray backtick and rendered as
  text, and `1. a` followed by `  hello` lost its first two letters.
- **Brackets and parens were matched with quadratic scans.** 16 000 `[` went from
  2384 ms to 0.3 ms.

#### Other fixes

- **`extendMarkdown({ extensions })` did nothing.** The functions were validated,
  collected into `registry.markdown.extensions`, and never read by anything:
  `createMarkdown` was handed `defaults` only. A plugin author's correct call was
  silently inert. They are now applied to the Markdown source before it is split
  into lines, in registration order. A throwing extension is reported and skipped
  without stopping the others, and a non-string return is ignored — so
  `s => { sideEffect() }` cannot replace the document with the word `undefined`.
- **The built-in theme was not direction-neutral.** Five rules used physical
  properties, so an RTL site got the code-block Copy button on the wrong side, a
  "next" page label reading against its own arrow, the corporate project accent
  bar on the wrong edge, a mobile nav dropdown spanning from the wrong origin, and
  — worst — `direction: ltr` from the `--dir` variable overriding the `dir="rtl"`
  attribute on `<html>` entirely. All logical properties now; the one thing CSS
  cannot express logically, `direction`, is flipped in a single `[dir="rtl"]`
  block, and the horizontal scroll animations are mirrored there too.
- **`jprot check` said nothing about a `lang`/`dir` mismatch.** An Arabic page
  that set only `lang` rendered correctly and laid out backwards, silently.
  Inferred `dir` would be the wrong fix — an explicit declaration the author can
  grep for beats a guess that overrides them — so this is a warning, not an error
  and not a guess.

### Added

- **Public API surface.** `core/server.js` (the package root) now exports
  everything the README and `jprot.d.ts` document: `createJprot`, `exportSite`,
  `runLint`/`analyzeSite`, `runCheck`/`checkConfig`, `scaffoldSite`/`scaffoldNew`,
  `createMarkdown`, `loadSiteConfig`/`ConfigLoadError`, `contentGraph`,
  `loadContentGraph`, the `HOOKS` registry, `loadPlugins`/`runPlugins`,
  `validateConfig`/`CONFIG_KEYS`/`formatConfigIssues`, and the shared helpers
  `esc`/`safeHref`/`safeColor`/`isInside`/`slugify`/`MIME`/`editDistance`. A test
  asserts the type file declares nothing the package does not export.
- **Hook coverage.** `state:build`, `components:load` and `build` now actually
  fire, and `export` fires from `core/export.js`. `HOOKS.build.args` was
  documented as `['args']` but receives `['state']`.
- `SECURITY.md` and `CHANGELOG.md` are now in the published `files` list.
- 41 new tests: behavioural component-escaping guard, API surface, config load
  failures, hooks, security headers and CSP, CLI dispatch.

#### Property-based and fuzz testing

- **`test/unit/property.test.js`** — 25 invariants over generated inputs:
  escaping never emits a raw `<`, slugs are stable and URL-safe, `safeHref`
  refuses every dangerous scheme, front matter reports the right line numbers,
  rendering is deterministic. No dependency: a seeded generator, so a failure
  prints a reproducible case.
- **`test/unit/markdown-fuzz.test.js` + `test/helpers/md-fuzz.js`** — 21 fuzz
  properties over hostile generated documents, plus a **shrinker** that reduces a
  failure to a minimal document before printing it. The oracle checks the
  *visible* text and `alt`/`title` attributes of the whole output, not its HTML
  shape, which is what makes "the text quietly left the page" detectable at all.
  Raise the case count for a harder run: `MD_FUZZ_CASES=5000 npm run test:unit`.
- **The oracle now models code and containers, and the model is itself tested.** Wide
  seed sweeps turned up two renderer defects (above) and **eleven** ways the *oracle*
  was wrong about the renderer's documented behaviour — each of which had been quietly
  reducing coverage rather than producing a false alarm:
  1. It decided a footnote was referenced because `[^a]` appeared somewhere in the
     file, without noticing that the only occurrence sat inside a code span, where it
     is literal text.
  2. It read footnote definitions with an unanchored regex, so an *indented* `[^a]:`
     counted as a definition — while the renderer's `FOOTNOTE_DEF_RE` is
     column-anchored and renders such a line as the paragraph it looks like.
  3. It treated a reference inside an *orphan* definition's body as a reference. It is
     not: the definition it lives in renders as nothing, so the text is never shown
     and the note it cites never gets a superscript. Orphans nest, so the two sets are
     resolved together to a fixed point.
  4. Its code-span scan resumed one backtick *pair* after a failed match. A global
     regex resumes at the next *position*, so on a run of four backticks the fourth
     one opens the span and not the first — the miss left a footnote reference looking
     like prose and the token oracle reporting a definition that renders nothing.
  5. It blanked code spans one line at a time, so a span crossing a line break — which
     is what a paragraph *is* — was never found at all.
  6. It did not skip definition lines wholesale when collecting references, so a whole
     page written with bare `\r` line endings (one line to the renderer, so one
     definition swallowing the document) still counted as a reference.
  7. It had **one** notion of where a code block starts. There are two, and they are
     entitled to differ: `forEachOutsideCode` is a flat toggle with no containers,
     while the emitter recurses into list items and quotes with their own fence state.
     An indented backtick fence inside a task item is a *continuation line of that
     item*, so it opens a fence there and leaves the document outside code — and the
     flat scan read it as an opener for the next twenty lines, taking a footnote with
     it. The oracle now walks the same decision tree in the same order, over the same
     exported patterns (`BLOCK_PATTERNS` in `lib/markdown/blocks.js`, internal and not part of
     the public API), because a second copy of those patterns is a second answer to the
     same question — which is how the emitter and the pre-scan came to disagree in the
     first place.
  8. `preScanView()` reported "the collector did not see this line" as one boolean,
     which cannot express the difference between a **fence line** (filtered out, but
     reported through `onFence`, so it *ends* an open definition) and a line **inside** a
     fence (filtered out with no callback at all, so it can neither extend nor end one).
     Skipping both is right for the second and wrong for the first, and the difference
     is now carried as a per-line `kind`.
  9. The orphan/`referenced` fixed point was *seeded* with every raw reference, so the
     first round found no orphans and nothing was ever subtracted. That works only when
     the reference sits on a definition line, which the scan skips wholesale; one line
     lower, in a continuation of the definition's own body, `[^a]` is a reference to
     itself and the note came out reported as a swallowed paragraph. It now grows
     *upward from nothing* — a reference resolves if the line carrying it is rendered,
     and a line is rendered if the definition hosting it is — which is monotone,
     converges in at most one round per id, and makes a group of definitions citing
     only each other resolve to "nothing", exactly as the renderer does.
  10. `identifierOnlyTokens()` recorded the ids it matched and then filtered *those*,
      which is the identity test rather than the position one. A marker inside the url
      of `[a]: b[[[[Mk1]]` is not an id, so it was never exempted and the page was
      reported as dropping a token it had correctly never been asked to show — the line
      renders as nothing at all. It now decides by position: blank every identifier
      position, and a marker gone from the result was in one. Lines inside a fence are
      exempt from the blanking, since there a `[id]: url` is code and everything on it
      is visible.

      The rules have an order, and it is load-bearing in a way that is not obvious.
      `[^id]` is blanked *first*, which is what stops the link-definition rule from
      eating a footnote definition: after it, `[^a]: the note` is ` : the note`, and
      `^\[` no longer matches. Run them the other way round and every footnote
      definition is silently exempted, so the token oracle stops checking the one thing
      it is best at — a referenced note's body is text the reader sees. The quoted-fence
      rule is the renderer's `QUOTE_RE` dequoting the line, not a hand-written `>?` in the
      pattern, because a second copy of a pattern is a second answer to the same question.
  11. An author's unclosed tag leaves a **closing** tag whose attribute region runs on
      across the rest of the paragraph — HTML allows newlines in attribute values — so
      the browser reads `<sup … id="fnref-a">` as attribute names and discards them. The
      token properties already exempted text found in `tagSyntax`; *attributes* needed
      the same exemption, and the footnote-link and table-of-contents checks had neither,
      so they reported the renderer's own correctly-emitted `id` as missing.

  `proseOf()` models code the way the renderer does rather than the way CommonMark
  does: the renderer's own `FENCE_OPEN_RE` for fences, and a mirror of its inline
  rule, because the two disagree about backtick runs completely and the renderer is
  what has to be predicted. A 21st property holds the model against the renderer in
  both directions, because an oracle that trusts a heuristic nobody checks is just a
  slower way to be wrong.
- **One fuzz property was asserting a rule the renderer does not have.** "No dangerous
  URL reaches an `href` or a `src`" banned `data:` outright, but `safeHref`'s
  deliberate `data:image/` carve-out for images — an inline image being the one asset a
  static site cannot ship as a file — means a correct render would have failed it. The
  property now restates the renderer's actual rule and runs on markup-free documents,
  since **raw HTML in Markdown is passed through on purpose** and the author's own
  `<a href= data:…>` is not the renderer's to refuse. The generator gained the atoms
  that make the carve-out testable in both directions: a `data:image/` URL in an image
  (allowed), the same URL in a link (refused — it is a navigation), and
  `data:text/html` in an image (refused). Both refusals were then confirmed by
  re-breaking `safeHref` and watching the property go red.
- **Two exemptions were placed where a reader would actually be looking.** A token
  swallowed by the author's own markup is invisible *in a browser too*: HTML allows
  newlines in attributes, so an unclosed `<b>x</b` produces a `</b …>` whose attribute
  region runs on across the paragraph, and the browser parses those bytes as attribute
  names and drops them. Nothing about that tag is malformed, so the exemption keys on
  "inside tag syntax" rather than on a parse error — and it has to include *closing*
  tags, which are exactly the ones that swallow. Likewise a fence's info string is an
  identifier position, so an info string written behind a quote marker needs that
  marker dequeued before it can be recognised as one.
- Every fix listed above was validated by **mutation testing**: each was
  re-broken in place and the suite had to go red. A few mutations survive *by
  design* and are documented as such — the collector/emitter agreement is
  redundantly defensive, so each half is individually inert and only the
  historical combination was ever a bug.

#### Incremental export

- **`jprot export` no longer rebuilds unchanged pages.** It rebuilds only pages
  whose own inputs changed, using a two-part cache key: a `global` hash (JPROT
  version, site config, nav, docs nav, search index, and a `sourceFingerprint`
  of the author's `theme/` tree and config files) plus a per-page `local` hash.
  The split is safe by construction — a false negative costs redundant work,
  never a stale page.
- The manifest lives in `<root>/.cache/export-manifest.json`, never inside
  `dist/`, and reuse additionally requires the output file to still hash-match,
  so a hand-edited or truncated file is rebuilt rather than trusted.
- `exportSite` keeps its `Promise<string>` return type; statistics go through
  `onProgress`, and `jprot export --clean` forces a full rebuild.
  `test/integration/export-incremental.test.js` pins the scenarios against
  byte-identical full rebuilds.

#### Documentation and contributor base

- **`content/plugins.md`** — a new page documenting every hook, with three
  complete copy-pasteable plugins (a reading-time injector, an Obsidian mirror,
  and a redirect map), plus the honest boundaries: a custom 404 is
  `content/404.md` and not a hook, because the built-in fallback is written
  straight to the response.
- **`CONTRIBUTING.md`** rewritten around what a newcomer actually needs: the
  module map, the two rules the renderer's stage split implies (the collector and
  the emitter must never disagree; a fence is a fence to every stage), the
  deliberate raw-HTML passthrough, and how to add a property without
  contradicting the design.
- **`CODE_OF_CONDUCT.md`**, added to the published `files` list next to
  `SECURITY.md`.
- `content/configuration.md` gained an **RTL and direction** section covering the
  `lang`/`dir` warning and where to put direction overrides.
- `test/integration/rtl.test.js` — five tests, including one that fails if a
  direction-dependent physical property is added back to the theme.
- Seeded the repository with `markdown`, `rtl-i18n`, `security`, `breaking
  change`, `needs discussion` and `documentation` labels alongside the existing
  `good first issue` and `help wanted`.

### Changed

- **`core/server.js` was split into eight modules.** It had reached 1857 lines
  holding the page pipeline, the client-side script bundler, the HTTP endpoints,
  JSON-LD, asset serving, OG images, the plugin API and the 404 page. Those are
  now `core/site/page.js`, `core/runtime/scripts.js`, `core/site/endpoints.js`, `core/content/jsonld.js`,
  `core/site/assets.js`, `core/site/og.js`, `core/runtime/plugins-api.js` and `core/site/notfound.js`,
  and `core/server.js` is 456 lines. The split follows the dependency DAG, so
  `core/` has no import cycles at all. This is a pure move: all 31 exports of the
  package root are unchanged, and `jprot export` output is byte-identical
  (modulo the per-response CSP nonce, which is random by design).
- Config key lists are derived from `core/content/schema.js` `CONFIG_KEYS` in both the
  server and `scaffold.js`, so the "did you mean …" hint can never suggest a key
  `jprot check` would reject, or miss one it accepts. `editDistance` is defined
  once instead of three times.
- README: added an authoring contract, the real limits of the Markdown engine,
  and a note that **raw HTML in Markdown is passed through, not escaped**. It is
  safe only because `script-src` carries a per-response nonce and no
  `unsafe-inline`; that property is now pinned by a test.

## [0.8.1] - 2026-09-28

### Added

- **Block scalars in frontmatter.** `key: |` (literal — line breaks kept) and
  `key: >` (folded — joined with spaces) now parse correctly, with chomping and
  width indicators (`|-`, `>+`, `|2`) accepted using clip semantics. They were
  documented as supported but previously parsed to the literal string `|` and
  produced two "Expected key: value" diagnostics. The exact supported subset is
  specified in [`content/frontmatter.md`](content/frontmatter.md).
- **CI smoke-test of the packed tarball.** A new `smoke` job packs the tarball,
  asserts the shipped file list (core, lib, theme, `jprot.d.ts`; no private
  `*.local.md`), installs it into a temp project, runs the real `jprot init`,
  boots the server and curls `/` for a `200` plus the default theme's
  `.skip-link` — so a missing `files` entry, a broken bin path or an
  ESM/CJS mixup fails on a PR instead of on npm. `publish` now waits on
  `[test, smoke]`.

### Fixed

- **Frontmatter silently swallowed keys after a nested map.** A top-level key
  following a nested map with no intervening list was parsed *into* the map
  (`b:` after `a:\n  x: 1` became `a.b`, and a `title:` after `sections:`
  landed inside the section object), silently corrupting page metadata. The
  map parser now respects dedentation; the parser was already non-throwing,
  and 30 new table-driven, adversarial and round-trip tests pin the subset
  down.

### Changed

- **`core/content.js` retired.** Its `contentGraph`, `postItems`,
  `projectItems` and `resolveContent` (plus the `legacyItem`/`graphOptions`
  shims) moved into `core/content/graph.js`, and `core/server.js` now imports from
  there. **Breaking for anyone importing `core/content.js` directly** — the
  migration is a one-line import change (`~0.6` users included). The layout
  table in the README and `content/architecture.md` were updated.

## [0.8.0] - 2026-09-28

### Added

- **Accessible SPA navigation.** Navigating between pages no longer happens in
  silence for assistive tech. Every page now renders:
  - a **skip link** (`Skip to content`) as the first focusable element,
    visually hidden until keyboard focus lands on it;
  - the main content as a **focus target** (`<main id="jprot-main"
    tabindex="-1">`), so the SPA can move the focus there after a route change
    instead of leaving the user reading the old page;
  - a **live region** (`role="status"`) that announces the new page title
    whenever the SPA swaps pages;
  - `aria-current="page"` on the active nav link, kept in sync on the server
    render and during SPA navigation alike.

  The inline SPA script (`core/server.js`, `spaScript`) gained
  `announceAndFocus()`, which moves focus into the freshly loaded `<main>` with
  `preventScroll` (so scroll restoration on Back/Forward is never disturbed)
  and announces the new title. Covers keyboard users, screen readers, and
  scroll restoration together — previously only scroll was handled.

## [0.7.1] - 2026-09-26

### Fixed

- **`jprot add <Name>` crashed** with `The "path" argument must be of type
  string. Received function projectRoot`. Adding `--root` turned `projectRoot`
  from a string into a function, and the `addCatalogElement` call kept the bare
  identifier, so the function was passed where a path was expected. `jprot
  search` and every other command were unaffected.
- The release workflow now publishes `create-jprot` in the same run as `jprot`.
  It previously published only the root package, so `create-jprot` sat at 0.5.0
  on npm and `npm create jprot` scaffolded and pinned `jprot@0.5.1` — no
  `jprot check`, no plugin API, with nothing in the output to hint at it. This
  run also ships `create-jprot@0.7.1`, the first release of that package since
  0.5.0.
- The workflow passes `./create-jprot` to `npm publish`. A bare name resolves
  against the registry, which repacked the published 0.5.0 tarball and tripped
  a provenance mismatch — the failure mode was to ship 0.5.0's code under a
  0.7.0 version number.
- The publish gate is now only "is this version already on npm?". The previous
  `git diff-tree … | grep package.json` check could never fire: checkout is a
  depth-1 clone, so `HEAD` has no parent and `diff-tree` lists the whole tree.
  Asking the registry is also self-healing.
- Test fixtures declare `"type": "module"`, matching a scaffolded site. Node 18
  cannot load a fixture's `theme/components/*.js` or `plugins/*.js` without it
  and 11 tests failed there, while modern Node sniffed the syntax and hid it.

## [0.7.0] - 2026-09-25

### Added

- **`--root <dir>`**: points `check`, `lint`, `export`, `init`, `new`, `g
  component`, `search`, and `add` at a project other than the current directory,
  so they are usable from a monorepo CI job.
- **Plugin API** (`core/runtime/plugins.js`): a plugin is now a single file exporting
  `setup(jprot)`, declared in `jprot.config.js` under `plugins: [...]`.
  `setup` receives `addComponent`, `addRoute`, `extendMarkdown`, `on`, and the
  loaded config — and nothing else, so the surface stays small enough to promise
  across a major version. Available hooks: `state:build`, `components:load`,
  `html:page`, `html:head`, `html:body-end`, `endpoint:json`, `build`, `export`.
  A hook name that does not exist fails at setup time with the list of valid
  ones, instead of silently never firing. `addComponent` registrations work as a
  `:::Name` shortcode, a `sections[].component`, and a `layout:`.
  - A broken plugin never takes the site down: import and `setup()` are both
    wrapped, the failure is reported, the remaining plugins still load, and the
    site keeps serving.
  - A plugin is all-or-nothing: each one writes into a private staging area
    committed only when `setup()` returns, so a plugin that throws halfway
    leaves no half-registered component, route, or hook behind.
- **`jprot check`**: validates `jprot.config.js` against the schema from the
  command line and reports every problem with its `file:line`. Beyond types it
  verifies what a type cannot express — that each `sections[].component` names
  a component that exists (including ones added by a plugin), and that every
  declared plugin resolves, imports, and completes `setup()`. Exits non-zero on
  error; `--strict` promotes warnings to errors. Also available as
  `checkConfig()` / `runCheck()`.
- **`plugins` config key** and the `JprotPlugin`, `JprotPluginApi`,
  `JprotHooks`, and `JprotPluginReport` types in `jprot.d.ts`.
- **Committed HTML/JSON snapshots** (`test/snapshots/`): seven rendered pages and
  seven endpoints, so a change in rendered output shows up as a reviewable diff
  instead of a silently different site. Nonce, dev origin port, `<lastmod>`,
  `<lastBuildDate>` and `"date"` are normalized so a nightly run doesn't fail on
  a clock tick. Update with `npm run test:update`.
- **Test suite split** into `test/unit/` and `test/integration/` with shared
  fixtures in `test/helpers/`, plus `npm run test:unit` and
  `npm run test:integration`.

### Changed

- **The Content Graph** (`core/content/graph.js`): one pass over `content/` now produces
  every derived structure the server needs — pages, posts, projects, routes,
  navigation, docs navigation, the search index, the internal link graph, and
  orphan detection. Routing, the sitemap, the feed, `jprot lint` and
  `jprot export` all read it, so they can no longer disagree about what pages
  exist. It is cached and keyed by a `file:mtime:size` signature, so a rebuild
  that changes nothing re-parses nothing. `core/content.js` remains as a
  thin facade so existing imports keep working.
- **`jprot lint` is now site-aware** and resolves every check against the graph
  instead of a file listing. New checks: duplicate heading anchors, unreachable
  pages, navigation ordering, unknown `sections[]` components, props a
  component does not declare, and `og:image` / `avatar` / `logo` / `icon` paths
  that would 404. The duplicate-anchor check replaces one that could never fire
  because it could not see the renderer's disambiguated slugs.
- **Internal links resolve against the served URL**, not the file path, so
  `../guide.md` from `/docs/intro` is understood the same way the browser and
  the server's own 301s understand it.
- **Shortcodes parse into an AST** instead of being rewritten with string
  surgery. Shortcodes nest (an inner `:::Name` is rendered first and passed to
  the outer component as `children`), and a component that throws or a
  shortcode that names something unregistered now degrades to a visible marker
  for that one block instead of failing the page.
- **Export and deploy are separate concerns.** `core/tooling/deploy.js` owns everything
  about *where* the site lives — `normalizeBasePath`, `deployUrlFor`, and a
  deployment object that rewrites HTML, the search index, and the PWA manifest
  for a given base path and origin. `core/export.js` now only decides *what*
  gets written.
- **The watcher classifies changes** into `config | component | content | asset
  | ignored` instead of rebuilding on anything. `dist/`, `node_modules/`,
  `.git/`, `.next/` and `coverage/` are excluded, so `jprot export` can no
  longer wake the watcher that wrote it.
- **`lib/markdown/`** is split by concern — `definitions`, `blocks`, `inline`,
  `links`, `footnotes`, `sanitize`, `slugify`, with `index.js` owning the pass
  order. `lib/markdown.js` remains as a back-compat re-export.
- **The component contract** (`core/content/components.js`): components may be a
  function or `{ name, props, render }`, normalized to one internal shape.
  Declaring `props` is optional and is what lets lint flag a section key a
  component silently ignores.

### Fixed

- **`catalogUrl` was rejected by the config schema.** Every scaffold writes
  `catalogUrl` into `jprot.config.js` and the options table documents it, but it
  was missing from the schema's key list — so `jprot check` reported
  `unknown config key` on a brand-new site, and `jprot check --strict` exited
  `1` on a pristine project. Two regression tests now pin this: a pristine
  scaffold must pass `--strict`, and every key the scaffold writes must be in
  `CONFIG_KEYS`.
- **`jprot init --root <dir>`, `jprot new --root <dir>` and `jprot g component
  --root <dir>` ignored the flag** and wrote into the current directory instead.
  `jprot init --root ./site` scaffolded an entire site into whatever folder the
  user was standing in. A regression test asserts these commands leave the
  repository's `git status` unchanged.
- **`jprot check --root <dir>` reported on the wrong project.** `check`, `lint`
  and `export` all hard-coded `process.cwd()`, so a CI job pointed at a
  subdirectory got `✔ check: jprot.config.js is valid` about whatever repository
  it happened to run in. A validator that passes on the wrong tree is worse than
  one that fails.
- The Organization JSON-LD `logo` ignored the site-wide `avatar` fallback, so
  setting only `avatar` rendered an avatar in the hero while leaving
  `schema.logo` empty.
- Config validation accepted malformed entries inside arrays of objects — a
  `sections` entry that was a string, or an object missing its required keys,
  was not reported. `jprot check` now catches these.
- `analyzeSite()` is exported alongside `runLint()`, so a host application can
  read a structured lint report instead of parsing terminal output.
- Documentation: three `#markdown-components--no-javascript` anchors used
  GitHub's double-dash convention where JPROT's own slugger emits a single dash,
  and `theme/components/README.md` linked to `../content/…` from
  `theme/components/`, which resolves to `theme/content/…`.

## [0.6.0] - 2026-09-25

### Added

- **VSCode extension** (`jprot-vscode/`): live side-by-side preview of your site
  in the editor, JPROT-specific Markdown syntax highlighting (frontmatter,
  `:::Component` shortcodes, `[value]` placeholders) and snippets for pages,
  posts, projects, resumes and `jprot.config.js`. The extension drives the
  project's own jprot server — no bundled runtime, no build step.
- **`--allow-embed`**: an explicit dev-server opt-in that relaxes the framing
  headers (`X-Frame-Options`, `frame-ancestors`, `Cross-Origin-Resource-Policy`)
  so the site can live inside an iframe — what editor live previews need.
  Framing stays fully blocked by default; every other security header is
  unchanged. Exposed as `JprotOptions.allowEmbed` in the API.

## [0.5.1] - 2026-09-25

### Fixed

- Sitemap: `<image:image>` entries are now nested **inside** their `<url>`
  element instead of being emitted as direct children of `<urlset>`. Pages with
  an `image` frontmatter value no longer produce a sitemap that Google's
  validator rejects with "This tag was not recognized / Parent tag: urlset".

## [0.5.0] - 2026-09-24

### Added

- **`npm create jprot@latest`**: a one-command scaffold that scaffolds a site
  and installs its dependencies (`--portfolio` / `--docs` / `--resume`,
  `--no-install` to skip the install step). Ships as the `create-jprot`
  package alongside `jprot`.
- **Footnotes**: `[^id]` references any `[^id]: …` definition, forward
  references included, with a generated notes section and backlinks
  (`markdown.footnotes`, default on).
- **Autolinks**: `<https://…>`, `<ftp://…>` and `<you@example.com>` become
  links automatically (`markdown.autolinks`, default on).
- **Nested lists**: lists can contain sub-lists, continuation paragraphs and
  code blocks at any depth.
- **Joined paragraphs**: consecutive non-blank lines form a single `<p>`
  instead of one paragraph per line.
- **Backslash escapes**: `\*`, `\[]`, `` \` `` and the rest of the ASCII
  punctuation set now render literally instead of triggering Markdown.
- **Reference-style links**: `[text][id]`, `[text][]` and shortcut `[text]`
  resolve against `[id]: url` definitions anywhere in the document; labels are
  case-insensitive, code-fence-aware, and unknown references stay literal.
- **Nested emphasis**: `**bold *inner* mark**`, `***bold italic***` and the
  `__`/`_` variants render correctly, while pathological runs (`****`) stay
  literal.
- **Task lists**: `- [x]` / `- [ ]` items render as disabled checkboxes with a
  `task-list-item` class (`markdown.taskLists`, default on).

### Changed

- `jprot/scaffold` is now exported from the package, so `create-jprot` (and
  any tooling) can reuse the scaffold engine instead of duplicating it.
- `MarkdownConfig` in `jprot.d.ts` now matches the engine exactly
  (`highlight` / `tags`, which were never implemented, were removed).
- `jprot init` and the docs point newcomers to `npm create jprot@latest` first.
- `.gitignore` now covers `node_modules/` and `__pycache__/`.

## [0.4.0] - 2026-09-23

### Added

- **Markdown components**: `jprot g component <Name> --format md` scaffolds a
  `.md` component — frontmatter holds its default values and the body uses
  `[value]` placeholders. No JavaScript required. Renders through the Markdown
  engine, wrapped in a `.md-component-<Name>` div for pure-CSS styling.
- **Docs navigation**: the docs sidebar and previous/next links now include
  nested pages (e.g. `guide/nested.md`) sorted by frontmatter `order`, excluding
  blog posts and project entries so they don't clutter the tree.
- Examples: `Hobbies.md` and a styled `Spotlight.md` + `spotlight.css`
  Markdown-component sample in `examples/components/`.
- Lint reports invalid `date` frontmatter instead of letting it silently break
  ordering and feeds.

### Changed

- `jprot export` now folds the deployment `basePath` into the site `url`, so
  sitemap, RSS, `robots.txt`, `llms.txt` and canonical/OG URLs point at the real
  host for project-site deployments without hand-editing `url`.
- Static exports prefix `manifest.json` `start_url`, `scope` and icon paths with
  the base path.
- HTTP redirects (`.md` URLs and trailing slashes) now use root-relative
  `Location` headers, so they never leak the production `site.url` to dev/proxy
  visitors.
- `[value]` interpolation in Markdown components protects whole `[...](...)`
  link/image spans and renders arrays as bullet lists / objects as JSON.
- `jprot g component` validates `--format js|md`.
- Blog posts sort by a zero-padded date key, so `2026-1-5` no longer outranks
  `2026-10-1`.

### Fixed

- IPv6 hosts (`HOST=::1`) now produce valid URLs (`http://[::1]:4114`) in the
  banner and request parsing.
- Shortcode scan treats a `:::` line inside a fenced code block as content, not
  a close fence.
- RSS feeds stop emitting a broken `<pubDate>Invalid Date</pubDate>` for
  missing/unparseable dates.
- Frontmatter single-quoted values now unescape `\'`.
- Trailing newline normalization in interpolated template bodies.

## [0.3.0] - 2026-09-20

### Added

- **Element catalog**: `jprot search [query]` lists ready-made components and
  `jprot add <Name>` installs one into `theme/components/` from a plain static
  catalog site. The catalog URL resolves, in order, from `--from <url>`, the
  `catalogUrl` config key, or the default shipped with the distribution.
- **Self-closing shortcodes**: a `:::Component attrs` line now renders on its
  own without a closing `:::` fence (no children). The block form — closing
  fence with Markdown children — still works, and an unterminated block still
  degrades to literal text instead of swallowing the rest of the page.
- **Docs**: new "Catalog elements" page (`content/catalog.md`) covering the full
  `add`/`search` workflow, plus a refreshed getting-started, quick-start,
  configuration, content, deploy, and FAQ documentation.
- Docs mode sidebar with on-page navigation and previous/next links (folded in
  from Unreleased).

### Changed

- CLI: unknown subcommands now print an error instead of silently starting the
  dev server; `jprot new` accepts `resume`; scaffolded components validate their
  `--palette`.
- Scaffold: optional `catalogUrl` config key, hero `badge`/`avatar` placeholders,
  project `cover` comment, and a clearer homepage intro.
- Static exports include `.nojekyll` for GitHub Pages (from Unreleased).

### Fixed

- Single-line, self-closing shortcodes rendered as literal text instead of the
  component, which left catalog previews shapeless.
- Security and reliability hardening rolled in from Unreleased: validated
  request paths/methods, stronger cross-origin headers, safe Markdown URL
  schemes, frontmatter diagnostics, and cached parsed content keyed by file
  metadata.
- CI: Node 18/20/22 test matrix and exact-version npm publish gating with
  provenance (from Unreleased).

## [0.2.0] - 2026-09-05

### Added

- **CLI**: `init` (`--portfolio`/`--docs`/`--resume`), `new` (`post`/`page`/`project`/`resume`),
  `g component` (`--palette` section/cards/cta/stats), `g list`, `lint`, `export`, `--prod`, `--no-watch`.
- **Server**: SSR with SPA navigation, hot-reload file watcher (with polling fallback), drafts
  (visible in dev, `404` in production), custom 404 via `content/404.md`, themed default 404.
- **Themes**: 4 built-in variants (default, minimal, creative, corporate) with a cycle button and
  a `ThemePicker` component; light/dark toggle persisting in `localStorage`.
- **Content**: Markdown with YAML frontmatter, `:::Component` shortcodes (typed attributes,
  nested, fence-aware), project cards, blog listing, printable `resume` layout.
- **Customization**: CSS-variable restyling (`theme/custom.css`), drop-in component overrides
  (`theme/components/`), scaffolded components, ready-made theme packs in `examples/`.
- **SEO & discovery**: canonical + OG + Twitter meta, JSON-LD (Organization, Article/BlogPosting,
  Person, BreadcrumbList, optional SearchAction), file-backed SVG og:image, hreflang,
  `robots.txt`, `sitemap.xml` (git-aware `lastmod`), `feed.xml`/`rss.xml`, `llms.txt` +
  `llms-full.txt`, `manifest.json`, favicon.
- **Search**: instant client search (`Cmd/Ctrl + K`) against a live-built `/@jprot/search.json`.
- **Export**: `jprot export` renders the entire site to static `dist/` (fingerprinted CSS,
  optional og images, `404.html`, all feeds/meta, `public/` copied as-is).
- **Lint**: broken internal links, missing title/description/alt, oversized local images.
- **Programmatic API**: `createJprot`, `renderPage`, `exportSite`, `runLint`, `scaffoldSite`,
  `scaffoldNew`, `scaffoldComponent` with TypeScript types in `jprot.d.ts`.
- **Security**: strict CSP with per-response nonces, security headers, ETag revalidation,
  path-traversal guards on content and stylesheet serving.
- **Docs**: full documentation site inside `content/`, editor snippet scaffolds, startup config hints.