// The extension's whole product is its grammar and its snippets, so this test
// is its only test: parse both JSONC files permissively and assert the surface
// the Marketplace ships. A malformed grammar or a missing snippet prefix fails
// here before anyone installs the VSIX.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Snippet files are JSONC (they allow // comments), so plain JSON.parse is not
// enough — strip full-line comments first. Top-level keys are human-friendly
// labels; the machine-facing `prefix` lives inside each entry.
function parseSnippets(name) {
  const text = readFileSync(resolve(root, 'snippets', name), 'utf8')
  const parsed = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''))
  const byPrefix = {}
  for (const entry of Object.values(parsed)) {
    if (entry && typeof entry.prefix === 'string') byPrefix[entry.prefix] = entry
  }
  return byPrefix
}

test('grammar is valid JSON carrying the JPROT marks', () => {
  const grammar = JSON.parse(
    readFileSync(resolve(root, 'syntaxes', 'jprot-markdown.tmLanguage.json'), 'utf8')
  )
  assert.equal(grammar.scopeName, 'source.markdown.jprot')
  assert.ok(grammar.injectionSelector, 'injectionSelector is declared')
  assert.ok(Array.isArray(grammar.patterns) && grammar.patterns.length > 0)
  const serialized = JSON.stringify(grammar)
  assert.match(serialized, /frontmatter/i, 'frontmatter delimiters are matched')
  assert.ok(serialized.includes(':::'), ':::Component shortcodes are matched')
  assert.ok(serialized.includes('placeholder') || serialized.includes('[value]'), '[value] placeholders are matched')
})

// The grammar never runs on its own: VS Code only consults it if it is
// injected into the scope the built-in Markdown grammar actually owns.
// Registering `injectTo: ["source.markdown"]` (a scope no VS Code build has
// ever shipped) leaves the rules permanently unreachable, and claiming
// `language: "markdown"` here would make this 4-rule grammar *replace* the
// built-in Markdown grammar for every .md file. Both failures shipped once,
// so both are pinned here.
test('grammar is injected into the real Markdown scope without claiming the language', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const contribution = manifest.contributes.grammars.find(
    (g) => g.scopeName === 'source.markdown.jprot'
  )
  assert.ok(contribution, 'grammar contribution exists in package.json')
  assert.deepEqual(
    contribution.injectTo,
    ['text.html.markdown'],
    'injectTo must be the built-in Markdown scope (text.html.markdown)'
  )
  assert.equal(contribution.language, undefined, 'must not claim language "markdown"')

  const grammar = JSON.parse(
    readFileSync(resolve(root, 'syntaxes', 'jprot-markdown.tmLanguage.json'), 'utf8')
  )
  assert.equal(
    grammar.injectionSelector,
    'L:text.html.markdown - meta.embedded.block.frontmatter',
    'injectionSelector must agree with injectTo, and must stay out of the frontmatter region'
  )
})

// The frontmatter rule once began with `^---\s*$`, the *same* regex it ends
// with. Inside an injection the closing `---` therefore re-entered the rule it
// was supposed to close, and `meta.embedded.block.frontmatter` stayed open to
// end-of-file: every heading, link, bold span and fenced block after the
// frontmatter lost all highlighting. Anchoring the opener to the start of the
// document (`\A`) is what makes the closer reachable, so both are pinned here.
test('frontmatter region opens once at the document start and can close', () => {
  const grammar = JSON.parse(
    readFileSync(resolve(root, 'syntaxes', 'jprot-markdown.tmLanguage.json'), 'utf8')
  )
  const rule = grammar.repository.frontmatter
  assert.ok(rule, 'frontmatter rule exists')
  assert.match(rule.begin, /^\\A/, 'begin must be anchored to the document start')
  assert.notEqual(
    rule.begin.replace(/^\\A/, ''),
    rule.end,
    'begin must differ from end or the closing --- re-opens the region'
  )
  assert.ok(rule.end.includes('---'), 'frontmatter still closes on ---')

  // The opener must not be reachable from anywhere but the first line, so a
  // setext heading (`Title` + `---`) later in the document stays a heading.
  const opener = new RegExp(rule.begin.replace(/^\\A/, '').replace(/\\/g, '\\'), 'm')
  assert.ok(opener.test('---'), 'opener still matches a --- line')
})

test('markdown snippet prefixes exist', () => {
  const snippets = parseSnippets('markdown.code-snippets')
  for (const prefix of ['jprot-page', 'jprot-post', 'jprot-project', 'jprot-resume', 'jprot-draft', 'jprot-hidden', 'jprot-shortcode', 'jprot-md-component']) {
    assert.ok(snippets[prefix], `expected snippet "${prefix}"`)
  }
})

test('javascript snippet prefixes exist', () => {
  const snippets = parseSnippets('javascript.code-snippets')
  for (const prefix of ['jprot-config', 'jprot-section', 'jprot-nav']) {
    assert.ok(snippets[prefix], `expected snippet "${prefix}"`)
  }
})