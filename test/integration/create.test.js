import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const bin = join(root, 'create-jprot', 'index.js')

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

test('create-jprot pins the jprot range the repo actually ships', async () => {
  // Regression: `jprotSpec()` writes create-jprot's own `dependencies.jprot`
  // into every new site verbatim, and a caret range cannot cross a 0.x minor.
  // While the workflow published only the root package, create-jprot stayed at
  // 0.5.0 on npm and `npm create jprot` scaffolded and pinned jprot@0.5.1 —
  // no `jprot check`, no plugin API, with nothing in the output to hint at it.
  // CI now publishes both packages in the same run; this test keeps their
  // version fields from drifting apart again.
  const jprot = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const create = JSON.parse(await readFile(join(root, 'create-jprot', 'package.json'), 'utf8'))
  assert.equal(
    create.version, jprot.version,
    'create-jprot must be released in lockstep with jprot',
  )
  assert.equal(
    create.dependencies.jprot, `^${jprot.version}`,
    'a new site must be pinned to the version this repo ships',
  )
})

test('the publish workflow releases both packages in one run', async () => {
  const ci = await readFile(join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
  assert.match(ci, /publish_if_unreleased \.$/m, 'jprot must be published')
  assert.match(ci, /publish_if_unreleased create-jprot$/m, 'create-jprot must be published too')
  // The old guard could never fire: checkout is a depth-1 clone, so HEAD has no
  // parent and `diff-tree` lists the whole tree, matching package.json always.
  const code = ci.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  assert.doesNotMatch(code, /diff-tree/, 'the dead package.json-changed guard must stay gone')
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
