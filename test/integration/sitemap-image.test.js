import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createJprot } from '../../core/server.js'

// Sitemap image extension: <image:image> must be a child of <url>, not of
// <urlset>, or Google's validator rejects it with "tag not recognized".
test('sitemap nests <image:image> inside <url>', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-sitemap-image-'))
  const contentDir = join(dir, 'content')
  await mkdir(contentDir, { recursive: true })
  await writeFile(join(contentDir, 'index.md'), '# Home\n\nhello')
  await writeFile(
    join(contentDir, 'post.md'),
    '---\ntitle: Post with image\nimage: /img/photo.png\n---\n\nbody',
  )
  await writeFile(
    join(dir, 'jprot.config.js'),
    "export default { url: 'https://example.com' }\n",
  )

  const app = await createJprot({ root: dir, watch: false })
  const base = `http://127.0.0.1:${await app.listen(0)}`
  try {
    const xml = await (await fetch(base + '/sitemap.xml')).text()
    // the image extension namespace is declared on urlset
    assert.match(
      xml,
      /<urlset[^>]*xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/,
    )
    // every <image:image> lives inside a <url> element: it closes before </url>
    assert.match(
      xml,
      /<image:image><image:loc>[^<]*<\/image:loc><\/image:image><\/url>/,
    )
    // and none are misplaced as direct children of <urlset>
    assert.doesNotMatch(xml, /<\/url>\s*<image:image>/)
  } finally {
    app.server.close()
    if (app.closeWatcher) app.closeWatcher()
    await rm(dir, { recursive: true, force: true })
  }
})