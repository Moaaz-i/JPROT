import { test } from 'node:test'
import assert from 'node:assert/strict'
import { state, runScoped, setFallbackState } from '../../core/foundation/state.js'

test('runScoped isolates concurrent state', async () => {
  const A = { site: { title: 'Site A' } }
  const B = { site: { title: 'Site B' } }

  const [ra, rb] = await Promise.all([
    runScoped(A, async () => {
      await new Promise((r) => setTimeout(r, 20))
      return state().site.title
    }),
    runScoped(B, async () => {
      await new Promise((r) => setTimeout(r, 5))
      return state().site.title
    }),
  ])

  assert.equal(ra, 'Site A')
  assert.equal(rb, 'Site B')
})

test('state() falls back when no scope is active', () => {
  setFallbackState({ site: { title: 'Fallback' } })
  assert.equal(state().site.title, 'Fallback')
})

// The AsyncLocalStorage store is what keeps two instances apart. The fallback
// is a single module-level slot, so a *scoped* read must never be able to see
// another instance's state — the guarantee the file's own comment claims.
test('a scoped read is never served by the module-level fallback', async () => {
  setFallbackState({ site: { title: 'Last one wins' } })
  const seen = await Promise.all([
    runScoped({ site: { title: 'A' } }, async () => { await new Promise((r) => setTimeout(r, 10)); return state().site.title }),
    runScoped({ site: { title: 'B' } }, async () => { await new Promise((r) => setTimeout(r, 1)); return state().site.title }),
  ])
  assert.deepEqual(seen, ['A', 'B'])
  // …and outside any scope, the fallback is whatever was set last. This is the
  // documented limitation: it is why every request path must go through
  // runScoped, and why the programmatic API sets it before rendering.
  assert.equal(state().site.title, 'Last one wins')
})

test('state() returns an empty object before anything is registered', () => {
  // Guard against a null dereference in a fresh process.
  assert.doesNotThrow(() => state())
})
