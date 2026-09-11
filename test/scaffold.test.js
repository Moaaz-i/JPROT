import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJprot } from '../core/server.js'
import { scaffoldSite, scaffoldNew, scaffoldComponent, componentPaletteList } from '../core/scaffold.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function makeProject(extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-t-'))
  await scaffoldSite({ root: dir, type: 'portfolio' })
  if (extra.component) {
    await mkdir(join(dir, 'theme', 'components'), { recursive: true })
    await writeFile(join(dir, 'theme', 'components', extra.component + '.js'), `export default async (p) => '<div class="test-comp-${extra.component.toLowerCase()}">' + (p.title || '') + ': ' + (p.children || '') + '</div>'\n`)
  }
  return dir
}

test('scaffoldSite writes the full skeleton', async () => {
  const dir = await makeProject()
  try {
    for (const f of ['jprot.config.js', 'content/index.md', 'content/blog.md', 'content/projects/example.md', 'theme/custom.css', '.vscode/jprot.code-snippets']) {
      await stat(join(dir, f))
    }
    const config = await readFile(join(dir, 'jprot.config.js'), 'utf8')
    assert.match(config, /export default/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('docs scaffold enables the documentation shell', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-docs-'))
  try {
    await scaffoldSite({ root: dir, type: 'docs' })
    const config = await readFile(join(dir, 'jprot.config.js'), 'utf8')
    assert.match(config, /docs: true/)
    assert.match(config, /sidebar: true/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('scaffoldNew creates a post and rejects duplicates', async () => {
  const dir = await makeProject()
  try {
    const file = await scaffoldNew({ root: dir, kind: 'post', title: 'My First Post' })
    const body = await readFile(file, 'utf8')
    assert.match(body, /title: My First Post/)
    assert.match(body, /\d{4}-\d{2}-\d{2}/)
    await assert.rejects(() => scaffoldNew({ root: dir, kind: 'post', title: 'My First Post' }))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('jprot g component scaffolds a working component', async () => {
  const dir = await makeProject()
  try {
    const file = await scaffoldComponent({ root: dir, palette: 'cta', name: 'JoinBanner' })
    const src = await readFile(file, 'utf8')
    assert.match(src, /export default function/)
    assert.match(src, /title/)
    assert.ok(componentPaletteList().length >= 4)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('shortcodes: :::component renders registered components', async () => {
  const dir = await makeProject({ component: 'Thing' })
  const slug = 'shortcode-page'
  await writeFile(join(dir, 'content', slug + '.md'), `---\ntitle: Shortcode\n---\nIntro text.\n\n:::Thing title="My thing"\n\nInner **markdown**\n:::\n`)
  const app = await createJprot({ root: dir, watch: false })
  const base = `http://127.0.0.1:${await app.listen(0)}`
  try {
    const res = await fetch(base + '/' + slug)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /test-comp-thing/)
    assert.match(html, /My thing/)
    assert.match(html, /<strong>markdown<\/strong>/) // children are markdown-rendered
  } finally {
    app.server.close()
    await app.closeWatcher()
    await rm(dir, { recursive: true, force: true })
  }
})

test('shortcodes: unknown component shows a hint and keeps the page alive', async () => {
  const dir = await makeProject()
  const slug = 'bad-shortcode'
  await writeFile(join(dir, 'content', slug + '.md'), `---\ntitle: Bad\n---\n:::Nope x=1\n`)
  const app = await createJprot({ root: dir, watch: false })
  const base = `http://127.0.0.1:${await app.listen(0)}`
  try {
    const res = await fetch(base + '/' + slug)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /jprot-shortcode-missing/)
  } finally {
    app.server.close()
    await app.closeWatcher()
    await rm(dir, { recursive: true, force: true })
  }
})