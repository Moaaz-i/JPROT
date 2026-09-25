import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDocument, renderDocumentBody } from '../../core/render.js'
import { createMarkdown } from '../../lib/markdown.js'

const md = createMarkdown()
const comp = async ({ title = '', children = '' }) => `<div class="blk">${title}: ${children}</div>`
const components = { Card: comp }
// A container + leaf pair: the shape a plugin or theme would ship for tabs,
// accordions, or any "parent renders N children" component.
const Tabs = async ({ children = '' }) => `<div class="tabs">${children}</div>`
const Tab = async ({ name = '', children = '' }) => `<div class="tab">${name}: ${children}</div>`

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

test('renderDocumentBody renders a self-closing shortcode without a closing fence', async () => {
  const html = await renderDocumentBody('Intro.\n\n:::Card title="Solo"\n\nTail.', md, components, {})
  assert.match(html, /Intro\./)
  assert.match(html, /<div class="blk">Solo: <\/div>/)
  assert.match(html, /Tail\./)
})

test('renderDocumentBody self-closes a shortcode on the last line of the document', async () => {
  const html = await renderDocumentBody(':::Card title="End"\n', md, components, {})
  assert.match(html, /<div class="blk">End: <\/div>/)
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

test('nested shortcodes render children inside children', async () => {
  const nested = { Tabs, Tab, ...components }
  const html = await renderDocumentBody(
    ':::Tabs\n:::Tab name="npm"\nnpm install jprot\n:::\n:::Tab name="pnpm"\npnpm add jprot\n:::\n:::',
    md,
    nested,
    {},
  )
  assert.match(html, /<div class="tabs"><div class="tab">npm: <p>npm install jprot/)
  assert.match(html, /<div class="tab">pnpm: <p>pnpm add jprot/)
})

test('an inner shortcode failure does not break the outer one', async () => {
  const html = await renderDocumentBody(
    ':::Card title="outer"\n:::Nope\n:::\n:::',
    md,
    components,
    {},
  )
  assert.match(html, /jprot-shortcode-missing/)
  assert.match(html, /<div class="blk">outer: /)
})

test('parseDocument produces markdown and shortcode nodes', () => {
  const nodes = parseDocument('Text\n\n:::Card title="A"\nchild\n:::')
  assert.equal(nodes[0].type, 'markdown')
  assert.equal(nodes[1].type, 'shortcode')
  assert.equal(nodes[1].name, 'Card')
  assert.deepEqual(nodes[1].attrs, { title: 'A' })
  assert.equal(nodes[1].children[0].type, 'markdown')
  assert.equal(nodes[1].line, 3)
})