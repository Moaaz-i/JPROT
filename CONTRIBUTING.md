# Contributing to JPROT

Thanks for helping improve JPROT. Bug reports, documentation fixes, tests, and
small focused features are welcome.

JPROT is a **zero-dependency** Node.js package. That is the constraint that
shapes most decisions here, so it is the first thing to understand before
proposing a change: a feature that needs a parser, a Markdown library, or a test
framework is not automatically a good fit — it is a design question, not a
default.

## Requirements

Node.js 18 or newer. There is nothing to install.

```bash
git clone https://github.com/Moaaz-i/JPROT.git
cd JPROT
node --test test/unit/*.test.js test/integration/*.test.js
```

`npm test` runs the same thing. `npm` is not required to be installed for the
tests to run — everything uses the Node built-in test runner.

## Where things live

| Path | What lives there |
| --- | --- |
| `core/cli.js` | CLI entry point: `init`, `new`, `check`, `lint`, `add`, `export`, and the dev server |
| `core/server.js` | HTTP server, routing order, state build |
| `core/export.js` | Static export, incremental rebuild via `.cache/export-manifest.json` |
| `core/graph.js` | One walk of `content/` that produces nav, search index and sitemap data |
| `core/plugins.js` | Plugin loading and the plugin API (`on`, `addComponent`, `addRoute`, `extendMarkdown`) |
| `core/page.js` | Turning a content file into a rendered page |
| `lib/markdown/` | The Markdown renderer, split by stage |
| `lib/frontmatter.js` | Front matter parsing and diagnostics |
| `theme/default/` | The built-in theme, including `styles.css` |
| `content/` | This documentation site's own pages |
| `test/helpers/site.js` | `makeSite()`, the throwaway-site fixture nearly every test uses |

### The Markdown renderer is staged

`lib/markdown/` is deliberately split by *pipeline stage*, not by feature:

| Module | Stage |
| --- | --- |
| `index.js` | Entry point, per-render document state |
| `definitions.js` | Pre-scans footnote and link definitions **before** anything renders |
| `fence.js` | The single definition of what a code fence is |
| `blocks.js` | Block-level emitter: headings, lists, tables, code blocks, callouts |
| `inline.js` | Inline emitter: emphasis, code spans, links, images, footnote refs |
| `links.js`, `footnotes.js`, `sanitize.js`, `slugify.js` | Supporting stages |

Two rules follow from that split and are the source of most of the subtle bugs
ever found here:

**The collector and the emitter must never disagree.** `definitions.js` decides
what is a definition; `blocks.js` decides what to skip. When the emitter wants to
skip a definition-shaped line, it asks the collector what was actually collected
(`footnote[1] in doc.noteDefs`, `link[1].toLowerCase() in doc.linkDefs`) instead
of re-deriving the answer from its own pattern, and it skips exactly the span the
collector claimed (`doc.noteSpans`). A disagreement then degrades to "the
definition renders as visible text", never to text vanishing from the page.

**A fence is a fence to every stage.** `FENCE_OPEN_RE` and `forEachOutsideCode`
in `fence.js` are shared. The bug that motivated extracting them was a pre-scan
that accepted any backtick run while the emitter demanded exactly three.

If you add a stage, it needs to agree with the others about fences. If you find
yourself writing a third regex for "is this inside a code block", that is the
signal to import `fence.js` instead.

### Raw HTML passthrough is deliberate

JPROT does **not** sanitize author HTML out of content. An author writing
`<div class="hero">` in their own `content/` gets that markup. This is documented
and intentional — the security boundary is the Content-Security-Policy header,
which JPROT sets on every response, not the Markdown renderer. Do not "fix" this
by stripping HTML, and do not write a test that asserts it is stripped.

`test/integration/security.test.js` is the place to add a test about what
untrusted input *can* reach.

## Testing

```bash
npm test                       # everything
npm run test:unit              # test/unit/
npm run test:integration       # test/integration/
npm run test:update            # re-record HTML snapshots
```

Three kinds of test live here, and they are not interchangeable.

**Unit tests** (`test/unit/`) cover pure functions. Fast, and the right place for
a regression test pinned to a specific input.

**Integration tests** (`test/integration/`) boot a real server against a
throwaway site built by `makeSite()`. Every capability a plugin or config exposes
belongs here, and the bar is *behavioural*: assert the output changed, not that a
function was called.

