// Getting files into memory: one directory walk, cached by mtime/size.
//
// Nothing here knows what a content graph *is* — it produces parsed entries
// and forgets them when they change, so search, navigation and page
// rendering all stay cheap while edits still show up immediately.

import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { parseFrontmatter } from '../../lib/frontmatter.js'

export const parsedCache = new Map()

// Reuse parsed content while its mtime/size is unchanged. This keeps search,
// navigation, feeds and page rendering cheap without making edits stale.
export async function readParsed(file) {
  let info
  try { info = await stat(file) } catch {
    parsedCache.delete(file)
    throw new Error(`File not found: ${file}`)
  }
  const cached = parsedCache.get(file)
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.value
  const raw = await readFile(file, 'utf8')
  const value = parseFrontmatter(raw)
  parsedCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, value })
  return value
}

// Drop cache entries for files that no longer exist on disk, and cap the map so
// a long-lived process (a dev server hot-reloading for hours, or the VS Code
// preview re-parsing on every keystroke) cannot grow it without bound.
//
// `evictStaleCache` used to be exported and never called, and its synchronous
// `try { stat(file) } catch` could never fire because a missing file rejects the
// returned promise rather than throwing — so nothing was ever removed. It is
// now awaited and called on every graph build.
const MAX_PARSED_ENTRIES = 2048

export async function evictStaleCache() {
  // `stat` is async, so it has to be awaited: the synchronous `try/catch` this
  // used to have never caught anything, because a missing file rejects the
  // returned promise rather than throwing. Entries were therefore never
  // actually removed.
  await Promise.all(
    [...parsedCache.keys()].map(async (file) => {
      try {
        await stat(file)
      } catch {
        parsedCache.delete(file)
      }
    }),
  )
  // Eviction is by insertion order (Map preserves it), so the oldest parses go
  // first. Entries are re-created on demand by readParsed.
  while (parsedCache.size > MAX_PARSED_ENTRIES) {
    const oldest = parsedCache.keys().next()
    if (oldest.done) break
    parsedCache.delete(oldest.value)
  }
}

/* ---------------- file discovery ---------------- */

// Recursively collect every .md file under `dir`, skipping dotfiles. Each entry
// carries the stat data the graph needs to decide whether a re-read is due, so
// discovery never has to stat the same file twice.
export async function walk(dir, out, depth = 0) {
  if (depth > 12) return
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  const dirs = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) { dirs.push(full); continue }
    if (extname(entry.name) !== '.md') continue
    try {
      const st = await stat(full)
      out.push({ file: full, mtimeMs: st.mtimeMs, size: st.size })
    } catch { /* vanished mid-walk */ }
  }
  for (const d of dirs) await walk(d, out, depth + 1)
}

export async function walkMarkdown(dir) {
  const out = []
  await walk(dir, out)
  return out
}

// Absolute paths of every Markdown file under `dir` (the shape the HTTP layer
// and the CLI expect).
export async function listMarkdown(dir) {
  return (await walkMarkdown(dir)).map((f) => f.file)
}

// A stable fingerprint of the content tree: file set + mtime + size. When this
// string is unchanged, the graph can be reused verbatim.
export function signatureOf(files) {
  return files.map((f) => `${f.file}:${f.mtimeMs}:${f.size}`).join('|')
}

/* ---------------- text helpers ---------------- */

// Normalize a `YYYY-M-D` / `YYYY-MM-DD` frontmatter date into a zero-padded
// sortable key so non-padded dates (2026-1-5) don't misorder vs padded ones.
