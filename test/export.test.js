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
  const dest = await exportSite({ root, outDir: out })
  try {
    // home + a clean-URL page + a blog post
    for (const rel of ['index.html', 'getting-started/index.html', 'blog/jprot-vs-vitepress/index.html', '404.html', 'feed.xml', 'sitemap.xml', 'robots.txt', 'llms.txt', 'manifest.json']) {
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