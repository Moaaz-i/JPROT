import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadComponents, interpolateMdValues } from '../core/components.js'
import { renderSections, renderDocumentBody } from '../core/render.js'
import { createMarkdown } from '../lib/markdown.js'
import { createJprot } from '../core/server.js'
import { scaffoldSite } from '../core/scaffold.js'

const md = createMarkdown()

test('interpolateMdValues replaces known [values] and leaves others alone', () => {
  assert.equal(interpolateMdValues('Hi [name]!', { name: 'aha' }), 'Hi aha!')
  assert.equal(interpolateMdValues('[name] and [missing]', { name: 'aha' }), 'aha and [missing]')
  assert.equal(interpolateMdValues('a [value]=1 and [[1,2]]', { value: 'x' }), 'a x=1 and [[1,2]]')
})

test('interpolateMdValues does not touch Markdown links nor escaped brackets', () => {
  assert.equal(interpolateMdValues('[title](https://e.com)', { title: 'T' }), '[title](https://e.com)')
  assert.equal(interpolateMdValues('\\[title] stays', { title: 'T' }), '[title] stays')
})

test('interpolateMdValues formats arrays as lists and objects as JSON', () => {
  assert.equal(interpolateMdValues('[items]', { items: ['a', 'b'] }), '- a\n- b')
  assert.equal(interpolateMdValues('[items]', { items: [] }), '')
  assert.equal(interpolateMdValues('[meta]', { meta: { n: 1 } }), '{"n":1}')
})

test('loadComponents turns a .md file into a renderable component', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-mdcomp-'))
  try {
    await mkdir(join(dir, 'theme', 'components'), { recursive: true })
    await writeFile(
      join(dir, 'theme', 'components', 'Hobbies.md'),
      `---\nsubtitle: My default subtitle\nitems:\n  - Reading\n  - Cycling\n---\n## [title]\n\n[subtitle]\n\n[items]\n`,
      'utf8'
    )
    const components = await loadComponents(join(dir, 'theme'), false, md)
    assert.equal(typeof components.Hobbies, 'function')

    const html = await components.Hobbies({ title: 'هواياتي' })
    assert.match(html, /<div class="md-component-hobbies">/)
    assert.match(html, /<h2 id="هواياتي"|>هواياتي</)
    assert.match(html, /My default subtitle/)
    assert.match(html, /<li>Reading<\/li>/)
    assert.match(html, /<li>Cycling<\/li>/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('md components render both as sections and as shortcodes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-mdcomp2-'))
  try {
    await mkdir(join(dir, 'theme', 'components'), { recursive: true })
    await writeFile(
      join(dir, 'theme', 'components', 'Hobbies.md'),
      `---\nsubtitle: default subtitle\nitems: []\n---\n## [title]\n\n[subtitle]\n\n[items]\n`,
      'utf8'
    )
    const components = await loadComponents(join(dir, 'theme'), false, md)

    const sectionsHtml = await renderSections({
      site: {}, page: {}, nav: [], projects: [], posts: [],
      sections: [{ component: 'Hobbies', title: 'My Work', items: ['One', 'Two'] }],
      components,
    })
    assert.match(sectionsHtml, /My Work/)
    assert.match(sectionsHtml, /default subtitle/)
    assert.match(sectionsHtml, /<li>One<\/li>/)
    assert.match(sectionsHtml, /<li>Two<\/li>/)

    const bodyHtml = await renderDocumentBody(
      'Intro.\n\n:::Hobbies title="Inline title"\n',
      md, components, {}
    )
    assert.match(bodyHtml, /Inline title/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('end to end: a .md component serves over HTTP', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-mdcomp3-'))
  try {
    await scaffoldSite({ root: dir, type: 'portfolio' })
    await mkdir(join(dir, 'theme', 'components'), { recursive: true })
    await writeFile(
      join(dir, 'theme', 'components', 'Stamp.md'),
      `---\nlabel: beta\n---\n> [label] -- [title]\n`,
      'utf8'
    )
    await writeFile(join(dir, 'content', 'mdcomp.md'), `---\ntitle: MD Comp\n---\n:::Stamp title="hello"\n`)
    const app = await createJprot({ root: dir, watch: false })
    const base = `http://127.0.0.1:${await app.listen(0)}`
    try {
      const res = await fetch(base + '/mdcomp')
      assert.equal(res.status, 200)
      const html = await res.text()
      assert.match(html, /beta -- hello/)
    } finally {
      app.server.close()
      await app.closeWatcher()
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})