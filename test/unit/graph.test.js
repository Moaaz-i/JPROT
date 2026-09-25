import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  canonPath,
  dateKey,
  extractHeadings,
  extractLinks,
  getContentGraph,
  isExternalTarget,
  loadContentGraph,
  resolveInternalTarget,
  stripMarkdown,
} from '../../core/graph.js'
import { makeSite, page } from '../helpers/site.js'

/* ---------------- pure helpers ---------------- */

test('canonPath folds .md, index and trailing slashes', () => {
  assert.equal(canonPath('/index.md'), '/')
  assert.equal(canonPath('/docs/index.md'), '/docs')
  assert.equal(canonPath('/about.md'), '/about')
  assert.equal(canonPath('/about/'), '/about')
  assert.equal(canonPath('/about#top'), '/about')
  assert.equal(canonPath('/about?x=1'), '/about')
  assert.equal(canonPath(''), '/')
  assert.equal(canonPath('/'), '/')
})

test('isExternalTarget covers schemes, protocol-relative and pure fragments', () => {
  assert.ok(isExternalTarget('https://example.com'))
  assert.ok(isExternalTarget('mailto:a@b.c'))
  assert.ok(isExternalTarget('//cdn.example.com/x.png'))
  assert.ok(isExternalTarget('#section'))
  assert.ok(!isExternalTarget('/about'))
  assert.ok(!isExternalTarget('about.md'))
  assert.ok(!isExternalTarget('./x.png'))
})

test('dateKey zero-pads a non-padded date so sorting is stable', () => {
  assert.equal(dateKey('2026-1-5'), '20260105')
  assert.equal(dateKey('2026-01-05'), '20260105')
  assert.ok(dateKey('2026-1-5') < dateKey('2026-1-10'))
})

test('extractLinks separates prose links from image sources', () => {
  const links = extractLinks('See [about](/about) and ![alt](img/a.png).')
  assert.deepEqual(links, [
    { kind: 'link', text: 'about', target: '/about' },
    { kind: 'image', text: 'alt', target: 'img/a.png' },
  ])
})

test('extractLinks drops empty, fragment-only and query/hash-carrying targets', () => {
  assert.deepEqual(extractLinks('[x](#top) [y](/a?b=1) [w]()'), [
    { kind: 'link', text: 'y', target: '/a' },
  ])
})

test('extractHeadings keeps the pre-disambiguation slug as `base`', () => {
  const headings = extractHeadings('# Intro\n\n## Intro\n\n### Other\n')
  assert.deepEqual(headings.map((h) => ({ id: h.id, base: h.base })), [
    { id: 'intro', base: 'intro' },
    { id: 'intro-2', base: 'intro' },
    { id: 'other', base: 'other' },
  ])
})

test('extractHeadings ignores a hash that is not a heading', () => {
  assert.deepEqual(extractHeadings('#NoSpace\n#\n# Real'), [
    { level: 1, text: 'Real', id: 'real', base: 'real' },
  ])
})

