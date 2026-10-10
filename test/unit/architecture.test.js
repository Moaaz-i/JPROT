/**
 * The architecture, enforced.
 *
 * `ARCHITECTURE.md` describes five layers under `core/`, a self-contained
 * `lib/`, and the rule that nothing points upward. Nothing in the runtime
 * *enforces* that, so this file does: a refactor that quietly re-introduces an
 * import cycle, or makes a low-level module reach up into `page.js`, fails
 * here rather than three refactors later when the cause is no longer visible.
 *
 * Three separate questions, because they fail for different reasons:
 *
 *   1. does every relative import resolve?   (a moved file, a stale path)
 *   2. are there cycles?                     (untraceable initialization order)
 *   3. does anything import upward?          (the layering itself)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, relative, resolve, sep } from 'node:path'
import { REPO_ROOT } from '../helpers/site.js'

const SKIP = new Set(['node_modules', '.git', 'dist', '.tmp-sweep', '.cache', '.cache-export'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

const toRel = (p) => relative(REPO_ROOT, p).split(sep).join('/')

// `from './x.js'`, `import('./x.js')`, `require("../x.js")` — every way a path
// can get into this codebase, including the ones that are not imports at all.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s*)['"]([^'"]+)['"]/g

function specifiersIn(source) {
  const out = []
  for (const m of source.matchAll(SPECIFIER)) {
    const spec = m[1]
    if (spec.startsWith('.') || spec.startsWith('/')) out.push(spec)
  }
  return out
}

const files = walk(REPO_ROOT)

// Prose that *looks* like a path — the `./x.js` in this file's own header — must
// not be counted. Only real code is scanned.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const sources = new Map(files.map((f) => [toRel(f), stripComments(readFileSync(f, 'utf8'))]))

/** `{ from: '../lib/utils.js', to: 'lib/utils.js' }` for every file that has one. */
function edgesOf(rel, source) {
  const edges = []
  for (const spec of specifiersIn(source)) {
    const abs = resolve(REPO_ROOT, dirname(rel), spec)
    edges.push({ spec, to: toRel(abs), exists: existsSync(abs) })
  }
  return edges
}

const graph = new Map([...sources].map(([rel, src]) => [rel, edgesOf(rel, src)]))

/* ------------------------------------------------------------------ 1. resolution */

test('every relative import resolves to a file that exists', () => {
  const broken = []
  for (const [rel, edges] of graph) {
    for (const e of edges) if (!e.exists) broken.push(`${rel} -> ${e.spec}`)
  }
  assert.deepEqual(broken, [], 'these paths do not point at anything')
})

/* ------------------------------------------------------------------ 2. cycles */

test('core/ and lib/ have no import cycles', () => {
  const WHITE = 0
  const GREY = 1
  const BLACK = 2
  const colour = new Map([...graph.keys()].map((k) => [k, WHITE]))
  const cycles = []

  const visit = (rel, stack) => {
    colour.set(rel, GREY)
    for (const e of graph.get(rel) ?? []) {
      if (!e.exists || !colour.has(e.to)) continue
      if (colour.get(e.to) === GREY) {
        cycles.push([...stack.slice(stack.indexOf(e.to)), e.to].join(' -> '))
        continue
      }
      if (colour.get(e.to) === WHITE) visit(e.to, [...stack, e.to])
    }
    colour.set(rel, BLACK)
  }

  for (const rel of graph.keys()) if (colour.get(rel) === WHITE) visit(rel, [rel])
  assert.deepEqual(cycles, [], 'an import cycle makes initialization order unknowable')
})

/* ------------------------------------------------------------------ 3. layers */

// The order is the whole point: a layer may use itself and everything below it,
// never the reverse. `entry` is `cli.js`, `server.js` and `export.js` — the
// three files that are allowed to know about everything, because wiring is
// their job.
const LAYERS = {
  lib: ['lib'],
  foundation: ['foundation', 'lib'],
  runtime: ['runtime', 'foundation', 'lib'],
  content: ['content', 'foundation', 'lib'],
  site: ['site', 'tooling', 'content', 'runtime', 'foundation', 'lib'],
  tooling: ['tooling', 'content', 'runtime', 'foundation', 'lib'],
  entry: ['entry', 'site', 'tooling', 'content', 'runtime', 'foundation', 'lib'],
  theme: ['theme', 'lib'],
}

function layerOf(rel) {
  if (rel.startsWith('core/foundation/')) return 'foundation'
  if (rel.startsWith('core/runtime/')) return 'runtime'
  if (rel.startsWith('core/content/')) return 'content'
  if (rel.startsWith('core/site/')) return 'site'
  if (rel.startsWith('core/tooling/')) return 'tooling'
  if (rel.startsWith('core/')) return 'entry'
  if (rel.startsWith('lib/')) return 'lib'
  if (rel.startsWith('theme/')) return 'theme'
  return null // tests, fixtures, examples: they may reach anywhere
}

test('nothing imports a layer above its own', () => {
  const violations = []
  for (const [rel, edges] of graph) {
    const mine = layerOf(rel)
    if (!mine) continue
    for (const e of edges) {
      const theirs = layerOf(e.to)
      if (!theirs) continue // package.json and friends: not a layer
      if (LAYERS[mine].includes(theirs)) continue
      violations.push(`${rel} [${mine}] -> ${e.to} [${theirs}]`)
    }
  }
  assert.deepEqual(violations, [], 'every import must point at the same layer or a lower one')
})

test('lib/ is self-contained and the theme never reaches into the runtime', () => {
  for (const [rel, edges] of graph) {
    if (!rel.startsWith('lib/') && !rel.startsWith('theme/')) continue
    for (const e of edges) {
      assert.ok(
        !e.to.startsWith('core/'),
        `${rel} imports ${e.to}: \`lib/\` and \`theme/\` must work from \`lib/\` alone`,
      )
    }
  }
})
