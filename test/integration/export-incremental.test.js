// Incremental `jprot export`.
//
// The contract these tests defend is not "it is fast" — it is that a build
// which skips work produces *exactly* what a build from scratch produces. A
// cache that is merely usually-right ships stale pages, which is worse than no
// cache at all. So every test here exports the same site twice by different
// routes and compares the bytes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { exportSite } from '../../core/export.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function exists(p) { try { await stat(p); return true } catch { return false } }

/** Every exported file, relative to `dir`, mapped to its bytes. */
async function snapshot(dir) {
  const out = {}
  const walk = async (d, prefix) => {
    for (const entry of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = join(d, entry.name)
      if (entry.isDirectory()) await walk(full, rel)
      else out[rel] = await readFile(full, 'utf8')
    }
  }
  await walk(dir, '')
  return out
}

/**
 * Compare two exports ignoring the per-response CSP nonce.
 *
 * The nonce is random by design (`crypto.randomBytes`), so it differs between
 * any two builds, including two full builds. Everything else must match.
 */
function sameIgnoringNonce(a, b) {
  const norm = (s) => s.replace(/nonce="[^"]*"/g, 'nonce="X"')
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort()
  return { equal: JSON.stringify(ka) === JSON.stringify(kb) && ka.every((k) => norm(a[k]) === norm(b[k])), ka, kb }
}

async function makeSite(name) {
  const dir = await mkdtemp(join(tmpdir(), `jprot-inc-${name}-`))
  await mkdir(join(dir, 'content', 'blog'), { recursive: true })
  const post = (n, body = `Body ${n}.`) =>
    `---\ntitle: Post ${n}\ndescription: d${n}\ndate: 2026-01-0${n}\n---\n${body}\n`
  for (let i = 1; i <= 5; i++) await writeFile(join(dir, 'content', 'blog', `p${i}.md`), post(i))
  await writeFile(join(dir, 'content', 'index.md'), '---\ntitle: Home\ndescription: d.\n---\nHi.\n')
  return dir
}

async function diffReport(warm, cold) {
  const w = await snapshot(warm), c = await snapshot(cold)
  const { equal, ka, kb } = sameIgnoringNonce(w, c)
  if (equal) return null
  const onlyWarm = ka.filter((k) => !kb.includes(k))
  const onlyCold = kb.filter((k) => !ka.includes(k))
  const changed = ka.filter((k) => kb.includes(k) && w[k].replace(/nonce="[^"]*"/g, '') !== c[k].replace(/nonce="[^"]*"/g, ''))
  return `  only in incremental: ${onlyWarm.join(', ') || '-'}\n` +
         `  only in full build:  ${onlyCold.join(', ') || '-'}\n` +
         `  differing content:   ${changed.join(', ') || '-'}`
}

test('incremental export: a body-only edit reuses the other pages and still matches a full build', async () => {
  const site = await makeSite('body')
  const dist = join(site, 'dist'), cold = join(site, 'dist-cold')
  try {
    await exportSite({ root: site, outDir: dist })
    // Edit one post's prose. Title, date and description stay identical, so
    // nothing that feeds the nav or the blog list changes.
    await writeFile(join(site, 'content', 'blog', 'p3.md'),
      '---\ntitle: Post 3\ndescription: d3\ndate: 2026-01-03\n---\nA completely rewritten body.\n')

    const seen = []
    const warmDest = await exportSite({ root: site, outDir: dist, onProgress: (s) => seen.push(s) })
    assert.equal(warmDest, dist, 'exportSite still resolves to the output directory')
    const coldDest = await exportSite({ root: site, outDir: cold, clean: true })

    // The cache must actually have been used, or the test proves nothing.
    const stats = seen[seen.length - 1]
    assert.ok(stats.reused > 0, `expected reuse, got ${JSON.stringify(stats)}`)
    assert.ok(stats.rendered < 6, `expected a partial rebuild, rendered ${stats.rendered}`)

    const report = await diffReport(dist, coldDest)
    assert.equal(report, null, `incremental output differs from a full build:\n${report}`)
  } finally {
    await rm(site, { recursive: true, force: true })
  }
})

