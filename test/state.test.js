import { test } from 'node:test'
import assert from 'node:assert/strict'
import { state, runScoped, setFallbackState } from '../core/state.js'

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
