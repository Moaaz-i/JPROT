// Shared test helpers.
//
// Every test that needs a site used to open-code the same five lines
// (mkdtemp → mkdir content → write files → clean up). Those five lines are the
// reason the integration tests drifted apart, so they live here instead.
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root, resolved from this file's own location. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Directory holding committed fixtures (`test/fixtures`). */
export const FIXTURES = join(REPO_ROOT, 'test', 'fixtures')

/** Directory holding committed snapshots (`test/snapshots`). */
export const SNAPSHOTS = join(REPO_ROOT, 'test', 'snapshots')

/**
 * Build a throwaway site on disk.
 *
 * @param {object} spec
 * @param {Record<string, string>} [spec.content]  `rel/path.md` → file body
 * @param {Record<string, string>} [spec.public]   `rel` → file body
 * @param {Record<string, string>} [spec.theme]    `rel` → file body (theme/components/*.js)
 * @param {Record<string, string>} [spec.files]    `rel` → file body, relative to the root
 * @param {object|string} [spec.config]            jprot.config.js source, or an object
 * @returns {Promise<{root: string, cleanup: () => Promise<void>}>}
 */
export async function makeSite({ content = {}, public: publicFiles = {}, theme = {}, files = {}, config } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'jprot-site-'))
  const write = async (rel, body) => {
    const full = join(root, rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, typeof body === 'string' ? body : JSON.stringify(body, null, 2))
  }
  for (const [rel, body] of Object.entries(content)) await write(join('content', rel), body)
  for (const [rel, body] of Object.entries(publicFiles)) await write(join('public', rel), body)
  for (const [rel, body] of Object.entries(theme)) await write(join('theme', rel), body)
  for (const [rel, body] of Object.entries(files)) await write(rel, body)
  if (config) {
    await write('jprot.config.js', typeof config === 'string'
      ? config
      : `export default ${JSON.stringify(config, null, 2)}`)
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

/** A frontmatter block with the two fields every JPROT check expects. */
export function page({ title = 'Page', description = 'A page.', date, extra = '', body = 'Hello.' } = {}) {
  const fields = [`title: ${title}`, `description: ${description}`]
  if (date) fields.push(`date: ${date}`)
  return `---\n${fields.join('\n')}\n${extra}---\n\n${body}\n`
}

/**
 * Capture everything `console.log` writes while `run()` executes.
 *
 * @param {() => Promise<any>} run
 * @returns {Promise<{value: any, logs: string[]}>}
 */
export async function captureLogs(run) {
  const logs = []
  const original = { log: console.log, warn: console.warn, error: console.error }
  const push = (...args) => logs.push(args.map(String).join(' '))
  console.log = push
  console.warn = push
  console.error = push
  try {
    return { value: await run(), logs }
  } finally {
    Object.assign(console, original)
  }
}

/**
 * Compare a value against a committed snapshot.
 *
 * Run with `UPDATE_SNAPSHOTS=1` (or `npm run test:update`) to rewrite the
 * snapshot files after an intentional rendering change, then read the diff —
 * a snapshot that can be silently regenerated is worth very little.
 *
 * @param {string} name  snapshot file name, without the extension
 * @param {string} actual
 * @param {object} [options]
 * @param {boolean} [options.normalize] collapse volatile values (nonces, ports)
 * @returns {Promise<{match: boolean, path: string, expected: string}>}
 */
export async function matchSnapshot(name, actual, { normalize = defaultNormalize } = {}) {
  const path = join(SNAPSHOTS, `${name}.snap`)
  const value = normalize(String(actual))
  const expected = await readFile(path, 'utf8').catch(() => null)
  if (process.env.UPDATE_SNAPSHOTS === '1' || expected === null) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, value)
    return { match: true, path, expected: value, created: expected === null }
  }
  return { match: expected === value, path, expected }
}

// Volatile by design: a CSP nonce is random per response and a port is
// whatever the OS hands out. Everything else must match byte for byte.
function defaultNormalize(html) {
  return html
    .replace(/nonce="[^"]*"/g, 'nonce="…"')
    .replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:<port>')
    .replace(/\bpid=\d+/g, 'pid=<pid>')
}
