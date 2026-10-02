// A config that cannot be parsed used to be downgraded to a `console.warn` plus
// an empty object, which produced a fully functional but completely
// unconfigured site: no nav, no theme, no plugins, no error page. The symptom
// reads as "JPROT is broken"; the cause was a typo in one line of YAML-adjacent
// JavaScript. It must be fatal, and `jprot check` must be able to say why.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { makeSite, REPO_ROOT } from '../helpers/site.js'
import { createJprot } from '../../core/server.js'
import { checkConfig } from '../../core/check.js'
import { loadSiteConfig, ConfigLoadError } from '../../core/config.js'

const exec = promisify(execFile)
const jprot = (...args) => exec(process.execPath, ['core/cli.js', ...args], { cwd: REPO_ROOT })

const BROKEN_JS = 'export default { title: "T", \n'
const BROKEN_JSON = '{ "title": "T", }'

test('a syntactically broken jprot.config.js is fatal, not an empty site', async () => {
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\n---\n\nHello.' },
    files: { 'jprot.config.js': BROKEN_JS },
  })
  try {
    await assert.rejects(
      () => createJprot({ root: site.root, watch: false }),
      (err) => {
        assert.ok(err instanceof ConfigLoadError, `expected ConfigLoadError, got ${err.name}`)
        assert.equal(err.file, 'jprot.config.js')
        assert.match(err.message, /Could not load jprot\.config\.js/)
        return true
      },
    )
  } finally {
    await site.cleanup()
  }
})

test('malformed jprot.config.json is fatal too', async () => {
  const site = await makeSite({ files: { 'jprot.config.json': BROKEN_JSON } })
  try {
    await assert.rejects(
      () => loadSiteConfig(site.root),
      (err) => {
        assert.ok(err instanceof ConfigLoadError)
        assert.equal(err.file, 'jprot.config.json')
        return true
      },
    )
  } finally {
    await site.cleanup()
  }
})

test('jprot check reports a load failure instead of throwing', async () => {
  const site = await makeSite({ files: { 'jprot.config.js': BROKEN_JS } })
  try {
    const report = await checkConfig({ root: site.root })
    assert.equal(report.ok, false)
    assert.equal(report.errors.length, 1)
    assert.match(report.errors[0].message, /could not be loaded/)
    assert.equal(report.file, 'jprot.config.js')
  } finally {
    await site.cleanup()
  }
})

test('`jprot check` exits non-zero on a broken config', async () => {
  const site = await makeSite({ files: { 'jprot.config.js': BROKEN_JS } })
  try {
    const { stdout } = await jprot('--root', site.root, 'check')
    assert.match(stdout, /jprot\.config\.js/)
  } catch (err) {
    // runCheck sets process.exitCode = 1, so execFile rejects. That is the
    // point: CI must fail on a config that will not load.
    assert.equal(err.code, 1, `expected exit code 1, got ${err.code}`)
    assert.match(err.stdout, /jprot\.config\.js/)
  } finally {
    await site.cleanup()
  }
})

// A raw stack trace is a terrible way to learn you have a typo: it buries the
// one useful sentence under Node internals, and it exits 1 by accident rather
// than by design.
test('the CLI reports a bad config without a stack trace, and exits 1', async () => {
  const site = await makeSite({ files: { 'jprot.config.js': BROKEN_JS } })
  try {
    for (const command of [[], ['check'], ['lint'], ['export']]) {
      await assert.rejects(
        () => jprot('--root', site.root, ...command),
        (err) => {
          assert.equal(err.code, 1, `${command.join(' ') || 'jprot'} must exit 1`)
          const out = `${err.stdout || ''}${err.stderr || ''}`
          assert.match(out, /Could not load jprot\.config\.js/)
          assert.doesNotMatch(out, /at .*\(.*:\d+:\d+\)/, 'no stack trace')
          assert.doesNotMatch(out, /node:internal/, 'no Node internals')
          return true
        },
      )
    }
  } finally {
    await site.cleanup()
  }
})

test('a project with no config at all still works', async () => {
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\ndescription: Home.\n---\n\nHello.' },
  })
  try {
    const app = await createJprot({ root: site.root, watch: false })
    const base = `http://127.0.0.1:${await app.listen(0)}`
    const res = await fetch(base + '/')
    assert.equal(res.status, 200)
    assert.match(await res.text(), /Hello/)
    app.server.close()
    await app.closeWatcher()
  } finally {
    await site.cleanup()
  }
})
