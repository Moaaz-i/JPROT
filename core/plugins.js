// The JPROT plugin API.
//
// A plugin is a single file that exports a `setup(jprot)` function. It runs once
// per state build, before components and pages are rendered, and gets a small,
// explicit object to work with — no internals, no monkey-patching:
//
//   // plugins/analytics.js
//   export default {
//     name: 'analytics',
//     setup({ addComponent, on, config }) {
//       on('html:head', (html) =>
//         html.replace('</head>', `  <script defer src="/_a.js"></script>\n</head>`))
//     },
//   }
//
//   // jprot.config.js
//   export default { plugins: ['./plugins/analytics.js'] }
//
// Design constraints, in priority order:
//
//   1. A broken plugin must never take the site down. Loading and `setup()` are
//      both wrapped, and the failure surfaces through `jprot check` so CI
//      catches it instead of a blank page.
//   2. The hook surface stays small on purpose. Anything a plugin can do here
//      is a promise we can keep across a major version; anything it can reach
//      through `globalThis` is not.
//   3. Plugins are declared in `jprot.config.js` under `plugins: [...]`, so a
//      site's behaviour stays fully described by files in the repo.
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stat } from 'node:fs/promises'

/**
 * Every event a plugin may subscribe to, with the arguments its handler
 * receives. Listed here (rather than in prose) so the docs and `jprot.d.ts` can
 * be generated from one source, and so a typo like `on('htlm:head')` fails
 * loudly at setup time instead of silently never firing.
 */
export const HOOKS = {
  // A full state build is starting. `state` is mutable.
  'state:build': { args: ['state'], returns: 'void', description: 'inspect or extend the render state' },
  // After plugins have added their components, before the theme registry wins.
  'components:load': { args: ['components'], returns: 'void', description: 'add or wrap components' },
  // A rendered page, before it is written to the response.
  'html:page': { args: ['html', 'page'], returns: 'html', description: 'transform a rendered page' },
  // Injection points inside the page shell.
  'html:head': { args: ['html', 'page'], returns: 'html', description: 'inject markup into <head>' },
  'html:body-end': { args: ['html', 'page'], returns: 'html', description: 'inject markup before </body>' },
  // JSON endpoints (search.json, manifest.json). `data` is a parsed object.
  'endpoint:json': { args: ['data', 'path'], returns: 'data', description: 'add keys to a JSON response' },
  // Lifecycle only.
  build: { args: [], returns: 'void', description: 'any state build, before rendering' },
  export: { args: ['dest'], returns: 'void', description: 'a static export finished writing to dest' },
}

const HOOK_NAMES = Object.keys(HOOKS)

async function fileExists(p) {
  try { return (await stat(p)).isFile() } catch { return false }
}

/**
 * Resolve a plugin specifier to an importable href.
 *
 * Accepts a project-relative path (`./plugins/analytics.js`), a bare specifier
 * resolved through Node's resolver (`jprot-plugin-rss`), an absolute path, or a
 * `file:` URL.
 *
 * @param {string} spec
 * @param {string} projectRoot
 * @returns {Promise<{href: string|null, file: string, name: string, missing?: boolean}>}
 */
