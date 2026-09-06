import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter } from '../lib/frontmatter.js'

test('no frontmatter -> empty data + unchanged body', () => {
  const { data, body } = parseFrontmatter('# Hello')
  assert.deepEqual(data, {})
  assert.equal(body, '# Hello')
})

test('basic key/value frontmatter', () => {
  const { data, body } = parseFrontmatter('---\ntitle: My Site\ndescription: A portfolio\n---\n# Body')
  assert.equal(data.title, 'My Site')
  assert.equal(data.description, 'A portfolio')
  assert.equal(body, '# Body')
})

test('typed values: numbers, booleans, arrays', () => {
  const { data } = parseFrontmatter('---\norder: 3\nhidden: true\nactive: false\ntags: [js, css]\n---\n')
  assert.equal(data.order, 3)
  assert.equal(data.hidden, true)
  assert.equal(data.active, false)
  assert.deepEqual(data.tags, ['js', 'css'])
})

test('nested list of mappings (sections config)', () => {
  const { data } = parseFrontmatter(
    '---\nsections:\n  - component: Skills\n    items:\n      - name: JS\n        level: 90\n  - component: About\n---\n'
  )
  assert.ok(Array.isArray(data.sections))
  assert.equal(data.sections[0].component, 'Skills')
  assert.equal(data.sections[0].items[0].name, 'JS')
  assert.equal(data.sections[0].items[0].level, 90)
  assert.equal(data.sections[1].component, 'About')
})
