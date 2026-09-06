import { readdir, stat } from 'node:fs/promises'
import { watch } from 'node:fs'
import { join } from 'node:path'

async function collectWatchFingerprint(targets, out, depth = 0) {
  if (depth > 12) return
  let entries
  try { entries = await readdir(targets, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const full = join(targets, e.name)
    let st
    try { st = await stat(full) } catch { continue }
    if (e.isDirectory()) await collectWatchFingerprint(full, out, depth + 1)
    else out.push(`${full}:${st.mtimeMs}`)
  }
}

async function computeFingerprint(configFiles, watchRoots) {
  const parts = []
  for (const f of configFiles) {
    try { parts.push(`${f}:${(await stat(f)).mtimeMs}`) } catch { /* config missing */ }
  }
  for (const dir of watchRoots) await collectWatchFingerprint(dir, parts)
  return parts.sort().join('|')
}

export function startReloadWatcher({ projectRoot, contentDir, userThemeDir, publicDir, configFiles, onReload }) {
  const watchRoots = [...new Set([projectRoot, contentDir, userThemeDir, publicDir].filter((d) => d))]
  const allFiles = () => computeFingerprint(configFiles, watchRoots)

  let last = ''
  let timer = null
  let watchers = []
  let interval = null

  const maybeReload = async () => {
    const next = await allFiles()
    if (next === last || !last) { last = next; return }
    last = next
    if (typeof onReload !== 'function') return
    try {
      await onReload()
      console.log('[jprot] Reloaded (file change detected)')
    } catch (e) {
      console.warn('[jprot] Reload failed:', e.message)
    }
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(maybeReload, 120)
  }

  const stop = () => {
    clearTimeout(timer)
    clearInterval(interval)
    for (const w of watchers) { try { w.close() } catch {} }
    watchers = []
  }

  // strategy 1: recursive fs.watch (macOS / Windows)
  try {
    for (const dir of watchRoots) {
      const w = watch(dir, { recursive: true }, schedule)
      watchers.push(w)
    }
    // seed the baseline fingerprint (ignore the very first diff)
    maybeReload()
  } catch {
    // strategy 2: polling fallback (Linux and other platforms)
    stop()
    interval = setInterval(() => { schedule() }, 700)
  }

  return { close: stop, isReloadPending: () => timer !== null }
}