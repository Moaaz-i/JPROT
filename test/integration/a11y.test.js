// Accessibility of the served pages and the SPA shell.
//
// These assert the static, server-rendered surface of the a11y work: the skip
// link is the first focusable element, <main> is a focus target, the page
// change is announced through a live region, and the active nav link carries
// aria-current. The runtime half (focus movement + announcement on pushState)
// lives in the inline SPA script; we assert the script ships with the
// plumbing, since there is no DOM here to execute it against.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createJprot } from '../../core/server.js'
import { makeSite, page } from '../helpers/site.js'

const CONTENT = {
  'index.md': page({ title: 'Home', body: '# Home\n' }),
  'about.md': page({ title: 'About', body: '# About\n' }),
}

const CONFIG = {
  title: 'A11y site',
  description: 'Accessibility test site.',
  url: 'https://example.com',
  lang: 'en',
  dir: 'ltr',
  nav: [
    { label: 'Home', url: '/' },
    { label: 'About', url: '/about' },
  ],
}

let site
let app
let base

before(async () => {
  site = await makeSite({ content: CONTENT, config: CONFIG })
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

test('skip link is the first focusable element and targets #jprot-main', async () => {
  const html = await get('/')
  const body = html.slice(html.indexOf('<body>'))
  // The skip link must appear before the header/nav so tab hits it first —
  // otherwise "skip to content" is redundant with tabbing through the nav.
  const skipIdx = body.indexOf('class="skip-link"')
  const headerIdx = body.indexOf('<header')
  assert.ok(skipIdx > 0, 'skip link is present')
  assert.ok(skipIdx < headerIdx, 'skip link precedes the header')
  const skip = body.slice(skipIdx, skipIdx + 120)
  assert.match(skip, /href="#jprot-main"/)
})

test('<main> is a focus target and every page announces route changes', async () => {
  for (const path of ['/', '/about']) {
    const html = await get(path)
    assert.match(html, /<main id="jprot-main" tabindex="-1" class=/, `focusable main on ${path}`)
    assert.match(html, /id="jprot-announce"[^>]*role="status"/, `live region on ${path}`)
    // The SPA script must ship the announcement + focus plumbing so a
    // click-through never goes silent.
    assert.match(html, /function announceAndFocus\(\)/, `SPA announce plumbing on ${path}`)
    assert.match(html, /getElementById\('jprot-announce'\)/, `live region hookup on ${path}`)
  }
})

test('active nav link carries aria-current="page", inactive links carry none', async () => {
  const html = await get('/about')
  const about = html.match(/href="\/about"[^>]*>/)?.[0] ?? ''
  assert.match(about, /aria-current="page"/, 'current page link is announced')
  const home = html.match(/href="\/"[^>]*class="nav-link[^"]*"[^>]*>/)?.[0] ?? ''
  assert.ok(!/aria-current/.test(home), 'other links carry no aria-current')
})