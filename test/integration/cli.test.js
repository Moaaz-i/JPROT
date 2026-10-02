import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { access } from 'node:fs/promises'
import { REPO_ROOT, makeSite } from '../helpers/site.js'

const exec = promisify(execFile)
const jprot = (...args) => exec(process.execPath, ['core/cli.js', ...args], { cwd: REPO_ROOT })

const exists = (p) => access(p).then(() => true, () => false)

// The `--help`/`--version` test lives in check.test.js with the other CLI tests.
// This file covers argument *dispatch*, which had no coverage and was wrong:
// `args.includes("lint")` meant `jprot new page "lint"` ran the linter instead
// of creating the page.
test('a command word used as a title does not hijack another command', async () => {
  const site = await makeSite()
  try {
    for (const word of ['lint', 'check', 'export', 'init', 'search', 'add']) {
      const { stdout } = await jprot('--root', site.root, 'new', 'page', word)
      assert.match(stdout, /Created/, `"jprot new page ${word}" must create a page`)
      assert.ok(
        await exists(join(site.root, 'content', `${word}.md`)),
        `jprot new page ${word} must write content/${word}.md`,
      )
    }
  } finally {
    await site.cleanup()
  }
})

// `--root` is documented as a global option and every subcommand honoured it —
// except the dev server, which simply never passed it to createJprot(). So
// `jprot --root ../elsewhere` served the *current* directory with no warning.
test('the dev server honours --root', async () => {
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Marker Page\ndescription: d.\n---\n\nBody.' },
  })
  const child = spawn(process.execPath, ['core/cli.js', '--root', site.root, '--port', '0', '--no-watch'], { cwd: REPO_ROOT })
  try {
    // --port 0 is not honoured by the CLI, so read the port it actually bound
    // out of its banner on stdout.
    const url = await new Promise((resolve, reject) => {
      let buf = ''
      // The timer must be cleared once the URL arrives, or it keeps the test
      // process alive for the full 15s after the assertions are done.
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`dev server never announced a URL:\n${buf}`))
      }, 15000)
      const onData = (d) => {
        buf += d
        const m = /Running locally at: (\S+)/.exec(buf)
        if (m) { cleanup(); resolve(m[1]) }
      }
      function cleanup() {
        clearTimeout(timer)
        child.stdout.off('data', onData)
        child.off('error', onError)
      }
      function onError(e) { cleanup(); reject(e) }
      child.stdout.on('data', onData)
      child.once('error', onError)
    })
    const html = await (await fetch(url + '/')).text()
    assert.match(html, /Marker Page/, 'the server must serve the --root project, not the cwd')
    assert.ok(!html.includes('JPROT documentation'), 'must not fall back to the JPROT repo content')
  } finally {
    child.kill('SIGKILL')
    await site.cleanup()
  }
})

test('lint runs on its own, not by substring match', async () => {
  const site = await makeSite({
    content: {
      'index.md': '---\ntitle: Home\ndescription: Home page.\n---\n\nHello.',
    },
  })
  try {
    const { stdout } = await jprot('--root', site.root, 'lint')
    assert.match(stdout, /^\s*(?:✔|✖) lint:/m, 'bare `jprot lint` must run the linter')
  } finally {
    await site.cleanup()
  }
})
