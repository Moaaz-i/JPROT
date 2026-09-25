import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeployment, deployUrlFor, normalizeBasePath, resolveDeployment } from '../../core/deploy.js'
import { makeSite } from '../helpers/site.js'

test('normalizeBasePath canonicalizes to either nothing or /segment', () => {
  assert.equal(normalizeBasePath(undefined), '')
  assert.equal(normalizeBasePath(''), '')
  assert.equal(normalizeBasePath('/'), '')
  assert.equal(normalizeBasePath('  '), '')
  assert.equal(normalizeBasePath('repo'), '/repo')
  assert.equal(normalizeBasePath('/repo/'), '/repo')
  assert.equal(normalizeBasePath('//repo//'), '/repo')
  assert.equal(normalizeBasePath('/a/b'), '/a/b')
})

test('deployUrlFor folds the base path into the site URL exactly once', () => {
  assert.equal(deployUrlFor({ url: 'https://e.com' }, ''), 'https://e.com')
  assert.equal(deployUrlFor({ url: 'https://e.com' }, '/repo'), 'https://e.com/repo')
  assert.equal(deployUrlFor({ url: 'https://e.com/' }, '/repo'), 'https://e.com/repo')
  // Already folded in (the author set url to the project site) — no doubling.
  assert.equal(deployUrlFor({ url: 'https://e.com/repo' }, '/repo'), 'https://e.com/repo')
  // No url configured: nothing to fold into.
  assert.equal(deployUrlFor({}, '/repo'), '')
})

test('an empty base path makes every rewriter a no-op', () => {
  const d = createDeployment({ basePath: '' })
  const html = '<a href="/about">About</a>'
  assert.equal(d.rewriteHtml(html), html)
  assert.equal(d.rewriteSearchIndex('[{"url":"/about"}]'), '[{"url":"/about"}]')
  assert.equal(d.rewriteManifest('{"start_url":"/"}'), '{"start_url":"/"}')
})

test('rewriteHtml prefixes root-relative hrefs, srcs and fetches', () => {
  const d = createDeployment({ basePath: '/repo' })
  const html = [
    '<a href="/about">a</a>',
    '<img src="/logo.svg">',
    '<form action="/subscribe"></form>',
    '<video poster="/clip.png"></video>',
    "<script>fetch('/@jprot/search.json')</script>",
  ].join('\n')
  const out = d.rewriteHtml(html)
  assert.match(out, /href="\/repo\/about"/)
  assert.match(out, /src="\/repo\/logo\.svg"/)
  assert.match(out, /action="\/repo\/subscribe"/)
  assert.match(out, /poster="\/repo\/clip\.png"/)
  assert.match(out, /fetch\('\/repo\/@jprot\/search\.json'\)/)
})

test('rewriteHtml leaves external, fragment and protocol-relative URLs alone', () => {
  const d = createDeployment({ basePath: '/repo' })
  const html = [
    '<a href="https://e.com/x">x</a>',
    '<a href="mailto:a@b.c">m</a>',
    '<a href="#top">t</a>',
    '<img src="//cdn.e.com/a.png">',
    '<a href="javascript:void(0)">j</a>',
  ].join('\n')
  assert.equal(d.rewriteHtml(html), html)
})

test('rewriteHtml restores the `/https://…` header-link form', () => {
  const d = createDeployment({ basePath: '/repo' })
  assert.match(d.rewriteHtml('<a href="/https://e.com">e</a>'), /href="https:\/\/e\.com"/)
})

test('rewriteHtml adds a trailing slash to links to exported pages only', () => {
  const d = createDeployment({ basePath: '/repo', pageUrls: new Set(['/', '/about', '/docs/intro']) })
  // A page: exported as `about/index.html`, so the link must keep its slash.
  assert.match(d.rewriteHtml('<a href="/about">a</a>'), /href="\/repo\/about\/"/)
  // The homepage and plain files must not gain one.
  assert.match(d.rewriteHtml('<a href="/">h</a>'), /href="\/repo\/"/)
  assert.match(d.rewriteHtml('<a href="/logo.svg">l</a>'), /href="\/repo\/logo\.svg"/)
})

