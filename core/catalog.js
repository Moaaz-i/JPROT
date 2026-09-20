// `jprot add` / `jprot search` — install ready-made components from a remote
// catalog (default: the JPROT Catalog site's public/catalog/ folder).
//
// The catalog is a plain static directory, so any host works:
//   {catalogUrl}/catalog/catalog.json      ← element index
//   {catalogUrl}/catalog/elements/<Name>.js ← component source
//
// Resolution order for the catalog URL:
//   1. --from <url> flag
//   2. `catalogUrl` key in the site's jprot.config.js
//   3. the built-in default (null → clear error telling the user to set one)
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'

export const DEFAULT_CATALOG_URL = null

export function catalogHelp() {
  return [
    '  Where is the catalog? Set `catalogUrl` in your jprot.config.js,',
    '  e.g.   catalogUrl: \'https://YOUR-ACCOUNT.github.io/JPROT-catalog\',',
    '  or pass --from <url> to this command.',
  ]
}

async function fetchText(url) {
  let res
  try {
    res = await fetch(url)
  } catch {
    throw new Error(`could not reach the catalog at ${url}`)
  }
  if (!res.ok) throw new Error(`catalog responded ${res.status} for ${url}`)
  return res.text()
}

export async function resolveCatalogUrl({ projectRoot, from } = {}) {
  if (from) return String(from).replace(/\/+$/, '')
  const cfg = await readCatalogUrl(projectRoot)
  if (cfg) return cfg.replace(/\/+$/, '')
  if (DEFAULT_CATALOG_URL) return DEFAULT_CATALOG_URL.replace(/\/+$/, '')
  return null
}

// Reads the `catalogUrl: '…'` leaf key out of jprot.config.js without
// executing user code (same approach as scaffold.js's readConfig).
async function readCatalogUrl(projectRoot) {
  try {
    const raw = await readFile(join(projectRoot, 'jprot.config.js'), 'utf8')
    const match = raw.match(/catalogUrl\s*:\s*['"]([^'"]+)['"]/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export async function searchCatalog({ catalogUrl, query } = {}) {
  const index = JSON.parse(await fetchText(catalogUrl + '/catalog/catalog.json'))
  const q = String(query || '').trim().toLowerCase()
  const all = index.elements || []
  const items = q
    ? all.filter((e) =>
        [e.name, e.category, e.description, ...(e.tags || [])]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    : all
  return { url: catalogUrl, meta: index.meta || {}, items }
}

export async function addCatalogElement({ projectRoot, catalogUrl, name } = {}) {
  const { meta, items } = await searchCatalog({ catalogUrl })
  const el = items.find(
    (e) => e.name.toLowerCase() === String(name || '').toLowerCase(),
  )
  if (!el) {
    const known = (items.length ? items : []).map((e) => e.name).join(', ')
    throw new Error(`unknown element "${name}" — try 'jprot search${name ? ' ' + name : ''}'${known ? ` (catalog has: ${known})` : ''}`)
  }

  const dest = join(projectRoot, 'theme', 'components', el.name + '.js')
  try {
    await stat(dest)
    throw new Error(`already installed: theme/components/${el.name}.js`)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  const source = await fetchText(catalogUrl + '/' + el.file.replace(/^\//, ''))
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, source, 'utf8')

  return {
    name: el.name,
    file: dest,
    source: catalogUrl + '/' + el.file.replace(/^\//, ''),
    version: meta.version,
  }
}