test('stripMarkdown keeps code, link text and image alt', () => {
  const text = stripMarkdown('# Title\n\nA `code` and [a link](x.md) and ![alt](y.png).\n\n```\nfenced\n```\n')
  assert.match(text, /code/)
  assert.match(text, /a link/)
  assert.match(text, /alt/)
  assert.match(text, /fenced/)
  assert.doesNotMatch(text, /x\.md|y\.png|#/)
})

test('resolveInternalTarget resolves against the served URL, not a directory', () => {
  // The server 301s `/docs/` → `/docs`, so a browser sitting at `/docs/intro`
  // resolves `../x.md` to `/x.md` — not `/docs/x.md`.
  const entry = { url: '/docs/intro' }
  assert.equal(resolveInternalTarget(entry, '../x.md'), '/x')
  assert.equal(resolveInternalTarget(entry, './x.md'), '/docs/x')
  assert.equal(resolveInternalTarget(entry, 'sibling'), '/docs/sibling')
  assert.equal(resolveInternalTarget(entry, '/absolute'), '/absolute')
  assert.equal(resolveInternalTarget(entry, 'https://x.com'), null)
  assert.equal(resolveInternalTarget(entry, '#anchor'), null)
})

/* ---------------- the graph itself ---------------- */

async function graphFor(files, config = {}) {
  const site = await makeSite({ content: files, config })
  const graph = await loadContentGraph({
    contentDir: join(site.root, 'content'),
    blogDir: join(site.root, 'content', config.blogDir || 'blog'),
    projectsDir: join(site.root, 'content', config.projectsDir || 'projects'),
    docs: config.docs === true,
  })
  return { graph, site }
}

test('the graph classifies every kind of file exactly once', async () => {
  const { graph, site } = await graphFor({
    'index.md': page({ title: 'Home', description: 'Home.' }),
    'about.md': page({ title: 'About', description: 'About.' }),
    'blog/index.md': page({ title: 'Blog', description: 'Blog.' }),
    'blog/hello.md': page({ title: 'Hello', description: 'Post.', date: '2026-01-01' }),
    'projects/index.md': page({ title: 'Projects', description: 'Projects.' }),
    'projects/widget.md': page({ title: 'Widget', description: 'Project.' }),
    '404.md': page({ title: 'Nope', description: 'Missing.' }),
    'guide/index.md': page({ title: 'Guide', description: 'Guide.' }),
    'guide/deep.md': page({ title: 'Deep', description: 'Deep.' }),
  })
  await site.cleanup()
  const byUrl = (u) => graph.byUrl.get(u)
  assert.equal(byUrl('/').kind, 'home')
  assert.equal(byUrl('/about').kind, 'page')
  assert.equal(byUrl('/blog/hello').kind, 'post')
  assert.equal(byUrl('/projects/widget').kind, 'project')
  assert.equal(byUrl('/404').kind, 'notfound')
  assert.equal(byUrl('/guide').kind, 'page')
  assert.equal(graph.entryFor(byUrl('/about').src).rel, 'about.md')
})

test('drafts and hidden pages stay out of pages, routes and search', async () => {
  const { graph, site } = await graphFor({
    'index.md': page({ title: 'Home', description: 'Home.' }),
    'live.md': page({ title: 'Live', description: 'Live.' }),
    'wip.md': page({ title: 'WIP', description: 'Draft.', extra: 'draft: true\n' }),
    'secret.md': page({ title: 'Secret', description: 'Hidden.', extra: 'hidden: true\n' }),
  })
  await site.cleanup()
  const urls = graph.pages.map((e) => e.url)
  assert.deepEqual(urls, ['/', '/live'])
  assert.ok(!graph.routes.some((r) => r.url === '/wip'))
  assert.ok(!graph.searchIndex.some((e) => e.url === '/secret'))
  // …but they are still known, so `entryFor` can find a draft for the preview.
  assert.equal(graph.entryFor(join(site.root, 'content', 'wip.md')).draft, true)
})

test('posts sort newest first and projects sort by frontmatter order', async () => {
  const { graph, site } = await graphFor({
    'index.md': page({ title: 'Home', description: 'Home.' }),
    'blog/old.md': page({ title: 'Old', description: 'Old.', date: '2024-01-01' }),
    'blog/new.md': page({ title: 'New', description: 'New.', date: '2026-01-01' }),
    'blog/mid.md': page({ title: 'Mid', description: 'Mid.', date: '2025-06-01' }),
    'projects/b.md': page({ title: 'B', description: 'B.', extra: 'order: 2\n' }),
    'projects/a.md': page({ title: 'A', description: 'A.', extra: 'order: 1\n' }),
  })
  await site.cleanup()
  assert.deepEqual(graph.posts.map((p) => p.data.title), ['New', 'Mid', 'Old'])
  assert.deepEqual(graph.projects.map((p) => p.data.title), ['A', 'B'])
})

test('the navbar lists top-level pages and honours an explicit `nav`', async () => {
  const { graph, site } = await graphFor({
    'index.md': page({ title: 'Home', description: 'Home.' }),
    'about.md': page({ title: 'About page', description: 'About.', extra: 'nav: About me\n' }),
    'guide/index.md': page({ title: 'Guide', description: 'Guide.' }),
    'guide/deep.md': page({ title: 'Deep', description: 'Deep.', extra: 'nav: Deep dive\n' }),
  })
  await site.cleanup()
  const nav = graph.navigation.map((n) => `${n.label}→${n.url}`)
  assert.ok(nav.includes('About me→about'), nav.join(', '))
  // A nested page is excluded unless it opts in with `nav:`.
  assert.ok(!nav.some((n) => n.endsWith('→guide')), nav.join(', '))
  assert.ok(nav.includes('Deep dive→guide/deep'), nav.join(', '))
})

test('the graph is a single source of truth: byUrl, lookup and entryFor agree', async () => {
  const { graph, site } = await graphFor({
    'index.md': page({ title: 'Home', description: 'Home.' }),
    'blog/hello.md': page({ title: 'Hello', description: 'Post.' }),
  })
  await site.cleanup()
  assert.equal(graph.lookup('/blog/hello.md'), graph.byUrl.get('/blog/hello'))
  assert.equal(graph.lookup('/blog/hello/'), graph.byUrl.get('/blog/hello'))
  assert.equal(graph.lookup('/nope'), null)
})

test('orphans are reported per scope, and only relative to in-scope links', async () => {
  const { graph, site } = await graphFor({
    'index.md': page({ title: 'Home', description: 'Home.', body: 'See [about](about.md) and the [guide](guide/).' }),
    'about.md': page({ title: 'About', description: 'About.' }),
    'guide/index.md': page({ title: 'Guide', description: 'Guide.', body: 'See [deep](deep.md).' }),
    'guide/deep.md': page({ title: 'Deep', description: 'Deep.' }),
    'elsewhere.md': page({ title: 'Elsewhere', description: 'x', body: 'See [deep](guide/deep.md).' }),
  })
  await site.cleanup()
  // Everything is reachable, so the full-graph scope finds nothing.
  assert.deepEqual(graph.orphans().map((e) => e.rel), [])

  // Drop the one page that links to `guide/deep.md` and it becomes an orphan:
  // an ignored file must not be able to vouch for a page that only it links to.
  const scoped = graph.orphans(new Set(graph.entries.filter((e) => e.rel !== 'elsewhere.md')))
  assert.ok(scoped.map((e) => e.rel).includes('guide/deep.md'), scoped.map((e) => e.rel).join(', '))

  // Excluding the page itself removes it from the report rather than reporting
  // it anyway — the scope is a filter, not a re-classifier.
  const withoutDeep = graph.orphans(new Set(graph.entries.filter((e) => e.rel !== 'guide/deep.md')))
  assert.ok(!withoutDeep.map((e) => e.rel).includes('guide/deep.md'))
})

test('getContentGraph reuses the graph while the content tree is unchanged', async () => {
  const site = await makeSite({ content: { 'index.md': page({ title: 'Home', description: 'Home.' }) } })
  const options = {
    contentDir: join(site.root, 'content'),
    blogDir: join(site.root, 'content', 'blog'),
    projectsDir: join(site.root, 'content', 'projects'),
  }
  const a = await getContentGraph(options)
  const b = await getContentGraph(options)
  assert.equal(a, b, 'an unchanged tree must not rebuild the graph')

  // …and a change is picked up without an explicit invalidation.
  await writeFile(join(options.contentDir, 'index.md'), page({ title: 'Renamed', description: 'Home.' }))
  const c = await getContentGraph(options)
  assert.notEqual(a, c)
  assert.equal(c.byUrl.get('/').data.title, 'Renamed')
  await site.cleanup()
})

test('loadContentGraph always rebuilds — the cache is getContentGraph\'s job', async () => {
  const site = await makeSite({ content: { 'index.md': page({ title: 'Home', description: 'Home.' }) } })
  const options = {
    contentDir: join(site.root, 'content'),
    blogDir: join(site.root, 'content', 'blog'),
    projectsDir: join(site.root, 'content', 'projects'),
  }
  const a = await loadContentGraph(options)
  const b = await loadContentGraph(options)
  await site.cleanup()
  assert.notEqual(a, b)
})

test('editing a file is visible to the next graph build', async () => {
  const site = await makeSite({ content: { 'index.md': page({ title: 'Home', description: 'Home.' }) } })
  const options = {
    contentDir: join(site.root, 'content'),
    blogDir: join(site.root, 'content', 'blog'),
    projectsDir: join(site.root, 'content', 'projects'),
  }
  const before = await loadContentGraph(options)
  await writeFile(join(site.root, 'content', 'index.md'), page({ title: 'Renamed', description: 'Home.' }))
  const after = await loadContentGraph(options)
  await site.cleanup()
  assert.equal(before.byUrl.get('/').data.title, 'Home')
  assert.equal(after.byUrl.get('/').data.title, 'Renamed')
})
