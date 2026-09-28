// Frontmatter parser — the one dependency every page goes through.
//
// The surface is defined in content/frontmatter.md: everything below a
// `key: value` subset (plus nested maps, lists, quoted strings, block scalars)
// either parses to data or produces a diagnostic — it never throws. A parse
// regression here doesn't raise: it silently renders a page with the wrong
// title, no date and no metadata, so these tests pin the subset down
// explicitly rather than trusting prose.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter } from '../../lib/frontmatter.js'

/* ---------------- the documented subset, table-driven ---------------- */

const SUBSET = [
  {
    name: 'nested maps via indentation',
    src: '---\na:\n  b: 1\n  c: two\n---\n',
    expected: { a: { b: 1, c: 'two' } },
  },
  {
    name: 'inline list',
    src: '---\ntags: [js, css]\n---\n',
    expected: { tags: ['js', 'css'] },
  },
  {
    name: 'block list of scalars',
    src: '---\ntags:\n  - js\n  - css\n---\n',
    expected: { tags: ['js', 'css'] },
  },
  {
    name: 'block list of nested mappings',
    src: '---\nsections:\n  - component: Skills\n    items:\n      - name: JS\n        level: 90\n  - component: About\n---\n',
    expected: { sections: [{ component: 'Skills', items: [{ name: 'JS', level: 90 }] }, { component: 'About' }] },
  },
  {
    name: 'single-quoted string keeps inner double quotes',
    src: "---\ntitle: 'He said \"hi\"'\n---\n",
    expected: { title: 'He said "hi"' },
  },
  {
    name: 'double-quoted string honours escapes',
    src: '---\ntitle: "Say \\"hi\\""\n---\n',
    expected: { title: 'Say "hi"' },
  },
  {
    name: 'quoted apostrophes survive inside double quotes',
    src: '---\ntitle: "It\'s fine"\n---\n',
    expected: { title: "It's fine" },
  },
  {
    name: 'colons inside values',
    src: '---\ntime: 12:30:45\nurl: https://x.com/a:b\n---\n',
    expected: { time: '12:30:45', url: 'https://x.com/a:b' },
  },
  {
    name: '--- inside a value stays literal',
    src: '---\ntitle: a---b\n---\n',
    expected: { title: 'a---b' },
  },
  {
    name: 'full-line comments are ignored',
    src: '---\n# a comment\ntitle: T\n# another one\n---\n',
    expected: { title: 'T' },
  },
  {
    name: 'whitespace before the colon',
    src: '---\ntitle : T\norder : 2\n---\n',
    expected: { title: 'T', order: 2 },
  },
  {
    name: 'date-like values stay strings (no datetime type)',
    src: '---\ndate: 2026-01-15\n---\n',
    expected: { date: '2026-01-15' },
  },
  {
    name: 'CRLF line endings',
    src: '---\r\ntitle: T\r\nlist:\r\n  - a\r\n  - b\r\n---\r\nBody\r\n',
    expected: { title: 'T', list: ['a', 'b'] },
  },
  {
    name: 'literal block scalar keeps line breaks',
    src: '---\nbody: |\n  line one\n  line two\n---\n',
    expected: { body: 'line one\nline two' },
  },
  {
    name: 'folded block scalar joins lines with spaces',
    src: '---\ndesc: >\n  one\n  two\n---\n',
    expected: { desc: 'one two' },
  },
  {
    name: 'block scalar followed by a sibling key and nested content',
    src: '---\na: |\n  line1\n  line2\nb: 2\nnested:\n  x: 1\n  y: |\n    deep1\n    deep2\n---\n',
    expected: { a: 'line1\nline2', b: 2, nested: { x: 1, y: 'deep1\ndeep2' } },
  },
  {
    name: 'block scalar inside a list-item mapping',
    src: '---\nsections:\n  - component: Hero\n    blurb: |\n      hi there\n      again\n  - component: Skills\n---\n',
    expected: { sections: [{ component: 'Hero', blurb: 'hi there\nagain' }, { component: 'Skills' }] },
  },
  {
    name: 'keys following a nested map stay top-level (dedent ends the block)',
    src: '---\na:\n  b: 1\nc: 2\nd:\n  e: 3\ntags:\n  - one\n---\n',
    expected: { a: { b: 1 }, c: 2, d: { e: 3 }, tags: ['one'] },
  },
  {
    name: 'chomping/width indicators are accepted (clip semantics)',
    src: '---\na: |-\n  kept\nb: >+\n  folded\n  lines\nc: |2\n  two\n---\n',
    expected: { a: 'kept', b: 'folded lines', c: 'two' },
  },
]

for (const { name, src, expected } of SUBSET) {
  test(`supported subset: ${name}`, () => {
    const { data, diagnostics } = parseFrontmatter(src)
    assert.deepEqual(data, expected)
    assert.deepEqual(diagnostics, [], `no diagnostics for ${name}`)
  })
}

/* ---------------- sharp edges the docs must not lie about ---------------- */

test('empty value parses to an empty mapping (documented)', () => {
  const { data, diagnostics } = parseFrontmatter('---\na:\n---\n')
  assert.deepEqual(data, { a: {} })
  assert.deepEqual(diagnostics, [])
})

test('a top-level list is exposed under data.items', () => {
  const { data, diagnostics } = parseFrontmatter('---\n- one\n- two\n---\n')
  assert.deepEqual(data.items, ['one', 'two'])
  assert.deepEqual(diagnostics, [])
})

test('quoted keys containing colons are not supported (garbage, no throw)', () => {
  const { data, diagnostics } = parseFrontmatter('---\n"my: key": 1\n---\n')
  assert.ok(data, 'parse returns data without throwing')
  assert.ok(Array.isArray(diagnostics), 'diagnostics stay an array')
})

