import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'create-jprot', 'index.js')

async function pathExists(p) {
  try { await stat(p); return true } catch { return false }
}

test('create-jprot scaffolds a site with a jprot dependency', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-create-'))
  try {
    await execFileAsync(process.execPath, [bin, dir, '--no-install'], { cwd: tmpdir() })
    for (const f of ['jprot.config.js', 'content/index.md', 'content/blog.md', 'theme/custom.css']) {
      assert.ok(await pathExists(join(dir, f)), `missing ${f}`)
    }
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    assert.equal(pkg.private, true)
    assert.equal(pkg.type, 'module')
    assert.equal(pkg.scripts.start, 'jprot')
    assert.match(pkg.dependencies.jprot, /^\^|^latest/)
    const config = await readFile(join(dir, 'jprot.config.js'), 'utf8')
    assert.match(config, /export default/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('create-jprot --docs scaffolds the documentation shell', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-create-docs-'))
  try {
    await execFileAsync(process.execPath, [bin, dir, '--docs', '--no-install'], { cwd: tmpdir() })
    const config = await readFile(join(dir, 'jprot.config.js'), 'utf8')
    assert.match(config, /docs: true/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('create-jprot refuses a folder that already has a site', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jprot-create-busy-'))
  try {
    await execFileAsync(process.execPath, [bin, dir, '--no-install'], { cwd: tmpdir() })
    await assert.rejects(
      () => execFileAsync(process.execPath, [bin, dir, '--no-install'], { cwd: tmpdir() }),
      (err) => {
        assert.equal(err.code, 1)
        assert.match(String(err.stderr), /already contains a JPROT site/)
        return true
      }
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