```js
const site = await makeSite({
  content: { 'index.md': '---\ntitle: Home\ndescription: Home.\n---\n\nHello.' },
  files: { 'plugins/p.js': `export default { name: 'p', setup({ on }) {} }` },
})
const app = await createJprot({ root: site.root, watch: false })
try {
  const base = `http://127.0.0.1:${await app.listen(0)}`
  const html = await (await fetch(base + '/')).text()
  assert.match(html, /…/)
} finally {
  app.server.close()
  await app.closeWatcher()
  await site.cleanup()
}
```

**Property tests and fuzzing** cover the renderer. `test/unit/property.test.js`
states invariants over generated inputs; `test/unit/markdown-fuzz.test.js` throws
hostile documents at the renderer and checks the *visible* output. Both use a
seeded generator, so a failure is reproducible:

```bash
node --test test/unit/markdown-fuzz.test.js
MD_FUZZ_CASES=5000 node --test test/unit/markdown-fuzz.test.js   # a harder run
```

Raise `MD_FUZZ_CASES` before believing a renderer change is safe. The default is
small on purpose so the suite stays fast in CI; a change to anything in
`lib/markdown/` should be run at several thousand cases locally.

### Adding a property

A property is worth adding when it states something an example-based test cannot:
that an escaping function never emits a raw `<`, that a slug is stable, that
rendering is deterministic. It is not worth adding for something a single
fixture already pins.

Two rules keep the fuzz suite honest:

- **Assert on visible output, not on HTML shape.** "The word `hello` appears in
  the rendered text or in an `alt`/`title` attribute" catches a class of bug that
  "the output contains `<p>`" cannot — text quietly leaving the page.
- **Do not assert behaviour the design deliberately does not have.** Unterminated
  autolinks leaving a raw `<`, unreferenced footnote definitions rendering
  nothing, setext headings being unsupported: these are documented simplifications
  or the passthrough rule above. A property that contradicts them will fail for
  the right reason and get deleted.

When a property fails, the suite shrinks the failing document before printing it.
A small document is a bug report; a large one is not.

### Mutation testing

A test that passes against broken code is decoration. When you add a property or
fix a renderer bug, it is worth checking the test would notice if the fix were
reverted — re-break it by hand, confirm the suite goes red, then undo it. The
Markdown renderer has nine such bugs in its history, and every one of them is
pinned by a named test in `test/unit/markdown.test.js` with a comment explaining
the mechanism.

## Conventions

- **Never type invisible characters literally.** Use `\uXXXX` escapes. A literal
  control byte makes a source file register as binary to `file(1)` and breaks
  tools downstream.
- **Preserve the zero-dependency design.** If a change needs a package, raise it
  as an issue first rather than adding it.
- **Keep changes focused.** One concern per pull request, so it can be reviewed
  and so a revert stays surgical.
- **Add or update a test when behaviour changes.** A behaviour change with no test
  will be asked for one.
- **Update the docs with the change.** `content/` is this site's own
  documentation; a new option belongs in `content/configuration.md`, and the CLI
  surface belongs in `content/cli-reference.md`. `jprot.d.ts` is hand-written
  and is part of the published contract — change it in the same commit.
- **Do not commit `dist/`, `.cache/`, or `.env`.** They are generated or private,
  and are already gitignored.
- **Do not reformat unrelated lines.** The repo is not uniformly formatted and a
  drive-by reformat makes a diff unreviewable.

### Before opening a pull request

```bash
npm test
npm pack --dry-run
```

The packed file list is part of the contract: `core/`, `lib/`, `theme/`, the
examples and `jprot.d.ts` must ship, and private notes must not. CI asserts both
directions by inspecting the tarball, so a missing or extra file fails the build
rather than reaching npm.

## Reporting issues

For bugs and feature requests, use the
[GitHub issue tracker](https://github.com/Moaaz-i/JPROT/issues). A good report
names the JPROT version, the Node version, what you expected, and what happened —
and a reproduction is worth more than a diagnosis.

If you are looking for something to work on, issues labelled
[`good first issue`](https://github.com/Moaaz-i/JPROT/labels/good%20first%20issue)
and [`help wanted`](https://github.com/Moaaz-i/JPROT/labels/help%20wanted) are
the intended starting points. Say which one you are picking up before you start,
so two people do not write the same patch.

For security issues, follow [SECURITY.md](SECURITY.md) instead — do not open a
public issue.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