export async function resolvePlugin(spec, projectRoot) {
  const raw = String(spec || '').trim()
  const name = raw.replace(/^\.\//, '').replace(/\.js$/, '').split('/').pop() || raw

  if (raw.startsWith('file:')) {
    return { href: raw, file: new URL(raw).pathname, name }
  }
  if (isAbsolute(raw)) {
    return { href: pathToFileURL(raw).href, file: raw, name }
  }
  const local = resolve(projectRoot, raw)
  if (await fileExists(local)) {
    return { href: pathToFileURL(local).href, file: local, name }
  }
  // A relative specifier can only mean "this file in this project" — falling
  // back to a package lookup would resolve against core/plugins.js and produce
  // a baffling "cannot find module /…/core/plugins/missing.js".
  if (raw.startsWith('.')) return { href: null, file: local, name, missing: true }
  // Bare specifier, i.e. an installed package. `import.meta.resolve` throws for
  // anything that is not installed, which is exactly the answer we want.
  try {
    const href = import.meta.resolve(raw)
    return { href, file: href.startsWith('file:') ? new URL(href).pathname : raw, name }
  } catch {
    return { href: null, file: local, name, missing: true }
  }
}

/**
 * Import every plugin declared in the config, without running any of them.
 *
 * `jprot check` uses this to verify each plugin is resolvable, importable, and
 * exports a `setup` function — the three things that make a build fail later.
 *
 * @param {string} projectRoot
 * @param {object} config
 * @param {object} [options]
 * @param {boolean} [options.bust] bypass the ESM module cache
 * @returns {Promise<Array<{name: string, file: string, href: string,
 *   setup: Function|null, plugin: object, error: string|null}>>}
 */
export async function loadPlugins(projectRoot, config, { bust = false } = {}) {
  const specs = Array.isArray(config?.plugins) ? config.plugins : []
  const out = []
  for (const spec of specs) {
    const resolved = await resolvePlugin(spec, projectRoot)
    const record = {
      name: resolved.name,
      file: resolved.file,
      href: resolved.href,
      plugin: null,
      setup: null,
      error: null,
    }
    if (resolved.missing) {
      record.error = `could not resolve "${spec}" — no such file and no installed package by that name`
      out.push(record)
      continue
    }
    try {
      const mod = await import(bust ? resolved.href + '?t=' + Date.now() : resolved.href)
      const plugin = mod.default || mod
      const setup = typeof plugin === 'function' ? plugin : plugin && plugin.setup
      if (typeof setup !== 'function') {
        record.error = 'does not export a setup(jprot) function'
        out.push(record)
        continue
      }
      record.plugin = typeof plugin === 'function' ? { name: resolved.name, setup } : plugin
      record.setup = setup
      if (record.plugin.name) record.name = record.plugin.name
    } catch (e) {
      record.error = e.message
    }
    out.push(record)
  }
  return out
}

/** Accumulator every plugin writes into; shared so ordering is deterministic. */
function createRegistries() {
  return {
    hooks: {},
    routes: [],
    markdown: { defaults: {}, extensions: [] },
  }
}

/**
 * The object handed to every `setup(jprot)` call.
 *
 * Everything a plugin can do is a method on this object, so the contract is
 * greppable, documentable, and — importantly — stubbable in tests.
 */
function createPluginApi({ config, registry, pluginName }) {
  const api = {
    /** The loaded site config, for reading the plugin's own options. */
    config,

    /**
     * Register a component under `name`. Registered components are applied
     * after the theme's own, so a plugin can intentionally override a built-in
     * by using the same name.
     *
     * @param {string} name
     * @param {Function|{name?: string, props?: object, render: Function}} component
     */
    addComponent(name, component) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error('addComponent(name, component): name must be a non-empty string')
      }
      if (typeof component !== 'function' && !(component && typeof component.render === 'function')) {
        throw new Error(`addComponent("${name}"): expected a render function or { name, props, render }`)
      }
      registry.components.push({ name, component, plugin: pluginName })
      return component
    },

    /**
     * Serve a response at `path` ahead of the content router. The path is
     * matched exactly, so a plugin can never shadow a content page by accident
     * — registering the same path on purpose is an explicit choice.
     *
     * @param {string} path  e.g. `/feed.json`
     * @param {(req, res) => any} handler
     */
    addRoute(path, handler) {
      if (typeof path !== 'string' || !path.startsWith('/')) {
        throw new Error(`addRoute("${path}"): path must be a string starting with "/"`)
      }
      if (typeof handler !== 'function') throw new Error(`addRoute("${path}"): handler must be a function`)
      const clean = path.replace(/\/+$/, '') || '/'
      registry.routes.push({ path: clean, handler, plugin: pluginName })
      return clean
    },

    /**
     * Add Markdown support. `defaults` patches the feature flags
     * (`{ footnotes: false }`); `extensions` are extra renderers with the same
     * signature as JPROT's own.
     *
     * @param {{defaults?: object, extensions?: Function[]}} extension
     */
    extendMarkdown(extension) {
      if (!extension || typeof extension !== 'object') {
        throw new Error('extendMarkdown({ defaults, extensions }): expected an object')
      }
      Object.assign(registry.markdown.defaults, extension.defaults || {})
      for (const fn of extension.extensions || []) {
        if (typeof fn !== 'function') throw new Error('extendMarkdown: every entry in `extensions` must be a function')
        registry.markdown.extensions.push(fn)
      }
      return api
    },

    /**
     * Subscribe to one of the events in {@link HOOKS}. Returning a value from a
     * `html:*` or `endpoint:*` handler replaces the response; other hooks are
     * fire-and-forget.
     *
     * @param {keyof HOOKS} name
     * @param {Function} handler
     */
    on(name, handler) {
      if (!HOOKS[name]) {
        throw new Error(`unknown hook "${name}" — available hooks: ${HOOK_NAMES.join(', ')}`)
      }
      if (typeof handler !== 'function') throw new Error(`on("${name}"): handler must be a function`)
      ;(registry.hooks[name] || (registry.hooks[name] = [])).push(handler)
      return handler
    },
  }
  return api
}