test('incremental export: an edited theme component invalidates every page', async () => {
  // The bug this guards: the fingerprint covered theme *paths* but not theme
  // *contents*, so editing a component reused every page and silently shipped
  // the old markup.
  const site = await makeSite('theme')
  const dist = join(site, 'dist'), cold = join(site, 'dist-cold')
  try {
    await exportSite({ root: site, outDir: dist })
    await mkdir(join(site, 'theme', 'components'), { recursive: true })
    // Footer renders on every page, so overriding it is guaranteed to change
    // every exported page. A default-exported function, the same shape as
    // theme/default/components/*.js — an object without `render` is silently
    // skipped by the loader, which would make this test pass without
    // exercising anything.
    await writeFile(join(site, 'theme', 'components', 'Footer.js'),
      'export default function Footer() {\n' +
      '  return \'<footer class="site-footer"><p>THEME WAS EDITED</p></footer>\'\n' +
      '}\n')

    const seen = []
    await exportSite({ root: site, outDir: dist, onProgress: (s) => seen.push(s) })
    assert.equal(seen[seen.length - 1].reused, 0, 'a theme edit must invalidate the whole cache')
    // The override must actually be in the output of *every* page. Without this
    // the test would pass just as happily if the component had been ignored
    // entirely, or if only the homepage had been rebuilt.
    for (const rel of Object.keys(await snapshot(dist))) {
      if (!rel.endsWith('index.html')) continue
      const html = await readFile(join(dist, rel), 'utf8')
      assert.match(html, /THEME WAS EDITED/, `${rel} kept the pre-edit component`)
    }

    const coldDest = await exportSite({ root: site, outDir: cold, clean: true })
    const report = await diffReport(dist, coldDest)
    assert.equal(report, null, `incremental output differs from a full build:\n${report}`)
  } finally {
    await rm(site, { recursive: true, force: true })
  }
})

test('incremental export: an edited config invalidates every page', async () => {
  const site = await makeSite('config')
  const dist = join(site, 'dist'), cold = join(site, 'dist-cold')
  try {
    await exportSite({ root: site, outDir: dist })
    await writeFile(join(site, 'jprot.config.js'), 'export default { title: "Renamed" }\n')

    const seen = []
    await exportSite({ root: site, outDir: dist, onProgress: (s) => seen.push(s) })
    assert.equal(seen[seen.length - 1].reused, 0, 'a config edit must invalidate the whole cache')

    const coldDest = await exportSite({ root: site, outDir: cold, clean: true })
    const report = await diffReport(dist, coldDest)
    assert.equal(report, null, `incremental output differs from a full build:\n${report}`)
  } finally {
    await rm(site, { recursive: true, force: true })
  }
})

test('incremental export: a deleted page is removed from dist/, directory and all', async () => {
  // Leaving an empty dist/blog/p2/ behind keeps the deleted URL resolving on a
  // static host, so the directory has to go too.
  const site = await makeSite('delete')
  const dist = join(site, 'dist'), cold = join(site, 'dist-cold')
  try {
    await exportSite({ root: site, outDir: dist })
    assert.ok(await exists(join(dist, 'blog', 'p2', 'index.html')))
    await rm(join(site, 'content', 'blog', 'p2.md'))

    await exportSite({ root: site, outDir: dist })
    assert.equal(await exists(join(dist, 'blog', 'p2', 'index.html')), false, 'stale page file removed')
    assert.equal(await exists(join(dist, 'blog', 'p2')), false, 'stale page directory removed')

    const coldDest = await exportSite({ root: site, outDir: cold, clean: true })
    const report = await diffReport(dist, coldDest)
    assert.equal(report, null, `incremental output differs from a full build:\n${report}`)
  } finally {
    await rm(site, { recursive: true, force: true })
  }
})

