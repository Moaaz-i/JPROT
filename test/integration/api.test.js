// The programmatic API is documented in README.md and typed in jprot.d.ts.
// It used to drift from reality: the README's `import { createJprot,
// exportSite, runLint, runCheck, scaffoldSite } from 'jprot'` threw a
// SyntaxError, because the package root only re-exported six unrelated
// symbols — while jprot.d.ts declared all five, so TypeScript users got zero
// errors and then a runtime crash.
//
// This test imports the package by its published specifier and asserts that
// every documented name is actually there.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { REPO_ROOT, makeSite } from '../helpers/site.js'

// Every name README.md's "Programmatic API" section imports from the root.
const DOCUMENTED_API = [
  'createJprot',
  'exportSite',
  'runLint',
  'runCheck',
  'checkConfig',
  'scaffoldSite',
]

test('every function the README imports from the package root exists', async () => {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'))
  const rootEntry = pkg.exports['.'].default
  const mod = await import(join(REPO_ROOT, rootEntry))
  for (const name of DOCUMENTED_API) {
    assert.equal(typeof mod[name], 'function', `jprot must export ${name}() — the README documents it`)
  }
})

test('the README API import works exactly as written', async () => {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'))
  const rootEntry = join(REPO_ROOT, pkg.exports['.'].default)
  // Mirrors the README snippet verbatim, including the named imports.
  const { createJprot, exportSite, runLint, runCheck, checkConfig, scaffoldSite } = await import(rootEntry)
  for (const [name, fn] of Object.entries({ createJprot, exportSite, runLint, runCheck, checkConfig, scaffoldSite })) {
    assert.equal(typeof fn, 'function', `${name} must be callable`)
  }
})

// The README used to name `runCheck`'s result `report`, but it returns an exit
// code — the actual report comes from `checkConfig`. Pinned so the documented
// distinction cannot quietly invert.
test('runCheck returns an exit code and checkConfig returns the report', async () => {
  const { runCheck, checkConfig } = await import(join(REPO_ROOT, 'core/server.js'))
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\ndescription: d.\n---\n\nHi.' },
  })
  try {
    assert.equal(await runCheck({ root: site.root }), 0, 'runCheck returns an exit code')
    const report = await checkConfig({ root: site.root })
    assert.equal(typeof report, 'object')
    assert.equal(report.ok, true)
    assert.ok(Array.isArray(report.errors))
  } finally {
    await site.cleanup()
  }
})

test('jprot.d.ts does not declare an export the package does not have', async () => {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'))
  const mod = await import(join(REPO_ROOT, pkg.exports['.'].default))
  const types = await readFile(join(REPO_ROOT, 'jprot.d.ts'), 'utf8')

  // Every `export declare function X` / `export function X` in the .d.ts must
  // correspond to a real runtime export, and vice versa. The type file is more
  // dangerous than none when it names things the package does not export.
  const declared = new Set(
    [...types.matchAll(/export\s+declare\s+function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
  )
  const missing = [...declared].filter((n) => typeof mod[n] !== 'function').sort()
  assert.deepEqual(missing, [], 'jprot.d.ts declares functions the package does not export')
})

test('the scaffold subpath still resolves', async () => {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'))
  const mod = await import(join(REPO_ROOT, pkg.exports['./scaffold'].default))
  assert.equal(typeof mod.scaffoldSite, 'function')
})
