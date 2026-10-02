import { readFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const jprotRoot = dirname(dirname(fileURLToPath(import.meta.url)))

// Where the built-in default theme ships inside this package.
export const DEFAULT_THEME_DIR = join(jprotRoot, 'theme', 'default')

async function hasFile(path) {
  try { return (await stat(path)).isFile() } catch { return false }
}

// Unwraps a module namespace: `export default {...}` wins; otherwise a
// `export const config = {...}` is used and a hint is printed. Anything else
// is returned untouched so a callable config survives.
function unwrapConfig(mod) {
  if (!mod || typeof mod !== 'object') return mod
  if (mod.default !== undefined) return mod.default
  if ('config' in mod && mod.config !== undefined) {
    console.warn('[jprot] jprot.config.js uses `export const config` — prefer `export default {...}`.')
    return mod.config
  }
  return mod
}

// Imports jprot.config.js as ESM. Direct file import honours relative imports
// and file watching, but fails when the file lives in a folder that has no
// `"type": "module"` in package.json (e.g. a temp dir used by tests), because
// Node then treats `.js` as CommonJS and chokes on `export`. In that case we
// retry by reading the source and importing it as a data URL.
async function importConfigFile(jsPath, bust) {
  const fresh = (href) => (bust ? href + '?t=' + Date.now() : href)
  try {
    const mod = await import(fresh(pathToFileURL(jsPath).href))
    return { ok: true, mod }
  } catch (err) {
    const esmAsCjs = /Unexpected token 'export'|ERR_REQUIRE_ESM/.test(String(err.message))
    if (!esmAsCjs) throw err
    const code = await readFile(jsPath, 'utf8')
    const mod = await import('data:text/javascript,' + encodeURIComponent(code))
    return { ok: true, mod }
  }
}

// Loads the site configuration from (in order of precedence):
// an explicitly provided object/handler, jprot.config.js, or jprot.config.json.
//
// `withSource` additionally returns the file the config came from and its raw
// text, which is what lets `jprot check` report `jprot.config.js:18` for a bad
// value instead of just naming the key.
export async function loadSiteConfig(projectRoot, configOption, bust = false) {
  const { config } = await loadConfigWithSource(projectRoot, configOption, bust)
  return config
}

export async function loadConfigWithSource(projectRoot, configOption, bust = false) {
  if (typeof configOption === 'function') {
    const c = await configOption()
    return { config: unwrapConfig(c) || {}, file: '<inline config>', source: '' }
  }
  if (configOption) return { config: configOption, file: '<inline config>', source: '' }

  const fresh = (href) => (bust ? href + '?t=' + Date.now() : href)
  const jsPath = join(projectRoot, 'jprot.config.js')
  if (await hasFile(jsPath)) {
    const source = await readFile(jsPath, 'utf8').catch(() => '')
    try {
      const { mod } = await importConfigFile(jsPath, bust)
      return { config: unwrapConfig(mod) || {}, file: 'jprot.config.js', source }
    } catch (e) {
      // A broken config is fatal. Falling back to `{}` used to produce a fully
      // functional but completely unconfigured site — no nav, no theme, no
      // plugins, no error page — which reads as "JPROT is broken" rather than
      // "your config has a typo". `jprot check` reports this with a line
      // number, and the dev server refuses to start until it is fixed.
      throw new ConfigLoadError('jprot.config.js', e)
    }
  }
  const jsonPath = join(projectRoot, 'jprot.config.json')
  if (await hasFile(jsonPath)) {
    const source = await readFile(jsonPath, 'utf8').catch(() => '')
    try {
      return { config: JSON.parse(source), file: 'jprot.config.json', source }
    } catch (e) {
      throw new ConfigLoadError('jprot.config.json', e)
    }
  }
  return { config: {}, file: '', source: '' }
}

// Thrown when a config file exists but cannot be loaded. `file` is the bare
// name so `jprot check` can point at it, and `cause` keeps the original
// SyntaxError/message intact.
export class ConfigLoadError extends Error {
  constructor(file, cause) {
    super(`Could not load ${file}: ${cause && cause.message ? cause.message : cause}`)
    this.name = 'ConfigLoadError'
    this.file = file
    this.cause = cause
  }
}

// Reads theme/main.js so a theme can declare its default composition.
export async function loadThemeMeta(themeDir) {
  const p = join(themeDir, 'main.js')
  if (!(await hasFile(p))) return {}
  try {
    const mod = await import(pathToFileURL(p).href)
    return mod.default || mod
  } catch {
    return {}
  }
}
