import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { contentGraph, getContentGraph, listMarkdown, postItems, projectItems, resolveContent } from '../../core/graph.js'
import { setFallbackState } from '../../core/state.js'

let dir

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'jprot-content-'))
  mkdirSync(join(dir, 'projects'), { recursive: true })
  mkdirSync(join(dir, 'blog'), { recursive: true })
  writeFileSync(join(dir, 'index.md'), '---\ntitle: Home\n---\nhi')
  writeFileSync(join(dir, 'about.md'), '---\ntitle: About\n---\nabout')
  writeFileSync(join(dir, 'projects', 'proj.md'), '---\ntitle: Proj\norder: 1\n---\nbody')
})

test('resolveContent resolves bare, .md, index and README', async () => {
  assert.equal((await resolveContent(dir, '/about'))?.endsWith('about.md'), true)
  assert.equal((await resolveContent(dir, '/about.md'))?.endsWith('about.md'), true)
  assert.equal(await resolveContent(dir, '/'), null)
})

test('resolveContent rejects path traversal', async () => {
  assert.equal(await resolveContent(dir, '/../etc/passwd'), null)
  assert.equal(await resolveContent(dir, '/%2e%2e/etc/passwd'), null)
})

test('listMarkdown walks nested dirs', async () => {
  const files = (await listMarkdown(dir)).map((f) => f.slice(dir.length + 1))
  assert.ok(files.includes('index.md'))
  assert.ok(files.includes('projects/proj.md'))
})

test('projects sort by order and expose the legacy item shape', async () => {
  const graph = await getContentGraph({ contentDir: dir })
  const projects = projectItems(graph)
  assert.equal(projects.length, 1)
  assert.equal(projects[0].data.title, 'Proj')
  assert.equal(projects[0].url, 'projects/proj', 'legacy url drops the leading slash')
})

test('navigation includes top-level pages, omits hidden', async () => {
  writeFileSync(join(dir, 'hidden.md'), '---\ntitle: Secret\nhidden: true\n---\nx')
  const graph = await getContentGraph({ contentDir: dir })
  const labels = graph.navigation.map((n) => n.label)
  assert.ok(labels.includes('About'))
  assert.ok(!labels.includes('Secret'))
})

test('search index keeps nested index pages and normalizes scalar tags', async () => {
  mkdirSync(join(dir, 'docs'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'index.md'), '---\ntitle: Docs Home\ntags: guide\n---\nNested index body')
  writeFileSync(join(dir, 'guide.md'), '---\ntitle: Guide\ntags: [one, two]\n---\nGuide body')
  const idx = (await getContentGraph({ contentDir: dir })).searchIndex
  const docs = idx.find((e) => e.url === '/docs')
  assert.ok(docs, 'nested index page is searchable/sitemapped')
  assert.deepEqual(docs.tags, ['guide'], 'scalar tags normalizes to an array')
  const guide = idx.find((e) => e.url === '/guide')
  assert.deepEqual(guide.tags, ['one', 'two'])
  assert.equal(idx.some((e) => e.url === '/'), false, 'homepage index.md stays excluded')
})

test('docs navigation lists nested pages for the docs sidebar', async () => {
  mkdirSync(join(dir, 'guide', 'nested'), { recursive: true })
  writeFileSync(join(dir, 'guide', 'nested.md'), '---\ntitle: Nested\ndescription: d\norder: 2\n---\nn')
  writeFileSync(join(dir, 'guide', 'nested', 'deep.md'), '---\ntitle: Deep\ndescription: d\norder: 3\n---\nd')
  const graph = await getContentGraph({ contentDir: dir, docs: true })
  const urls = graph.docsNavigation.map((n) => n.url)
  assert.ok(urls.includes('guide/nested'), 'nested page included in docs sidebar')
  assert.ok(urls.includes('guide/nested/deep'), 'deeply nested page included in docs sidebar')
  assert.ok(!urls.some((u) => u.startsWith('blog/')), 'blog posts excluded from docs sidebar')
  assert.ok(!urls.some((u) => u.startsWith('projects/')), 'project entries excluded from docs sidebar')
  assert.ok(!urls.includes('index.md'), 'homepage index stays out of the docs sidebar')
  assert.ok(!urls.includes('404.md'), '404 page stays out of the docs sidebar')
})

test('contentGraph reflects instance state and exposes routes', async () => {
  setFallbackState({ contentDir: dir, site: { projectsDir: 'projects', blogDir: 'blog', docs: true } })
  const graph = await contentGraph()
  const urls = graph.routes.map((r) => r.url)
  assert.ok(urls.includes('/'), 'homepage is a route')
  assert.ok(urls.includes('/about'), 'about page is a route')
  assert.ok(urls.includes('/projects/proj'), 'project is a route')
  assert.equal(graph.docsNavigation.length > 0, true, 'docs reading order was built')
})

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})