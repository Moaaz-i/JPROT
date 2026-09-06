import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_THEME_DIR } from './config.js'

async function listComponents(sourceDir) {
  const names = []
  try {
    const entries = await readdir(sourceDir)
    for (const n of entries) if (n.endsWith('.js')) names.push([n.replace(/\.js$/, ''), join(sourceDir, n)])
  } catch { /* dir missing */ }
  return names
}

// Loads every *.js component from the built-in theme dir plus user overrides.
// User components with the same name override the built-ins.
export async function loadComponents(userThemeDir, bust = false) {
  const candidates = [
    ...(await listComponents(join(DEFAULT_THEME_DIR, 'components'))),
    ...(await listComponents(join(userThemeDir, 'components'))),
  ]
  const loaded = {}
  for (const [name, file] of candidates) {
    const href = pathToFileURL(file).href + (bust ? '?t=' + Date.now() : '')
    try {
      const mod = await import(href)
      const value = mod.default || mod
      if (typeof value !== 'function') {
        console.warn(`[jprot] component "${name}" in ${file} does not export a component function; skipping`)
        continue
      }
      loaded[name] = value
    } catch (e) {
      console.warn(`[jprot] could not load component "${name}" from ${file}: ${e.message}`)
    }
  }
  return loaded
}
