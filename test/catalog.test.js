import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { addCatalogElement, resolveCatalogUrl, searchCatalog } from '../core/catalog.js'

// Serve a minimal fake catalog locally so no test depends on the network.
async function withCatalogServer(catalogDir, fn) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    const file = join(catalogDir, path)
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  try {
    await fn(`http://127.0.0.1:${port}`)
  } finally {
    server.close()
  }
}

test('resolveCatalogUrl prefers --from, then config catalogUrl, then default', async () => {
  assert.equal(await resolveCatalogUrl({ from: 'https://a.example/' }), 'https://a.example')
  const dir = await mkdtemp(join(tmpdir(), 'jprot-cat-'))
  try {
    await mkdir(dir, { recursive: true })
    assert.equal(await resolveCatalogUrl({ projectRoot: dir }), null)
    await writeFile(
      join(dir, 'jprot.config.js'),
      'export default { catalogUrl: "https://cfg.example/x/", }',
    )
    assert.equal(await resolveCatalogUrl({ projectRoot: dir }), 'https://cfg.example/x')
    assert.equal(
      await resolveCatalogUrl({ projectRoot: dir, from: 'https://flag.example' }),
      'https://flag.example',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('searchCatalog lists and filters elements from catalog.json', async () => {
  await withCatalogServer(
    resolve('test/fixtures'),
    async (url) => {
      const all = await searchCatalog({ catalogUrl: url })
      assert.equal(all.items.length, 2)
      assert.equal(all.meta.version, '1.0.0')
      const hero = await searchCatalog({ catalogUrl: url, query: 'hero' })
      assert.equal(hero.items.length, 1)
      assert.equal(hero.items[0].name, 'SplitHero')
      const none = await searchCatalog({ catalogUrl: url, query: 'zzz' })
      assert.equal(none.items.length, 0)
    },
  )
})

test('addCatalogElement installs into theme/components and refuses duplicates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-site-'))
  try {
    await withCatalogServer(resolve('test/fixtures'), async (url) => {
      const out = await addCatalogElement({ projectRoot: dir, catalogUrl: url, name: 'SplitHero' })
      assert.match(out.file, /theme(\/|\\)components(\/|\\)SplitHero\.js$/)
      const installed = await readFile(out.file, 'utf8')
      assert.match(installed, /split hero component/)
      await assert.rejects(
        addCatalogElement({ projectRoot: dir, catalogUrl: url, name: 'SplitHero' }),
        /already installed/,
      )
      await assert.rejects(
        addCatalogElement({ projectRoot: dir, catalogUrl: url, name: 'NopeHero' }),
        /unknown element/,
      )
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})