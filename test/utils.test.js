import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esc, isInside, slugify, MIME } from '../core/utils.js'

test('esc escapes HTML metacharacters', () => {
  assert.equal(esc('a&b<c>"d"'), 'a&amp;b&lt;c&gt;&quot;d&quot;')
  assert.equal(esc(null), '')
  assert.equal(esc(undefined), '')
  assert.equal(esc(42), '42')
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
