import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { exportSite } from '../core/export.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function exists(p) { try { await stat(p); return true } catch { return false } }

test('exportSite renders the whole site to dist/', async () => {
  const out = join(tmpdir(), 'jprot-export-' + Date.now())
  const dest = await exportSite({ root, outDir: out, basePath: '' })
  try {
    // home + a clean-URL page + a blog post
    for (const rel of ['index.html', 'getting-started/index.html', 'blog/jprot-vs-vitepress/index.html', '404.html', '.nojekyll', 'feed.xml', 'sitemap.xml', 'robots.txt', 'llms.txt', 'manifest.json']) {
      assert.ok(await exists(join(dest, rel)), `missing ${rel}`)
    }
    // draft content must not appear
    const sitemap = await readFile(join(dest, 'sitemap.xml'), 'utf8')
    assert.ok(!/_jprot-draft-probe/.test(sitemap))

    // theme CSS is fingerprinted and referenced by hashed path (no runtime query)
    const home = await readFile(join(dest, 'index.html'), 'utf8')
    assert.match(home, /<link rel="stylesheet" href="\/@jprot\/css\/[0-9a-f]{16}\.css">/)
    assert.doesNotMatch(home, /@jprot\/css\?f=/)

    // generated og:image exported as a real file referenced by pages
    const og = home.match(/<meta property="og:image" content="(\/@jprot\/og\/[0-9a-f]{16}\.svg)">/)[1]
    assert.ok(await exists(join(dest, og.replace(/^\//, ''))), 'og svg exported')
  } finally {
    const { rm } = await import('node:fs/promises')
    await rm(out, { recursive: true, force: true })
  }
})

test('exportSite prefixes URLs for a project GitHub Pages site', async () => {
  const out = join(tmpdir(), 'jprot-pages-' + Date.now())
  const dest = await exportSite({ root, outDir: out, basePath: '/JPROT' })
  try {
    const home = await readFile(join(dest, 'index.html'), 'utf8')
    assert.match(home, /href="\/JPROT\/getting-started\/"/)
    assert.match(home, /href="\/JPROT\/@jprot\/css\/[0-9a-f]{16}\.css"/)
    assert.match(home, /href="\/JPROT' \+ \(e\.url === '\/' \? '\/' : e\.url\.replace/)
    assert.doesNotMatch(home, /href="\/getting-started"/)
    assert.doesNotMatch(home, /\/JPROT\/https?:\/\//)
    assert.doesNotMatch(home, /href="\/JPROT\/(?:mailto:|tel:|data:)/)
    assert.match(home, /https:\/\/github\.com\/Moaaz-i\/JPROT/)
    assert.match(home, /href="\/JPROT\/quick-start\/"/)
    assert.ok(await exists(join(dest, '@jprot', 'og')), 'og assets directory exported')

    for (const rel of ['quick-start', 'getting-started', 'content', 'configuration', 'customization', 'deploy', 'cli-reference', 'api-reference', 'examples']) {
      assert.ok(await exists(join(dest, rel, 'index.html')), `missing page index for ${rel}`)
    }
    const quickStart = await readFile(join(dest, 'quick-start', 'index.html'), 'utf8')
    assert.match(quickStart, /href="\/JPROT\/getting-started\/"/)
    assert.doesNotMatch(quickStart, /href="\/JPROT\/quick-start\/getting-started/)
  } finally {
    const { rm } = await import('node:fs/promises')
    await rm(out, { recursive: true, force: true })
  }
})