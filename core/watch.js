// The dev-server watcher.
//
// The previous implementation watched the *project root* recursively and, on
// every event, re-walked the whole tree to build an mtime fingerprint. That was
// both slow (O(every file) per keystroke) and wrong (exporting to `dist/`, a
// `git checkout`, or an `npm install` all looked like "content changed").
//
// This version asks a narrower question: *what kind of file changed, and which
// caches does that actually invalidate?*
//
//   kind       example                     rebuild
//   ────────   ─────────────────────────   ─────────────────────────────
//   config     jprot.config.js             everything, cache-busted
//   component  theme/main.js, styles.css   components + theme CSS, busted
//   content    content/**, content images  content graph only
//   asset      public/**, uploads/         nothing (served from disk)
//   ignored    dist/, node_modules, .git   nothing
//
// `onChange` receives that verdict, so the caller invalidates exactly one layer
// instead of rebuilding the world — and a directory the watcher does not care
// about costs nothing at all.
import { readdir, stat } from 'node:fs/promises'
import { watch } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'

// Directories under the project root that are never watched: build output,
// dependencies, VCS metadata and editor scratch files. Watching them turns
// your own `jprot export` into an infinite reload loop.
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', '.next',
  '.cache', '.turbo', 'coverage', '.vercel', '.netlify', '.DS_Store',
])

// How much work a change forces, and what it means. `bust: true` re-reads
// config/components from disk instead of trusting the module cache.
export const CHANGE_KINDS = {
  config: { bust: true, rebuild: 'all', label: 'config' },
  component: { bust: true, rebuild: 'theme', label: 'component' },
  content: { bust: false, rebuild: 'graph', label: 'content' },
  asset: { bust: false, rebuild: 'none', label: 'asset' },
  ignored: { bust: false, rebuild: 'none', label: 'ignored' },
}

const normalize = (p) => String(p || '').split(sep).join('/')

function isInside(dir, file) {
  if (!dir || !file) return false
  const rel = relative(dir, file)
  if (!rel || isAbsolute(rel)) return false
  return rel !== '..' && !rel.startsWith(`..${sep}`)
}

/**
 * Build a path → change-kind classifier for one project.
 *
 * Exported so `jprot lint`/tests can ask the same question the watcher asks,
 * without starting any timers.
 *
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {string} [options.contentDir]
 * @param {string} [options.userThemeDir]
 * @param {string} [options.publicDir]
 * @param {string[]} [options.configFiles]
 * @returns {(changed: string) => {kind: string, path: string, rel: string,
 *          bust: boolean, rebuild: string, label: string}}
 */
export function createChangeClassifier({
  projectRoot,
  contentDir,
  userThemeDir,
  publicDir,
  configFiles = [],
} = {}) {
  const configs = new Set(configFiles.map(normalize))
  const content = contentDir && normalize(contentDir)
  const theme = userThemeDir && normalize(userThemeDir)
  const pub = publicDir && normalize(publicDir)

  return function classify(changed) {
    const path = normalize(changed)
    const rel = projectRoot ? normalize(relative(projectRoot, path)) : path
    const verdict = (kind) => ({ kind, path, rel, ...CHANGE_KINDS[kind] })

    if (!path) return verdict('ignored')
    if (configs.has(path)) return verdict('config')

    const segments = rel.split('/')
    if (segments.some((s) => EXCLUDED_DIRS.has(s))) return verdict('ignored')

    if (theme && isInside(theme, path)) return verdict('component')
    if (content && isInside(content, path)) return verdict('content')
    if (pub && isInside(pub, path)) return verdict('asset')
    // A second site in a monorepo (`examples/docs/content/…`, `…/theme/…`)
    // still has a content tree and a theme worth picking up.
    if (segments.includes('content')) return verdict('content')
    if (segments.includes('theme')) return verdict('component')
    return verdict('ignored')
  }
}

/* ---------------- polling fallback ---------------- */

// Only the watched roots are fingerprinted — never the project root, so a
// thousand-file `node_modules` costs nothing.
async function fingerprint(dir, out, depth = 0) {
  if (depth > 12) return
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.') || EXCLUDED_DIRS.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) { await fingerprint(full, out, depth + 1); continue }
    let st
    try { st = await stat(full) } catch { continue }
    out.push(`${full}:${st.mtimeMs}:${st.size}`)
  }
}

// One fingerprint per watched path, so a change can be attributed to the exact
// root that moved (a config edit is a `config` change, not a generic reload).
async function snapshot(paths) {
  const out = new Map()
  for (const p of paths) {
    try {
      const st = await stat(p)
      out.set(p, st.isDirectory() ? await fingerprintParts(p) : `${st.mtimeMs}:${st.size}`)
    } catch {
      out.set(p, null)
    }
  }
  return out
}

async function fingerprintParts(dir) {
  const parts = []
  await fingerprint(dir, parts)
  return parts.sort().join('|')
}

/* ---------------- the watcher ---------------- */

