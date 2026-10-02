// Three of the eight declared hooks used to be accepted by `on()` and then
// never dispatched, so a plugin author's correct code silently did nothing.
// These tests subscribe to all eight and assert each one fires.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createJprot } from '../../core/server.js'
import { HOOKS } from '../../core/plugins.js'
import { makeSite } from '../helpers/site.js'

// Writes a plugin that records every hook it sees, then runs a site that
// triggers a render, a JSON endpoint and a static export.
function recorderPlugin() {
  const seen = new Map()
  const src = `
export default {
  name: 'recorder',
  setup({ on }) {
${Object.keys(HOOKS)
  .map((h) => `    on(${JSON.stringify(h)}, (...a) => { globalThis.__jprotHookSeen ??= {}; globalThis.__jprotHookSeen[${JSON.stringify(h)}] = (globalThis.__jprotHookSeen[${JSON.stringify(h)}] || 0) + 1 })`)
  .join('\n')}
  }
}`
  return { src, seen }
}

test('every declared hook actually fires during a normal render', async () => {
  const { src } = recorderPlugin()
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\ndescription: Home.\n---\n\nHello.' },
    files: { 'plugins/recorder.js': src, 'jprot.config.js': `export default { title: 'T', plugins: ['./plugins/recorder.js'] }` },
  })
  const app = await createJprot({ root: site.root, watch: false })
  try {
    const base = `http://127.0.0.1:${await app.listen(0)}`
    // A page render (html:*), a JSON endpoint (endpoint:json) and a state
    // build (state:build, components:load, build).
    await (await fetch(base + '/')).text()
    await (await fetch(base + '/@jprot/search.json')).json()

    const fired = globalThis.__jprotHookSeen || {}
    for (const name of ['state:build', 'components:load', 'build', 'html:page', 'html:head', 'html:body-end', 'endpoint:json']) {
      assert.ok(fired[name] > 0, `hook "${name}" is declared but never fired`)
    }
  } finally {
    app.server.close()
    await app.closeWatcher()
    delete globalThis.__jprotHookSeen
    await site.cleanup()
  }
})

test('the `export` hook fires when a static export completes', async () => {
  const { src } = recorderPlugin()
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\ndescription: Home.\n---\n\nHello.' },
    files: { 'plugins/recorder.js': src, 'jprot.config.js': `export default { title: 'T', plugins: ['./plugins/recorder.js'] }` },
  })
  try {
    const { exportSite } = await import('../../core/server.js')
    const out = join(site.root, 'dist')
    await exportSite({ root: site.root, outDir: out })
    const fired = globalThis.__jprotHookSeen || {}
    assert.ok(fired.export > 0, 'the `export` hook is declared but never fired')
  } finally {
    delete globalThis.__jprotHookSeen
    await site.cleanup()
  }
})

// `extendMarkdown({ extensions })` is the one part of the plugin API that is not
// an `on()` hook, so the hook test above cannot see it. It was declared, typed in
// `jprot.d.ts`, given a unit test that asserted only `extensions.length === 1`,
// and then never read by anything: the functions were collected into
// `registry.markdown.extensions` and `createMarkdown` was handed `defaults` only.
// A plugin author's correct call did nothing, with no error anywhere.
test('a plugin Markdown extension actually rewrites the source it renders', async () => {
  const site = await makeSite({
    content: {
      'index.md': '---\ntitle: Home\ndescription: Home.\n---\n\nIntro paragraph.\n\nSHORTCUT\n',
      'other.md': '---\ntitle: Other\ndescription: Other.\n---\n\nIntro paragraph.\n\nSHORTCUT\n',
    },
    files: {
      // A preprocessor that rewrites a token into a heading — the kind of thing
      // this API exists for, and the kind that cannot work if it never runs.
      // The token sits in its own paragraph so the rewrite produces a real block:
      // a `#` line directly under a paragraph line is lazy continuation and
      // stays text, which would be correct Markdown and a confusing assertion.
      'plugins/pre.js': `export default {
  name: 'pre',
  setup({ extendMarkdown }) {
    extendMarkdown({ extensions: [(s) => s.replace(/^SHORTCUT$/gm, '## Shortcut')] })
  }
}`,
      'jprot.config.js': `export default { title: 'T', plugins: ['./plugins/pre.js'] }`,
    },
  })
  const app = await createJprot({ root: site.root, watch: false })
  try {
    const base = `http://127.0.0.1:${await app.listen(0)}`
    const home = await (await fetch(base + '/')).text()
    assert.match(home, /<h2[^>]*>Shortcut<\/h2>/, 'the extension did not reach the renderer')
    assert.doesNotMatch(home, /SHORTCUT/, 'the extension did not run at all')

    // It has to apply to every page, not just the first one rendered — the
    // extension list is built once per state build, and a per-render cache would
    // be an easy way to get this subtly wrong.
    const other = await (await fetch(base + '/other')).text()
    assert.match(other, /<h2[^>]*>Shortcut<\/h2>/)
  } finally {
    app.server.close()
    await app.closeWatcher()
    await site.cleanup()
  }
})

test('a plugin Markdown extension that throws is skipped, not fatal', async () => {
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\ndescription: Home.\n---\n\nStill here.' },
    files: {
      'plugins/bad.js': `export default {
  name: 'bad',
  setup({ extendMarkdown }) {
    extendMarkdown({ extensions: [() => { throw new Error('boom') }, (s) => s + ' appended.'] })
  }
}`,
      'jprot.config.js': `export default { title: 'T', plugins: ['./plugins/bad.js'] }`,
    },
  })
  const app = await createJprot({ root: site.root, watch: false })
  try {
    const base = `http://127.0.0.1:${await app.listen(0)}`
    const res = await fetch(base + '/')
    assert.equal(res.status, 200, 'one throwing extension must not take the page down')
    const html = await res.text()
    assert.match(html, /Still here\./)
    // The extension after the failing one still runs: a throw skips that entry,
    // it does not abort the list.
    assert.match(html, /appended\./)
  } finally {
    app.server.close()
    await app.closeWatcher()
    await site.cleanup()
  }
})

test('a Markdown extension returning a non-string is ignored', async () => {
  // The obvious slip for a side-effecting preprocessor is `s => { doThing() }`,
  // which returns undefined. Without the type check that replaces the document
  // with the literal string "undefined" and every page renders as that word.
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\ndescription: Home.\n---\n\nThe real body.' },
    files: {
      'plugins/side.js': `export default {
  name: 'side',
  setup({ extendMarkdown }) {
    extendMarkdown({ extensions: [() => { /* forgot to return */ }] })
  }
}`,
      'jprot.config.js': `export default { title: 'T', plugins: ['./plugins/side.js'] }`,
    },
  })
  const app = await createJprot({ root: site.root, watch: false })
  try {
    const base = `http://127.0.0.1:${await app.listen(0)}`
    const html = await (await fetch(base + '/')).text()
    assert.match(html, /The real body\./)
    assert.doesNotMatch(html, />\s*undefined\s*</)
  } finally {
    app.server.close()
    await app.closeWatcher()
    await site.cleanup()
  }
})
