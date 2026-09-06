import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderDocumentBody } from '../core/render.js'
import { createMarkdown } from '../lib/markdown.js'

const md = createMarkdown()
const comp = async ({ title = '', children = '' }) => `<div class="blk">${title}: ${children}</div>`
const components = { Card: comp }

test('renderDocumentBody renders a closed shortcode and its children', async () => {
  const html = await renderDocumentBody('Intro\n\n:::Card title="A"\nInner **bold**\n:::\n\nTail.', md, components, {})
  assert.match(html, /Intro/)
  assert.match(html, /<div class="blk">A: <p>Inner <strong>bold<\/strong><\/p>\n<\/div>/)
  assert.match(html, /Tail\./)
})

test('renderDocumentBody tolerates indentation on open and close fences', async () => {
  const html = await renderDocumentBody('  :::Card title="X"\nBody\n  :::\nAfter.', md, components, {})
  assert.match(html, /<div class="blk">X:/)
  assert.match(html, /After\./)
})

test('renderDocumentBody does not swallow the document after an unterminated shortcode', async () => {
  const html = await renderDocumentBody('Keep me.\n\n:::Card title="Lost"\ninner line\n\nAnd everything after must stay.\n', md, components, {})
  assert.match(html, /Keep me\./)
  assert.match(html, /inner line/)
  assert.match(html, /And everything after must stay\./)
  assert.doesNotMatch(html, /class="blk"/)
})

test('renderDocumentBody keeps shortcodes inside code fences literal', async () => {
  const html = await renderDocumentBody('```\n:::Card\n```\n\nReal text.', md, components, {})
  assert.doesNotMatch(html, /class="blk"/)
  assert.match(html, /Real text\./)
})