/**
 * Run every configured plugin's `setup()`, collecting hooks, components and
 * routes into shared registries.
 *
 * A plugin that throws is reported and skipped: one bad plugin must not stop
 * the other two from loading, and must never stop the site from serving.
 *
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {object} options.config
 * @param {object} [options.registry]  existing registry to extend (hot reload)
 * @param {boolean} [options.bust]    re-import plugin modules from disk
 * @param {boolean} [options.quiet]   suppress the console warnings (the
 *                                     returned records carry the same detail,
 *                                     so `jprot check` can render them itself)
 * @returns {Promise<{registry: object, plugins: Array}>}
 */
export async function runPlugins({ projectRoot, config, registry = createRegistries(), bust = false, quiet = false } = {}) {
  if (!registry.components) registry.components = []
  const loaded = await loadPlugins(projectRoot, config, { bust })
  const applied = []
  const warn = (msg) => { if (!quiet) console.warn(msg) }

  for (const record of loaded) {
    if (record.error) {
      warn(`[jprot] plugin "${record.name}": ${record.error}`)
      applied.push({ name: record.name, file: record.file, error: record.error })
      continue
    }
    // A plugin writes into its own staging area. If `setup()` throws, nothing
    // is committed — a half-registered component or route can never survive
    // into the registry, which would be a far worse bug than the thrown error.
    const staged = { components: [], routes: [], markdown: { defaults: {}, extensions: [] } }
    const stagedHooks = {}
    const staging = {
      ...registry,
      components: staged.components,
      routes: staged.routes,
      markdown: staged.markdown,
      // Hook handlers land in a private per-plugin list. The proxy has to trap
      // *writes* as well as reads: `on()` does `hooks[name] ||= []` then pushes
      // onto that array, and without a `set` trap the assignment would commit
      // straight to the shared registry.
      hooks: new Proxy({}, {
        get: (_t, key) => stagedHooks[key],
        set: (_t, key, value) => { stagedHooks[key] = value; return true },
        has: (_t, key) => key in stagedHooks,
        deleteProperty: (_t, key) => delete stagedHooks[key],
        ownKeys: () => Reflect.ownKeys(stagedHooks),
        getOwnPropertyDescriptor: (_t, key) =>
          Object.getOwnPropertyDescriptor(stagedHooks, key),
      }),
    }
    const api = createPluginApi({ config, registry: staging, pluginName: record.name })
    try {
      await record.setup(api)
      registry.components.push(...staged.components)
      registry.routes.push(...staged.routes)
      Object.assign(registry.markdown.defaults, staged.markdown.defaults)
      registry.markdown.extensions.push(...staged.markdown.extensions)
      for (const [hook, handlers] of Object.entries(stagedHooks)) {
        ;(registry.hooks[hook] || (registry.hooks[hook] = [])).push(...handlers)
      }
      applied.push({
        name: record.name,
        file: record.file,
        error: null,
        components: staged.components.map((c) => c.name),
        routes: staged.routes.map((r) => r.path),
        hooks: Object.keys(stagedHooks),
      })
    } catch (e) {
      record.error = e.message
      warn(`[jprot] plugin "${record.name}" threw during setup(): ${e.message}`)
      applied.push({ name: record.name, file: record.file, error: e.message })
    }
  }

  return { registry, plugins: applied }
}

export { createRegistries }