test('empty block scalar yields an empty string', () => {
  const { data, diagnostics } = parseFrontmatter('---\na: |\n---\n')
  assert.deepEqual(data, { a: '' })
  assert.deepEqual(diagnostics, [])
})

test('unclosed block scalar stops at the closing ---', () => {
  const { data, body, diagnostics } = parseFrontmatter('---\na: |\n  one\n  two\n---\nBody')
  assert.equal(data.a, 'one\ntwo')
  assert.equal(body, 'Body')
  assert.deepEqual(diagnostics, [])
})

test('body keeps the first content line immediately after ---', () => {
  const { body } = parseFrontmatter('---\ntitle: T\n---\n# Heading\n\ntext')
  assert.equal(body, '# Heading\n\ntext')
})

// Existing behaviour checks kept verbatim so the file never regresses what was
// already pinned:
test('no frontmatter -> empty data + unchanged body', () => {
  const { data, body } = parseFrontmatter('# Hello')
  assert.deepEqual(data, {})
  assert.equal(body, '# Hello')
})

test('reports malformed and duplicate frontmatter keys without throwing', () => {
  const malformed = parseFrontmatter('---\ntitle: Good\nnot yaml\n---\nBody')
  assert.equal(malformed.data.title, 'Good')
  assert.equal(malformed.diagnostics.length, 1)
  assert.match(malformed.diagnostics[0].message, /key: value/)

  const duplicate = parseFrontmatter('---\ntitle: One\ntitle: Two\n---\n')
  assert.equal(duplicate.data.title, 'Two')
  assert.match(duplicate.diagnostics[0].message, /Duplicate/)
})

test('reports an unclosed frontmatter block', () => {
  const result = parseFrontmatter('---\ntitle: Missing\n# Body')
  assert.equal(result.body, '---\ntitle: Missing\n# Body')
  assert.match(result.diagnostics[0].message, /closing/)
})

/* ---------------- properties: no input throws, shape is stable ---------------- */

// The single non-negotiable contract: parseFrontmatter never throws, for any
// input, and always returns the { data, body, diagnostics } shape.
test('parseFrontmatter never throws, even on adversarial input', () => {
  const charset = ['-', ':', ' ', '\t', '[', ']', '{', '}', '"', "'", '|', '>', '#', '\\', '/', 'a', '1', '\r', '\n', '—', 'ع', '🙂', '.', ',', '(', ')']
  // Deterministic PRNG so failures are reproducible.
  let seed = 42
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let n = 0; n < 500; n++) {
    const len = Math.floor(rand() * 40)
    let s = ''
    for (let i = 0; i < len; i++) s += charset[Math.floor(rand() * charset.length)]
    for (const src of [s, `---\n${s}\n---\n`, `---\n${s}\ntitle: x\n---\n${s}`]) {
      const r = parseFrontmatter(src)
      assert.ok(r && typeof r === 'object', `parse returns an object for ${JSON.stringify(src)}`)
      assert.ok('data' in r && 'body' in r && 'diagnostics' in r, `shape for ${JSON.stringify(src)}`)
      assert.ok(Array.isArray(r.diagnostics))
    }
  }
})

// Mini YAML serializer for the supported subset. parse → serialize → parse must
// be stable: the second parse equals the first, and the serialization is
// deterministic (serializing the first serialize again gives identical text).
function scalar(v) {
  if (typeof v === 'string') return /[\s:,\[\]]/u.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v
  return String(v)
}

// `key: <scalar|list|map>` rendered at the given indentation, recursing so
// nested maps and lists-of-maps (the sections shape) round-trip exactly.
function linesOf(key, value, pad) {
  const out = []
  if (value === null) {
    out.push(`${pad}${key}: null`)
  } else if (Array.isArray(value)) {
    if (!value.length) {
      out.push(`${pad}${key}: []`)
    } else if (value.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      out.push(`${pad}${key}:`)
      for (const item of value) {
        const keys = Object.keys(item)
        out.push(`${pad}  - ${keys[0]}: ${scalar(item[keys[0]])}`)
        for (const rk of keys.slice(1)) {
          out.push(...linesOf(rk, item[rk], pad + '    '))
        }
      }
    } else {
      out.push(`${pad}${key}: [${value.map(scalar).join(', ')}]`)
    }
  } else if (value && typeof value === 'object') {
    out.push(`${pad}${key}:`)
    for (const [k, v] of Object.entries(value)) out.push(...linesOf(k, v, pad + '  '))
  } else {
    out.push(`${pad}${key}: ${scalar(value)}`)
  }
  return out
}

function serialize(data) {
  const out = []
  for (const [k, v] of Object.entries(data)) out.push(...linesOf(k, v, ''))
  return out
}

test('parse → serialize → parse is stable for the supported subset', () => {
  const samples = [
    { title: 'My Title', order: 1, hidden: false },
    { tags: ['js', 'css', '2026 guide'] },
    { sections: [{ component: 'Skills', items: [{ name: 'JS', level: 90 }] }, { component: 'About' }] },
    { hero: { title: 'Hi', subtitle: 'a: colon' }, nested: { deep: { deeper: true } } },
    { empty: {}, list: [] },
  ]
  for (const sample of samples) {
    const once = serialize(sample)
    const text = once.join('\n')
    const { data, diagnostics } = parseFrontmatter(`---\n${text}\n---\n`)
    assert.deepEqual(data, sample, `round-trips to the same data`)
    assert.deepEqual(diagnostics, [], `no diagnostics during round-trip`)
    assert.deepEqual(serialize(data), once, `serialization is deterministic`)
  }
})