/**
 * Start watching a project and report *classified* changes.
 *
 * @param {object} options
 * @param {string} options.projectRoot
 * @param {string} [options.contentDir]
 * @param {string} [options.userThemeDir]
 * @param {string} [options.publicDir]
 * @param {string[]} [options.configFiles]
 * @param {(change: object) => any} [options.onChange] called per coalesced change
 * @param {() => any} [options.onReload] legacy: called for any non-ignored change
 * @param {boolean} [options.verbose] log each change (default: only real reloads)
 * @returns {{close: () => void, classify: Function, isReloadPending: () => boolean,
 *            watched: () => string[]}}
 */
export function startReloadWatcher({
  projectRoot,
  contentDir,
  userThemeDir,
  publicDir,
  configFiles = [],
  onChange,
  onReload,
  verbose = true,
} = {}) {
  const classify = createChangeClassifier({ projectRoot, contentDir, userThemeDir, publicDir, configFiles })
  const roots = [contentDir, userThemeDir, publicDir].filter(Boolean)
  const interestingDirs = [...new Set(roots.map(normalize))]
  const watched = new Set()
  const listeners = new Set()

  let pending = null
  let timer = null
  let interval = null
  let closed = false

  // Coalesce a burst of edits (save-all in an editor, a `git checkout`) into one
  // change, keeping the strongest verdict seen: config > component > content >
  // asset. A config edit therefore still busts the module cache even if a
  // content file changed alongside it.
  const RANK = { config: 4, component: 3, content: 2, asset: 1, ignored: 0 }
  const merge = (a, b) => (!a ? b : RANK[b.kind] > RANK[a.kind] ? b : a)

  const flush = async () => {
    timer = null
    const change = pending
    pending = null
    if (!change || closed || change.kind === 'ignored') return
    if (typeof onChange === 'function') {
      try {
        await onChange(change)
      } catch (e) {
        console.warn('[jprot] Reload failed:', e.message)
        return
      }
    } else if (typeof onReload === 'function') {
      try {
        await onReload(change.bust)
      } catch (e) {
        console.warn('[jprot] Reload failed:', e.message)
        return
      }
    } else {
      return
    }
    if (verbose) console.log(`[jprot] Reloaded (${change.label} change: ${change.rel || change.path})`)
  }

  const schedule = (changed) => {
    const change = classify(changed)
    if (change.kind === 'ignored') return
    pending = merge(pending, change)
    // A config change is rare and expensive to get wrong: run it immediately so
    // a typo in jprot.config.js surfaces in the terminal right away.
    if (change.kind === 'config') { clearTimeout(timer); timer = setTimeout(flush, 0); return }
    clearTimeout(timer)
    timer = setTimeout(flush, 120)
  }

  const addListener = (dir) => {
    const key = normalize(dir)
    if (watched.has(key)) return
    try {
      watched.add(key)
      listeners.add(watch(dir, { persistent: true }, (_event, filename) => {
        if (!filename) return schedule(dir)
        schedule(join(dir, String(filename)))
      }))
    } catch {
      // A missing or unreadable directory must not sabotage the others — the
      // root watcher below picks it up if it appears later.
      watched.delete(key)
    }
  }

  // Watch the root non-recursively: it exists so a `theme/` or `public/`
  // directory created *after* startup is picked up, without ever descending
  // into dist/ or node_modules/.
  let rootListener = null
  const watchRoot = () => {
    if (!projectRoot) return false
    try {
      rootListener = watch(projectRoot, { persistent: true }, (_event, filename) => {
        if (!filename) return
        const name = String(filename)
        if (EXCLUDED_DIRS.has(name)) return
        const full = join(projectRoot, name)
        // A newly created top-level directory may be one we care about.
        if (interestingDirs.some((d) => normalize(d) === normalize(full))) addListener(full)
        schedule(full)
      })
      return true
    } catch {
      return false
    }
  }

  for (const dir of roots) addListener(dir)
  const usingFsWatch = watchRoot() && (roots.length === 0 || watched.size > 0)

  if (!usingFsWatch) {
    // Polling fallback (Linux without inotify limits, network mounts, …).
    for (const l of listeners) { try { l.close() } catch {} }
    listeners.clear()
    watched.clear()
    if (rootListener) { try { rootListener.close() } catch {} rootListener = null }
    const pollPaths = [...roots, ...configFiles]
    let previous = new Map()
    snapshot(pollPaths).then((snap) => { previous = snap })
    interval = setInterval(async () => {
      const next = await snapshot(pollPaths)
      for (const p of pollPaths) {
        if (next.get(p) === previous.get(p)) continue
        schedule(p)
      }
      previous = next
    }, 700)
  }

  return {
    close() {
      closed = true
      clearTimeout(timer)
      if (interval) clearInterval(interval)
      for (const l of listeners) { try { l.close() } catch {} }
      listeners.clear()
      if (rootListener) { try { rootListener.close() } catch {} }
      watched.clear()
    },
    classify,
    isReloadPending: () => timer !== null,
    watched: () => [...watched],
  }
}
