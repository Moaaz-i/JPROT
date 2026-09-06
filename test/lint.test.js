import { test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runLint } from '../core/lint.js'

async function makeRoot(files, config = null) {
  const root = await mkdtemp(join(tmpdir(), 'jprot-lint-'))
  if (config) await writeFile(join(root, 'jprot.config.js'), config)
  for (const [rel, body] of Object.entries(files)) {
    const p = join(root, 'content', rel)
    await mkdir(join(p, '..'), { recursive: true })
    await writeFile(p, body)
  }
  return root
}

const BROKEN_MD = '---\ntitle: Broken\ndescription: A page with a broken link.\n---\n\nThis links to [nothing](/does-not-exist).\n'
const OK_MD = '---\ntitle: Home\ndescription: The homepage.\n---\n\nHome page.\n'

function capture(run) {
  const logs = []
  const orig = console.log
  console.log = (...args) => logs.push(args.join(' '))
  return run().finally(() => { console.log = orig }).then((code) => ({ code, logs }))
}

test('lint flags a broken internal link', async () => {
  const root = await makeRoot({ 'index.md': OK_MD, 'broken.md': BROKEN_MD })
  const { code, logs } = await capture(() => runLint({ root }))
  assert.equal(code, 1)
  assert.ok(logs.some((l) => l.includes('broken.md') && l.includes('broken internal link')))
})

test('lint.ignore with an exact filename skips the file', async () => {
  const root = await makeRoot(
    { 'index.md': OK_MD, 'broken.md': BROKEN_MD },
    'export default { lint: { ignore: ["broken.md"] } }',
  )
  const { code, logs } = await capture(() => runLint({ root }))
  assert.equal(code, 0, logs.join('\n'))
})

test('lint.ignore with a glob skips matching files only', async () => {
  const root = await makeRoot(
    { 'ok.md': OK_MD, 'drafts/stale.md': BROKEN_MD, 'live.md': BROKEN_MD },
    'export default { lint: { ignore: ["drafts/*"] } }',
  )
  const { code, logs } = await capture(() => runLint({ root }))
  assert.equal(code, 1)
  assert.ok(!logs.some((l) => l.includes('drafts/stale.md')))
  assert.ok(logs.some((l) => l.includes('live.md')))
})

test('frontmatter lint: false opts the page out of checks', async () => {
  const frontmatter = '---\ntitle: Broken\ndescription: Stale.\nlint: false\n---\n\n[x](/does-not-exist).\n'
  const root = await makeRoot({ 'index.md': OK_MD, 'broken.md': frontmatter })
  const { code, logs } = await capture(() => runLint({ root }))
  assert.equal(code, 0, logs.join('\n'))
})

test('a clean project reports OK', async () => {
  const root = await makeRoot({ 'index.md': OK_MD, 'about.md': '---\ntitle: About\ndescription: About the site.\n---\n\nSee [home](/).\n' })
  const { code, logs } = await capture(() => runLint({ root }))
  assert.equal(code, 0)
  assert.ok(logs.some((l) => l.includes('OK')))
})