test('incremental export: a renamed page leaves no orphan og image behind', async () => {
  // Generated og images are named after a hash of their own contents, so
  // renaming a page mints a new file. The old one has to be swept or dist/
  // grows without bound.
  const site = await makeSite('og')
  const dist = join(site, 'dist'), cold = join(site, 'dist-cold')
  try {
    await exportSite({ root: site, outDir: dist })
    const before = (await readdir(join(dist, '@jprot', 'og'))).sort()

    await writeFile(join(site, 'content', 'blog', 'p4.md'),
      '---\ntitle: Post 4 RENAMED\ndescription: d4\ndate: 2026-01-04\n---\nBody 4.\n')
    await exportSite({ root: site, outDir: dist })

    const after = await readdir(join(dist, '@jprot', 'og'))
    const referenced = new Set()
    for (const [rel, body] of Object.entries(await snapshot(dist))) {
      if (!rel.endsWith('.html')) continue
      for (const m of body.matchAll(/\/@jprot\/og\/([0-9a-f]{16}\.svg)/g)) referenced.add(m[1])
    }
    const orphans = after.filter((f) => !referenced.has(f))
    assert.deepEqual(orphans, [], `orphan og images left in dist/: ${orphans.join(', ')} (was ${before.length}, now ${after.length})`)

    const coldDest = await exportSite({ root: site, outDir: cold, clean: true })
    const report = await diffReport(dist, coldDest)
    assert.equal(report, null, `incremental output differs from a full build:\n${report}`)
  } finally {
    await rm(site, { recursive: true, force: true })
  }
})

test('incremental export: repeated no-op builds stay identical', async () => {
  // A cache is only trustworthy if using it twice is as safe as using it once.
  const site = await makeSite('noop')
  const dist = join(site, 'dist'), cold = join(site, 'dist-cold')
  try {
    await exportSite({ root: site, outDir: dist })
    await exportSite({ root: site, outDir: dist })
    await exportSite({ root: site, outDir: dist })
    const coldDest = await exportSite({ root: site, outDir: cold, clean: true })
    const report = await diffReport(dist, coldDest)
    assert.equal(report, null, `incremental output differs from a full build:\n${report}`)
  } finally {
    await rm(site, { recursive: true, force: true })
  }
})

test('incremental export: a hand-edited dist file is repaired, not trusted', async () => {
  // The cache is only allowed to skip work when the file it would have written
  // is still byte-for-byte what it wrote last time.
  const site = await makeSite('tamper')
  const dist = join(site, 'dist'), cold = join(site, 'dist-cold')
  try {
    await exportSite({ root: site, outDir: dist })
    await writeFile(join(dist, 'blog', 'p1', 'index.html'), '<h1>tampered</h1>')

    await exportSite({ root: site, outDir: dist })
    const p1 = await readFile(join(dist, 'blog', 'p1', 'index.html'), 'utf8')
    assert.doesNotMatch(p1, /tampered/, 'a modified output file must be rebuilt')

    const coldDest = await exportSite({ root: site, outDir: cold, clean: true })
    const report = await diffReport(dist, coldDest)
    assert.equal(report, null, `incremental output differs from a full build:\n${report}`)
  } finally {
    await rm(site, { recursive: true, force: true })
  }
})

test('incremental export: a corrupt cache file degrades to a full build, it does not throw', async () => {
  const site = await makeSite('corrupt')
  const dist = join(site, 'dist'), cold = join(site, 'dist-cold')
  try {
    await exportSite({ root: site, outDir: dist })
    await writeFile(join(site, '.cache', 'export-manifest.json'), '{not json at all')
    const dest = await exportSite({ root: site, outDir: dist })
    assert.equal(dest, dist)
    const coldDest = await exportSite({ root: site, outDir: cold, clean: true })
    const report = await diffReport(dist, coldDest)
    assert.equal(report, null, `incremental output differs from a full build:\n${report}`)
  } finally {
    await rm(site, { recursive: true, force: true })
  }
})

test('exportSite writes the cache outside dist/, so nothing is deployed', async () => {
  const site = await makeSite('placement')
  const dist = join(site, 'dist')
  try {
    await exportSite({ root: site, outDir: dist })
    const files = Object.keys(await snapshot(dist))
    assert.equal(files.some((f) => /cache|manifest\.json\$/i.test(f) && /export/i.test(f)), false,
      `cache leaked into dist/: ${files.filter((f) => /export/i.test(f)).join(', ')}`)
    assert.ok(await exists(join(site, '.cache', 'export-manifest.json')), 'cache lives in the project .cache/')
  } finally {
    await rm(site, { recursive: true, force: true })
  }
})
