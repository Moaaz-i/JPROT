// Snapshot tests: the rendered shape of every engine surface, locked down.
//
// These are the tests that catch a regression nobody thought to write a unit
// test for — a shortcode that stops nesting, a `<head>` that loses a meta tag,
// a sitemap that forgets the home page. The value is entirely in the diff: when
// a snapshot fails, the printed difference *is* the explanation.
//
// Regenerate deliberately with `npm run test:update` and read the diff before
// committing it.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createJprot } from '../../core/server.js'
import { makeSite, matchSnapshot, page } from '../helpers/site.js'

// One file of every kind: nested pages, a blog, a project, a 404, an orphan and
// a draft. If a snapshot breaks, something structural moved.
const FILES = {
  'index.md': page({
    title: 'Home',
    description: 'The homepage.',
    body: 'Welcome. See [about](about.md) and [a post](blog/hello.md).',
  }),
  'about.md': page({
    title: 'About',
    description: 'About the site.',
    body: '# About\n\nBack to [home](/).\n\n## Details\n\n- one\n- two\n',
  }),
  'blog/index.md': page({ title: 'Blog', description: 'Posts.', body: 'All posts.' }),
  'blog/hello.md': page({
    title: 'Hello',
    description: 'The first post.',
    date: '2026-01-02',
    body: 'A post with a [relative link](../about.md) and a footnote.[^1]\n\n[^1]: The note.\n',
  }),
  'blog/draft.md': page({
    title: 'Draft',
    description: 'Not published.',
    extra: 'draft: true\n',
    body: 'Should not appear anywhere.',
  }),
  'projects/index.md': page({ title: 'Projects', description: 'Work.', body: 'Projects.' }),
  'projects/widget.md': page({
    title: 'Widget',
    description: 'A project.',
    body: ':::Callout type="info"\nHello from a shortcode.\n:::\n',
  }),
  '404.md': page({ title: 'Not found', description: 'Missing.', body: 'Gone.' }),
  'orphan.md': page({ title: 'Orphan', description: 'Unlinked.', body: 'Nobody links here.' }),
}

const CONFIG = {
  title: 'Snapshot site',
  tagline: 'Locked down',
  description: 'A site used by the snapshot tests.',
  url: 'https://example.com',
  lang: 'en',
  dir: 'ltr',
  docs: true,
  author: 'Test Author',
  email: 'test@example.com',
  sections: [{ component: 'Home' }, { component: 'Projects' }, { component: 'Blog' }],
}

// The CSP nonce is random per response, the origin depends on the port the OS
// handed out, and `<lastmod>` falls back to the file mtime — which for a
// throwaway site is "today", so a snapshot would break every morning.
// Everything else must match byte for byte.
const canonical = (text) => text
  .replace(/nonce="[^"]*"/g, 'nonce="…"')
  .replace(/https?:\/\/127\.0\.0\.1:\d+/g, 'https://example.com')
  .replace(/<lastmod>[^<]*<\/lastmod>/g, '<lastmod>…</lastmod>')
  .replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/g, '<lastBuildDate>…</lastBuildDate>')
  .replace(/"date":"\d{4}-\d{2}-\d{2}"/g, '"date":"…"')

let site
let app
let base

before(async () => {
  site = await makeSite({ content: FILES, config: CONFIG })
  app = await createJprot({ root: site.root, watch: false })
  const port = await app.listen(0)
  base = `http://127.0.0.1:${port}`
})

after(async () => {
  if (app?.closeWatcher) app.closeWatcher()
  if (app?.server?.listening) await new Promise((r) => app.server.close(r))
  if (site) await site.cleanup()
})

const get = async (path) => (await fetch(base + path)).text()

const PAGES = {
  home: '/',
  about: '/about',
  blog: '/blog',
  post: '/blog/hello',
  projects: '/projects',
  project: '/projects/widget',
  missing: '/no-such-page',
}

for (const [name, path] of Object.entries(PAGES)) {
  test(`page snapshot: ${name}`, async () => {
    const { match, path: file, expected, created } = await matchSnapshot(
      `page-${name}.html`,
      canonical(await get(path)),
    )
    assert.ok(
      match,
      created
        ? `snapshot created at ${file} — re-run the test to compare`
        : `snapshot mismatch for ${path}\n${firstDiff(expected, canonical(await get(path)))}`,
    )
  })
}

const ENDPOINTS = {
  'search.json': '/@jprot/search.json',
  'sitemap.xml': '/sitemap.xml',
  'feed.xml': '/feed.xml',
  'robots.txt': '/robots.txt',
  'manifest.json': '/manifest.json',
  'llms.txt': '/llms.txt',
  'llms-full.txt': '/llms-full.txt',
}

for (const [name, path] of Object.entries(ENDPOINTS)) {
  test(`endpoint snapshot: ${name}`, async () => {
    const { match, path: file, expected, created } = await matchSnapshot(
      `endpoint-${name}`,
      canonical(await get(path)),
    )
    assert.ok(
      match,
      created
        ? `snapshot created at ${file} — re-run the test to compare`
        : `snapshot mismatch for ${path}\n${firstDiff(expected, canonical(await get(path)))}`,
    )
  })
}

test('drafts never reach the search index or the sitemap', async () => {
  const search = JSON.parse(await get('/@jprot/search.json'))
  const urls = search.map((e) => e.url)
  assert.ok(!urls.includes('/blog/draft'), 'draft leaked into search.json')
  const sitemap = await get('/sitemap.xml')
  assert.ok(!sitemap.includes('/blog/draft'), 'draft leaked into sitemap.xml')
})

// The first line that differs, so a failing snapshot prints one readable line
// instead of a 400-line unified diff.
function firstDiff(expected, actual) {
  if (expected === undefined) return '(no snapshot on disk)'
  const a = String(expected).split('\n')
  const b = String(actual).split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `  line ${i + 1}\n  - expected: ${a[i] ?? '(end of file)'}\n  + actual:   ${b[i] ?? '(end of file)'}`
    }
  }
  return ''
}