test('rewriteHtml resolves a relative href against the page it is on', () => {
  const pages = new Set(['/', '/about', '/sibling'])
  const d = createDeployment({ basePath: '/repo', pageUrls: pages })
  assert.match(d.rewriteHtml('<a href="sibling">s</a>', '/about'), /href="\/repo\/sibling\/"/)
  // A relative link that does not resolve to a known page falls back to the
  // site root, which is what documentation cross-links actually mean.
  assert.match(d.rewriteHtml('<a href="content">c</a>', '/about'), /href="\/repo\/content"/)
})

test('rewriteHtml never double-prefixes an already rewritten value', () => {
  const d = createDeployment({ basePath: '/repo' })
  const once = d.rewriteHtml('<a href="/about">a</a>')
  assert.equal(d.rewriteHtml(once), once)
})

test('rewriteSearchIndex prefixes every result URL and leaves bad JSON alone', () => {
  const d = createDeployment({ basePath: '/repo' })
  assert.deepEqual(
    JSON.parse(d.rewriteSearchIndex('[{"url":"/"},{"url":"/about"}]')),
    [{ url: '/repo/' }, { url: '/repo/about/' }],
  )
  assert.equal(d.rewriteSearchIndex('not json'), 'not json')
  assert.equal(d.rewriteSearchIndex('{"not":"an array"}'), '{"not":"an array"}')
})

test('rewriteManifest scopes the PWA to the deployment root', () => {
  const d = createDeployment({ basePath: '/repo' })
  const out = JSON.parse(d.rewriteManifest(JSON.stringify({
    start_url: '/',
    scope: '/',
    icons: [{ src: '/icon.svg' }, { src: 'https://cdn.e.com/i.png' }],
  })))
  assert.equal(out.start_url, '/repo/')
  assert.equal(out.scope, '/repo/')
  assert.equal(out.icons[0].src, '/repo/icon.svg')
  assert.equal(out.icons[1].src, 'https://cdn.e.com/i.png', 'absolute icon URLs stay absolute')
})

test('withPages returns the same deployment re-scoped to a known page list', () => {
  const d = createDeployment({ basePath: '/repo' })
  assert.match(d.rewriteHtml('<a href="/about">a</a>'), /href="\/repo\/about"/)
  const scoped = d.withPages(['/', '/about'])
  assert.equal(scoped.basePath, '/repo')
  assert.match(scoped.rewriteHtml('<a href="/about">a</a>'), /href="\/repo\/about\/"/)
})

test('resolveDeployment reads the config and returns a deployment-correct copy', async () => {
  const site = await makeSite({ config: { url: 'https://e.com', basePath: '/repo', title: 'T' } })
  const { config, deployment, exportConfig } = await resolveDeployment({ root: site.root })
  await site.cleanup()
  assert.equal(config.title, 'T')
  assert.equal(deployment.basePath, '/repo')
  // The config handed to the exporting server already carries the folded URL,
  // so sitemap/feed/robots/canonical point at the real host.
  assert.equal(exportConfig.url, 'https://e.com/repo')
  assert.equal(config.url, 'https://e.com', 'the original config is not mutated')
})

test('an explicit basePath argument wins over the configured one', async () => {
  const site = await makeSite({ config: { url: 'https://e.com', basePath: '/from-config' } })
  const a = await resolveDeployment({ root: site.root })
  const b = await resolveDeployment({ root: site.root, basePath: '/from-flag' })
  const c = await resolveDeployment({ root: site.root, basePath: '' })
  await site.cleanup()
  assert.equal(a.deployment.basePath, '/from-config')
  assert.equal(b.deployment.basePath, '/from-flag')
  assert.equal(c.deployment.basePath, '', 'an explicit empty base path means "root domain"')
})
