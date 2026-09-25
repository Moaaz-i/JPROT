import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { HOOKS, loadPlugins, resolvePlugin, runPlugins } from '../../core/plugins.js'
import { makeSite } from '../helpers/site.js'

// Write a plugin module and return the specifier a config would use.
const plugin = (source) => ({ 'plugins/p.js': source })

async function withPlugins(sources, config = {}, run) {
  const site = await makeSite({ files: sources, config })
  try {
    return await run(site.root)
  } finally {
    await site.cleanup()
  }
}

test('HOOKS documents every event, with its arguments', () => {
  for (const [name, spec] of Object.entries(HOOKS)) {
    assert.ok(Array.isArray(spec.args), `${name} must declare its arguments`)
    assert.ok(spec.description, `${name} must describe itself`)
  }
  assert.ok('html:head' in HOOKS)
  assert.ok('endpoint:json' in HOOKS)
})

test('resolvePlugin finds a project-relative file', async () => {
  const site = await makeSite({ files: plugin('export default { setup() {} }') })
  const resolved = await resolvePlugin('./plugins/p.js', site.root)
  await site.cleanup()
  assert.equal(resolved.name, 'p')
  assert.ok(resolved.href.startsWith('file://'))
  assert.equal(resolved.missing, undefined)
})

test('resolvePlugin reports a missing relative file instead of guessing a package', async () => {
  const site = await makeSite({})
  const resolved = await resolvePlugin('./plugins/nope.js', site.root)
  await site.cleanup()
  assert.equal(resolved.missing, true)
  assert.equal(resolved.href, null)
  assert.equal(resolved.file, join(site.root, 'plugins/nope.js'))
})

test('a plugin file may export setup directly, without a wrapper object', async () => {
  await withPlugins(
    plugin('export default function setup({ addComponent }) { addComponent("A", () => "<i>a</i>") }'),
    { plugins: ['./plugins/p.js'] },
    async (root) => {
      const { registry } = await runPlugins({ projectRoot: root, config: { plugins: ['./plugins/p.js'] }, quiet: true })
      assert.deepEqual(registry.components.map((c) => c.name), ['A'])
    },
  )
})

test('setup can register components, routes, hooks and markdown extensions', async () => {
  const source = `
    export default {
      name: 'kitchen-sink',
      setup({ addComponent, addRoute, on, extendMarkdown, config }) {
        addComponent('Hello', (p) => '<p>' + (p.who || 'world') + '</p>')
        addComponent('Card', { props: { title: 'string' }, render: (p) => '<div>' + p.title + '</div>' })
        addRoute('/feed.json', () => {})
        addRoute('/trailing/', () => {})
        on('html:head', (html) => html)
        on('html:body-end', (html) => html)
        extendMarkdown({ defaults: { footnotes: false }, extensions: [(s) => s] })
      },
    }
  `
  await withPlugins(plugin(source), { plugins: ['./plugins/p.js'] }, async (root) => {
    const config = { plugins: ['./plugins/p.js'] }
    const { registry, plugins } = await runPlugins({ projectRoot: root, config, quiet: true })
    assert.deepEqual(registry.components.map((c) => c.name), ['Hello', 'Card'])
    assert.deepEqual(registry.routes.map((r) => r.path), ['/feed.json', '/trailing'])
    assert.deepEqual(Object.keys(registry.hooks).sort(), ['html:body-end', 'html:head'])
    assert.deepEqual(registry.markdown.defaults, { footnotes: false })
    assert.equal(registry.markdown.extensions.length, 1)
    assert.deepEqual(plugins[0].components, ['Hello', 'Card'])
    assert.deepEqual(plugins[0].routes, ['/feed.json', '/trailing'])
  })
})

test('addComponent rejects anything that is not renderable', async () => {
  await withPlugins(
    plugin('export default { setup(a) { a.addComponent("X", "nope") } }'),
    { plugins: ['./plugins/p.js'] },
    async (root) => {
      const { registry, plugins } = await runPlugins({
        projectRoot: root,
        config: { plugins: ['./plugins/p.js'] },
        quiet: true,
      })
      assert.match(plugins[0].error, /expected a render function/)
      assert.equal(registry.components.length, 0, 'a half-applied plugin is rolled back')
    },
  )
})

