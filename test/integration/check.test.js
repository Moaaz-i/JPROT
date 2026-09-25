import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { REPO_ROOT, makeSite, captureLogs } from '../helpers/site.js'
import { checkConfig, runCheck } from '../../core/check.js'
import { validateConfig, CONFIG_KEYS } from '../../core/schema.js'
import { scaffoldSite } from '../../core/scaffold.js'

const exec = promisify(execFile)
const jprot = (...args) => exec(process.execPath, ['core/cli.js', ...args], { cwd: REPO_ROOT })

test('CLI exposes help and package version without starting a server', async () => {
  const help = await exec(process.execPath, ['core/cli.js', '--help'], { cwd: REPO_ROOT })
  assert.match(help.stdout, /JPROT - Portfolio site generator/)
  const version = await exec(process.execPath, ['core/cli.js', '--version'], { cwd: REPO_ROOT })
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/)
})

test('help lists every command the CLI actually dispatches', async () => {
  const { stdout } = await jprot('--help')
  for (const cmd of ['jprot init', 'jprot new', 'jprot g component', 'jprot check', 'jprot lint', 'jprot search', 'jprot add', 'jprot export', '--export']) {
    assert.ok(stdout.includes(cmd), `--help must mention "${cmd}"`)
  }
})

/* --- jprot check ------------------------------------------------------- */

test('a clean config reports valid and exits 0', async () => {
  const site = await makeSite({ config: { title: 'Clean', url: 'https://example.com' } })
  try {
    const { value, logs } = await captureLogs(() => runCheck({ root: site.root }))
    assert.equal(value, 0)
    assert.match(logs.join('\n'), /is valid/)
  } finally { await site.cleanup() }
})

test('a bad value is an error, with the file and line that caused it', async () => {
  const site = await makeSite({ config: { title: 'X', docs: 'yes' } })
  try {
    const { errors } = await checkConfig({ root: site.root })
    const docs = errors.find((e) => e.path === 'docs')
    assert.ok(docs, 'docs must be reported')
    assert.match(docs.message, /Expected: boolean/)
    assert.equal(docs.level, 'error')
    assert.ok(docs.line > 0, 'an error must carry a line number')
  } finally { await site.cleanup() }
})

test('an unknown key is a warning with a did-you-mean hint', async () => {
  const site = await makeSite({ config: { title: 'X', titll: 'typo' } })
  try {
    const { warnings, errors } = await checkConfig({ root: site.root })
    assert.equal(errors.length, 0, 'a typo is not an error')
    assert.match(warnings.find((w) => w.path === 'titll')?.message || '', /did you mean "title"/)
  } finally { await site.cleanup() }
})

test('--strict promotes warnings to a non-zero exit', async () => {
  const site = await makeSite({ config: { title: 'X', titll: 'typo' } })
  try {
    const { value: lenient } = await captureLogs(() => runCheck({ root: site.root }))
    const { value: strict } = await captureLogs(() => runCheck({ root: site.root, strict: true }))
    assert.equal(lenient, 0)
    assert.equal(strict, 1)
  } finally { await site.cleanup() }
})

test('a section naming a component that does not exist is an error', async () => {
  const site = await makeSite({ config: { title: 'X', sections: [{ component: 'Herro' }] } })
  try {
    const { errors } = await checkConfig({ root: site.root })
    assert.match(errors.find((e) => e.path.startsWith('sections'))?.message || '', /no component named "Herro"/)
  } finally { await site.cleanup() }
})

test('a plugin that throws in setup is an error, not a silent skip', async () => {
  const site = await makeSite({
    config: { title: 'X', plugins: ['./plugins/bad.js'] },
    files: { 'plugins/bad.js': 'export default { name: "bad", setup() { throw new Error("boom") } }' },
  })
  try {
    const { errors, plugins } = await checkConfig({ root: site.root })
    assert.equal(plugins[0].error, 'boom')
    assert.match(errors.find((e) => e.path.includes('bad'))?.message || '', /boom/)
    const { value } = await captureLogs(() => runCheck({ root: site.root }))
    assert.equal(value, 1)
  } finally { await site.cleanup() }
})

test('a section satisfied only by a plugin still counts as valid', async () => {
  const site = await makeSite({
    config: { title: 'X', plugins: ['./plugins/c.js'], sections: [{ component: 'FromPlugin' }] },
    files: { 'plugins/c.js': 'export default { name: "c", setup(a) { a.addComponent("FromPlugin", () => "<i>x</i>") } }' },
  })
  try {
    const { errors, sections } = await checkConfig({ root: site.root })
    assert.equal(sections[0].exists, true, 'the plugin-provided component must be found')
    assert.equal(errors.length, 0, JSON.stringify(errors))
  } finally { await site.cleanup() }
})

/* --- the two bugs this suite was written to pin down ------------------- */