test('an unknown hook name fails at setup time, not silently', async () => {
  await withPlugins(
    plugin('export default { setup(j) { j.on("htlm:head", () => {}) } }'),
    { plugins: ['./plugins/p.js'] },
    async (root) => {
      const { plugins } = await runPlugins({ projectRoot: root, config: { plugins: ['./plugins/p.js'] }, quiet: true })
      assert.match(plugins[0].error, /unknown hook "htlm:head"/)
    },
  )
})

test('addRoute insists on an absolute path and a function', async () => {
  await withPlugins(
    plugin('export default { setup(j) { j.addRoute("relative", () => {}) } }'),
    { plugins: ['./plugins/p.js'] },
    async (root) => {
      const { plugins } = await runPlugins({ projectRoot: root, config: { plugins: ['./plugins/p.js'] }, quiet: true })
      assert.match(plugins[0].error, /must be a string starting with/)
    },
  )
})

test('a plugin that throws is reported and skipped, and the next one still loads', async () => {
  await withPlugins(
    {
      'plugins/a.js': 'export default { name: "a", setup(j) { j.addComponent("FromA", () => "a") } }',
      'plugins/b.js': 'export default { name: "b", setup() { throw new Error("boom") } }',
      'plugins/c.js': 'export default { name: "c", setup(j) { j.addComponent("FromC", () => "c") } }',
    },
    { plugins: ['./plugins/a.js', './plugins/b.js', './plugins/c.js'] },
    async (root) => {
      const { registry, plugins } = await runPlugins({
        projectRoot: root,
        config: { plugins: ['./plugins/a.js', './plugins/b.js', './plugins/c.js'] },
        quiet: true,
      })
      assert.deepEqual(registry.components.map((c) => c.name), ['FromA', 'FromC'])
      assert.equal(plugins[1].error, 'boom')
      assert.equal(plugins[0].error, null)
      assert.equal(plugins[2].error, null)
    },
  )
})

test('a plugin that throws mid-setup leaves nothing behind', async () => {
  await withPlugins(
    plugin(`
      export default { name: 'half', setup(j) {
        j.addComponent('Ghost', () => 'x')
        j.addRoute('/ghost', () => {})
        j.on('html:head', () => {})
        throw new Error('failed halfway')
      } }
    `),
    { plugins: ['./plugins/p.js'] },
    async (root) => {
      const { registry, plugins } = await runPlugins({
        projectRoot: root,
        config: { plugins: ['./plugins/p.js'] },
        quiet: true,
      })
      assert.equal(plugins[0].error, 'failed halfway')
      assert.equal(registry.components.length, 0)
      assert.equal(registry.routes.length, 0)
      assert.deepEqual(Object.keys(registry.hooks), [])
    },
  )
})

test('loadPlugins validates without running setup', async () => {
  await withPlugins(
    {
      'plugins/ok.js': 'export default { name: "ok", setup() { throw new Error("never called") } }',
      'plugins/notsetup.js': 'export default { name: "nope" }',
    },
    {},
    async (root) => {
      const config = { plugins: ['./plugins/ok.js', './plugins/notsetup.js', './plugins/gone.js'] }
      const loaded = await loadPlugins(root, config)
      assert.equal(loaded[0].error, null, 'setup must not run during validation')
      assert.equal(typeof loaded[0].setup, 'function')
      assert.match(loaded[1].error, /does not export a setup\(jprot\) function/)
      assert.match(loaded[2].error, /could not resolve/)
    },
  )
})

test('a config with no plugins loads nothing', async () => {
  await withPlugins({}, {}, async (root) => {
    assert.deepEqual(await loadPlugins(root, {}), [])
    assert.deepEqual(await loadPlugins(root, { plugins: 'nope' }), [])
    const { registry } = await runPlugins({ projectRoot: root, config: {}, quiet: true })
    assert.deepEqual(registry.components, [])
    assert.deepEqual(registry.routes, [])
  })
})