test('a pristine scaffold passes `jprot check --strict`', async () => {
  // Regression: `catalogUrl` is emitted by every scaffold and documented in
  // the options table, but was missing from the schema — so a brand-new site
  // warned "unknown config key", and `--strict` failed on a clean project.
  const dir = mkdtempSync(join(tmpdir(), 'jprot-scaffold-check-'))
  try {
    await scaffoldSite({ root: join(dir, 'site'), type: 'portfolio' })
    const report = await checkConfig({ root: join(dir, 'site'), strict: true })
    assert.deepEqual(report.warnings, [], 'a pristine scaffold must have no warnings')
    assert.deepEqual(report.errors, [])
    assert.equal(report.ok, true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('every key the scaffold writes is in CONFIG_KEYS', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jprot-scaffold-keys-'))
  try {
    const root = join(dir, 'site')
    await scaffoldSite({ root, type: 'portfolio' })
    const { loadConfigWithSource } = await import('../../core/config.js')
    const { config } = await loadConfigWithSource(root, undefined, true)
    const unknown = Object.keys(config).filter((k) => !CONFIG_KEYS.includes(k))
    assert.deepEqual(unknown, [], `scaffolded config has keys the schema rejects: ${unknown.join(', ')}`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('--root targets the given project, not the current directory', async () => {
  // Regression: `check`/`lint`/`export` hard-coded process.cwd(), so
  // `jprot check --root ./elsewhere` printed "✔ valid" about the *wrong*
  // project — the worst possible failure for a CI gate.
  const dir = mkdtempSync(join(tmpdir(), 'jprot-root-flag-'))
  const good = join(dir, 'good')
  const bad = join(dir, 'bad')
  try {
    for (const [p, body] of [[good, "export default { title: 'Good' }"], [bad, "export default {\n  title: 'Bad',\n  docs: 'yes',\n}"]]) {
      mkdirSync(p, { recursive: true })
      writeFileSync(join(p, 'jprot.config.js'), body)
    }
    const ok = await jprot('check', '--root', good)
    assert.equal(ok.stdout.includes('✔'), true, 'the good project must pass')

    let code = 0
    try { await jprot('check', '--root', bad) } catch (e) { code = e.code }
    assert.equal(code, 1, 'the bad project must fail, proving --root was honored')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a fixture site is an ES module, like a scaffolded one', async () => {
  // Regression: `makeSite` wrote no package.json, so a fixture's
  // `theme/components/*.js` and `plugins/*.js` were parsed as CommonJS. Node
  // 20.19+/22 sniff the syntax and shrug; Node 18 does not, and 11 tests failed
  // there with "Unexpected token 'export'" — a red CI matrix that a local
  // `npm test` on a modern Node cannot see.
  const site = await makeSite({ theme: { 'components/A.js': 'export default () => ""' } })
  try {
    const pkg = JSON.parse(readFileSync(join(site.root, 'package.json'), 'utf8'))
    assert.equal(pkg.type, 'module', 'every fixture must declare "type": "module"')
  } finally { await site.cleanup() }
})

test('a directory with no config at all is not an error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jprot-empty-'))
  try {
    const { value } = await captureLogs(() => runCheck({ root: dir }))
    assert.equal(value, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('the writing commands honor --root instead of writing into the cwd', async () => {
  // Regression: `init`, `new` and `g component` all dropped their root, so
  // `jprot init --root ./site` scaffolded a whole site into whatever directory
  // the user happened to be standing in — including the JPROT repo itself.
  //
  // The sentinels are the repo's own config mtime plus the paths only
  // `init`/`new`/`g` would create. `git status` is the obvious alternative, but
  // `node --test` runs files concurrently and server.test.js legitimately
  // creates and deletes files under content/ while we run.
  const dir = mkdtempSync(join(tmpdir(), 'jprot-writes-'))
  const site = join(dir, 'site')
  const sentinels = [
    join(REPO_ROOT, 'jprot.config.js'),
    join(REPO_ROOT, 'theme', 'custom.css'),
    join(REPO_ROOT, 'theme', 'components', 'Flagged.js'),
    join(REPO_ROOT, 'content', 'blog', 'flag-test.md'),
    join(REPO_ROOT, '.vscode'),
    join(REPO_ROOT, 'snippets'),
  ]
  const before = sentinels.map(stamp)
  try {
    await jprot('init', '--portfolio', '--root', site)
    assert.ok(existsSync(join(site, 'jprot.config.js')), 'init must write into --root')
    assert.ok(existsSync(join(site, 'theme', 'custom.css')), 'init must write into --root')
    assert.ok(existsSync(join(site, '.vscode', 'jprot.code-snippets')), 'init must write into --root')

    await jprot('new', 'post', 'Flag Test', '--root', site)
    assert.ok(existsSync(join(site, 'content', 'blog', 'flag-test.md')), 'new must write into --root')

    await jprot('g', 'component', 'Flagged', '--root', site)
    assert.ok(existsSync(join(site, 'theme', 'components', 'Flagged.js')), 'g must write into --root')

    const changed = sentinels.filter((p, i) => stamp(p) !== before[i])
    assert.deepEqual(changed, [], `these commands wrote into the repo:\n  ${changed.join('\n  ')}`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

/** An mtime, or a sentinel for "not there" that a later write will change. */
function stamp(p) {
  try { return String(statSync(p).mtimeMs) } catch { return 'absent' }
}

test('validateConfig rejects a non-object config', async () => {
  const r = validateConfig('nope')
  assert.equal(r.ok, false)
  assert.match(r.errors[0].message, /must export an object/)
})
