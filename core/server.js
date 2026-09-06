import { createServer } from 'node:http'
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, extname, resolve, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseFrontmatter } from '../lib/frontmatter.js'
import { createMarkdown } from '../lib/markdown.js'
import { esc, isInside, slugify, MIME } from './utils.js'
import { state, runScoped, setFallbackState, DEFAULT_LABELS } from './state.js'
import { loadSiteConfig, loadThemeMeta, DEFAULT_THEME_DIR } from './config.js'
import { listMarkdown, listProjects, listPosts, indexAll, buildNavigation, resolveContent, stripMarkdown, readParsed } from './content.js'
import { loadComponents } from './components.js'
import { suggestConfigKey } from './scaffold.js'
import { startReloadWatcher } from './watch.js'
import { CSP, SECURITY_HEADERS, badRequest, etagOf, methodNotAllowed, newNonce, sendWithSecurity } from './http.js'
import { absUrl, decodeRequestPath, mdCanonical } from './urls.js'
import { renderDocumentBody, renderSections } from './render.js'

export { parseFrontmatter } from '../lib/frontmatter.js'
export { resolveRelativeUrl } from './urls.js'

// Site-config keys the hint checker can ingest (complements scaffold's list).
const CONFIG_KEY_HINTS = new Set([
  'url', 'basePath', 'docs', 'title', 'tagline', 'description', 'lang', 'dir', 'author', 'avatar',
  'email', 'themeColor', 'ogImage', 'ogColor', 'ogTextColor', 'logo', 'searchUrl',
  'twitter', 'ogLocale', 'sameAs', 'alternateLangs', 'icon', 'head', 'footerText',
  'blogDir', 'projectsDir', 'defaultLayout', 'homeLayout', 'sidebar', 'showNav',
  'themePicker', 'projectsTitle', 'formspree', 'social', 'nav', 'hero', 'sections',
  'themes', 'labels', 'markdown',
])

function inProdMode() {
  const s = state()
  return !!(s && s.prod)
}

// Assets are cacheable forever when fingerprinted (export copies them under
// content-hashed names); in dev they must revalidate so edits show instantly.
function cacheControlFor(asset) {
  return inProdMode() && asset ? 'public, max-age=31536000, immutable' : 'no-cache'
}


export async function createJprot(options = {}) {
  const projectRoot = options.root ?? process.cwd()
  const contentDir = options.contentDir ?? join(projectRoot, 'content')
  const publicDir = options.publicDir ?? join(projectRoot, 'public')
  const userThemeDir = join(projectRoot, 'theme')

  // Mutable per-instance snapshot. Reassigned on each (re)build; every
  // request reads the latest snapshot via the AsyncLocalStorage store.
  let instanceState = {}

  async function buildState(bust = false) {
    const site = await loadSiteConfig(projectRoot, options.config, bust)
    const markdown = createMarkdown(site.markdown || {})
    let nav = await buildNavigation(contentDir)
    if (Array.isArray(site.nav) && site.nav.length) {
      nav = site.nav.map((n) => (typeof n === 'string' ? { label: n, url: n } : n))
    }
    // Docs mode gets its own full reading order (every content page, sorted by
    // frontmatter `order`) for the sidebar and prev/next — separate from the
    // compact navbar, which is user-controlled via site.nav.
    const docsNav = site.docs ? await buildNavigation(contentDir) : []
    const components = await loadComponents(userThemeDir, bust)
    let themeDir = DEFAULT_THEME_DIR
    try { await stat(join(userThemeDir, 'main.js')); themeDir = userThemeDir } catch {}
    const theme = await loadThemeMeta(themeDir)
    const labels = { ...DEFAULT_LABELS, ...(site.labels || {}) }
    const blogDir = join(contentDir, site.blogDir || 'blog')
    const projectsDir = join(contentDir, site.projectsDir || 'projects')
    const names = new Set(Object.keys(components))
    for (const sec of site.sections || []) {
      const n = sec.component || sec.type
      if (n && !names.has(n)) {
        console.warn(`[jprot] section "${n}" (${sec.title || 'untitled'}) — no component named "${n}" found. Available: ${[...names].sort().join(', ') || '—'}`)
      }
    }
    for (const key of Object.keys(site)) {
      if (key === 'sections' || CONFIG_KEY_HINTS.has(key)) continue
      const hint = suggestConfigKey(key)
      if (hint) console.warn(`[jprot] config key "${key}" not recognized — did you mean "${hint}"?`)
    }
    // Index live stylesheets by content hash. Pages link to /@jprot/css/<sha>.css,
    // so the URLs are stable, immutable-cacheable, and never leak the absolute
    // disk path of the theme in the raw HTML.
    const cssRegistry = new Map()
    const cssOrder = [
      themeDir ? join(themeDir, 'styles.css') : null,
      userThemeDir ? join(userThemeDir, 'custom.css') : null,
    ]
    for (const p of cssOrder) {
      if (!p) continue
      try {
        if (!(await stat(p)).isFile()) continue
        const body = await readFile(p)
        cssRegistry.set(createHash('sha256').update(body).digest('hex').slice(0, 16), p)
      } catch { /* unreadable → just skip */ }
    }
    instanceState = { projectRoot, contentDir, publicDir, userThemeDir, themeDir, theme, site, labels, markdown, nav, docsNav, components, blogDir, projectsDir, prod: options.prod === true, cssRegistry }
    setFallbackState(instanceState)
  }

  await buildState(false)

  const port = Number(options.port ?? process.env.PORT ?? 4114)
  const host = options.host ?? process.env.HOST ?? '127.0.0.1'

  // watch the project for changes and hot-reload state (dev only)
  const watcher = options.watch !== false
    ? startReloadWatcher({
        projectRoot,
        contentDir,
        userThemeDir,
        publicDir,
        configFiles: [join(projectRoot, 'jprot.config.js'), join(projectRoot, 'jprot.config.json')],
        onReload: () => buildState(true),
      })
    : null

  const handleRequest = async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD')
        return methodNotAllowed(res)
      }
      // origin-form request-targets are absolute-paths, so a leading // must
      // never be parsed as an authority (new URL would take '//server.js' to
      // host 'server.js' and serve '/' instead of 404)
      if (req.url.startsWith('//')) req.url = req.url.slice(1)
      const url = new URL(req.url, `http://${host}:${port}`)
      let pathname
      try { pathname = decodeRequestPath(url.pathname) } catch {
        return badRequest(res, 'Invalid request path')
      }

      if (pathname === '/__css') {
        return await serveCss(req, res, url)
      }

      if (pathname.startsWith('/@jprot/css')) {
        return await serveThemeCss(req, res, pathname)
      }

      if (pathname === '/@jprot/search.json') {
        return await serveSearchIndex(res)
      }

      if (pathname === '/sitemap.xml') {
        return await serveSitemap(res)
      }

      if (pathname === '/robots.txt') {
        return await serveRobotsTxt(res)
      }

      if (pathname === '/feed.xml' || pathname === '/rss.xml') {
        return await serveFeed(res, url)
      }

      if (pathname === '/manifest.json') {
        return await serveManifest(res)
      }

      if (pathname === '/favicon.svg') {
        return await serveFavicon(res)
      }

      // auto-generated OG images live in <root>/.cache/og (fingerprinted file)
      if (pathname.startsWith('/@jprot/og/')) {
        return await serveOgImage(req, res, pathname)
      }

      if (pathname === '/llms.txt') {
        return await serveLlmsIndex(res, false)
      }

      if (pathname === '/llms-full.txt') {
        return await serveLlmsIndex(res, true)
      }

      if (pathname === '/' || pathname === '/index.html') {
        return await servePage(res, url, { home: true })
      }

      const pubFile = join(publicDir, pathname.replace(/^\//, ''))
      if (isInside(publicDir, pubFile) && await isFile(pubFile)) {
        return await serveFile(req, res, pubFile)
      }

      // `.md` URLs exist so docs links keep working on GitHub; here they 301 to
      // the clean URL so the site never serves duplicate content.
      const canonical = mdCanonical(pathname)
      if (canonical && await resolveContent(contentDir, pathname)) {
        const { site = {} } = state()
        const location = absUrl(site, canonical) || `http://${host}:${boundPort}${canonical}`
        res.writeHead(301, { Location: location, ...SECURITY_HEADERS, 'Cache-Control': 'no-cache' })
        return res.end()
      }

      // trailing slashes on directory pages (/docs/ → /docs) collapse into one
      // canonical URL so search engines and links never see duplicate content;
      // the homepage and index.html are handled above.
      if (pathname.length > 1 && pathname.endsWith('/')) {
        const clean = pathname.replace(/\/+$/, '')
        if (await resolveContent(contentDir, clean)) {
          const { site = {} } = state()
          const location = absUrl(site, clean) || `http://${host}:${boundPort}${clean}`
          res.writeHead(301, { Location: location, ...SECURITY_HEADERS, 'Cache-Control': 'no-cache' })
          return res.end()
        }
      }

      const contentFile = await resolveContent(contentDir, pathname)
      if (contentFile) {
        return await servePage(res, url, { file: contentFile })
      }

      // custom 404 page (content/404.md) if the author provided one
      const notFoundFile = join(contentDir, '404.md')
      if (await isFile(notFoundFile)) {
        return await servePage(res, url, { file: notFoundFile, status: 404 })
      }
      notFound(res, url)
    } catch (err) {
      console.error('[jprot]', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Server error: ' + err.message)
      }
    }
  }

  // Runs each incoming request inside an AsyncLocalStorage scope bound to
  // this instance's state snapshot, so concurrent instances never share state.
  const scopedHandler = (req, res) => runScoped(instanceState, () => handleRequest(req, res))

  let server = createServer(scopedHandler)
  let boundPort = port

  return {
    get server() { return server },
    get port() { return boundPort },
    host,
    contentDir,
    publicDir,
    projectRoot,
    reload: () => buildState(true),
    closeWatcher: () => watcher && watcher.close(),
    async listen(portOverride) {
      return new Promise((resolvePromise, reject) => {
        let currentPort = portOverride ?? port
        const tryListen = () => {
          server = createServer(scopedHandler)
          server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
              currentPort += 1
              tryListen()
            } else {
              reject(err)
            }
          })
          server.listen(currentPort, host, () => {
            server.removeListener('error', reject)
            const addr = server.address()
            boundPort = addr && typeof addr === 'object' ? addr.port : currentPort
            resolvePromise(boundPort)
          })
        }
        tryListen()
      })
    },
  }
}

// Homepage is a first-class searchable page: its index.md body plus the whole
// site config (hero, sections props, nav labels, tagline…) so config-driven
// text is captured too. `raw` keeps every byte searchable.
async function homepageSearchEntry(contentDir, site) {
  let md = ''
  try {
    md = parseFrontmatter((await readFile(join(contentDir, 'index.md'), 'utf8'))).body
  } catch { /* no homepage yet — the config text still counts */ }
  const config = JSON.stringify(site || {})
  return {
    title: site.title || 'Home',
    url: '/',
    excerpt: site.description || site.tagline || '',
    tags: [],
    date: '',
    image: '',
    body: stripMarkdown(md + '\n' + config),
    raw: (md + '\n' + config).trim(),
    frontmatter: '',
  }
}

async function serveSearchIndex(res) {
  const { contentDir, site } = state()
  const entries = await indexAll(contentDir)
  entries.unshift(await homepageSearchEntry(contentDir, site))
  sendWithSecurity(res, 200, 'application/json', JSON.stringify(entries))
}

// ISO date (yyyy-mm-dd) of the most recent commit touching `file`, from git.
// Returns null when the project is not a git repo or git is unavailable.
function gitLastCommitDate(file) {
  return new Promise((resolvePromise) => {
    execFile('git', ['log', '-1', '--format=%cI', '--', file], (err, stdout) => {
      if (err || !stdout || !stdout.trim()) return resolvePromise(null)
      const iso = stdout.trim()
      return resolvePromise(/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null)
    })
  })
}

async function contentFilePath(contentDir, entryUrl) {
  if (entryUrl === '/') return join(contentDir, 'index.md')
  return join(contentDir, entryUrl.replace(/^\//, '').replace(/\/$/, '/index') + '.md')
}

// lastmod: last git commit that touched the file (best signal), else mtime.
async function pageLastmod(contentDir, entryUrl) {
  try {
    const p = await contentFilePath(contentDir, entryUrl)
    const gitDate = await gitLastCommitDate(p)
    if (gitDate) return gitDate
    return (await stat(p)).mtime.toISOString().slice(0, 10)
  } catch { return '' }
}

async function serveSitemap(res) {
  const { contentDir, site } = state()
  const entries = await indexAll(contentDir)
  const base = (site.url || '').replace(/\/$/, '')
  const imageNS = ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
  const urls = ['/', ...entries.map((e) => e.url)].map(async (u) => {
    const loc = esc(base + u)
    const lm = await pageLastmod(contentDir, u)
    const priority = u === '/' ? '1.0' : u.split('/').filter(Boolean).length === 1 ? '0.8' : '0.6'
    const entry = u === '/' ? null : entries.find((e) => e.url === u)
    const img = entry && entry.image
      ? `<image:image><image:loc>${esc(/^(https?:|data:)/.test(entry.image) ? entry.image : base + entry.image)}</image:loc></image:image>`
      : ''
    return `  <url><loc>${loc}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}<changefreq>${u === '/' ? 'daily' : 'weekly'}</changefreq><priority>${priority}</priority></url>${img ? '\n  ' + img : ''}`
  })
  const body = await Promise.all(urls)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${imageNS}>
${body.join('\n')}
</urlset>`
  sendWithSecurity(res, 200, 'application/xml', xml)
}

async function serveRobotsTxt(res) {
  const { site } = state()
  const base = (site.url || '').replace(/\/$/, '')
  const sitemap = base ? `\nSitemap: ${base}/sitemap.xml` : ''
  const txt = `# JPROT
User-agent: *
Allow: /
Disallow: /@jprot/
Disallow: /@editor/
Disallow: /feed.xml${sitemap}
`
  sendWithSecurity(res, 200, 'text/plain; charset=utf-8', txt)
}

// llms.txt + llms-full.txt — lightweight machine-readable site indexes consumed
// by LLM/AI crawlers. The index lists every page with a one-line excerpt; the
// full file appends each page's Markdown body for depth.
async function serveLlmsIndex(res, full) {
  const { contentDir, site } = state()
  const entries = await indexAll(contentDir)
  const home = await homepageSearchEntry(contentDir, site)
  const base = (site.url || '').replace(/\/$/, '')
  const name = site.title || 'JPROT'
  const blurb = site.description || site.tagline || ''
  if (full) {
    const parts = [`# ${name}`, '', blurb, '', '## Pages', '']
    // homepage first: index.md body + full config text so nothing is missing
    let homeBody = home.body || ''
    try { homeBody = parseFrontmatter((await readFile(join(contentDir, 'index.md'), 'utf8'))).body.trim() } catch { /* keep config text */ }
    parts.push(`### ${home.title}`, '', `> Source: ${base}/`, '', homeBody || home.body, '')
    for (const e of entries) {
      const file = await contentFilePath(contentDir, e.url)
      let body = ''
      try { body = parseFrontmatter((await readFile(file, 'utf8'))).body } catch { body = '' }
      parts.push(`### ${e.title}`, '', `> Source: ${base + e.url}`, '', body.trim(), '')
    }
    sendWithSecurity(res, 200, 'text/plain; charset=utf-8', parts.join('\n'))
  } else {
    const lines = [`# ${name}`, '', `> ${blurb}`, '', '## Docs', '']
    lines.push(`- [${home.title}](${base}/): ${home.excerpt || blurb}`)
    for (const e of entries) lines.push(`- [${e.title}](${base + e.url}): ${e.excerpt}`)
    sendWithSecurity(res, 200, 'text/plain; charset=utf-8', lines.join('\n'))
  }
}

async function serveFeed(res, url) {
  const { contentDir, site } = state()
  const posts = await listPosts(contentDir)
  const base = (site.url || `http://${url.host}`).replace(/\/$/, '')
  const items = posts.map((p) => {
    const d = p.data.date ? new Date(p.data.date).toUTCString() : new Date().toUTCString()
    const desc = esc(p.data.excerpt || p.excerpt || '')
    return `  <item>
    <title>${esc(p.data.title || p.slug)}</title>
    <link>${esc(base + '/' + p.url)}</link>
    <guid>${esc(base + '/' + p.url)}</guid>
    <pubDate>${d}</pubDate>
    <description>${desc}</description>
  </item>`
  }).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${esc(site.title || 'Blog')}</title>
  <link>${esc(base)}</link>
  <description>${esc(site.description || '')}</description>
  ${items}
</channel>
</rss>`
  sendWithSecurity(res, 200, 'application/rss+xml; charset=utf-8', xml)
}

async function serveManifest(res) {
  const { site } = state()
  const manifest = {
    name: site.title || 'JPROT Portfolio',
    short_name: (site.title || 'JPROT').slice(0, 12),
    description: site.description || site.tagline || '',
    start_url: '/',
    display: 'standalone',
    background_color: site.themeColor || '#4f46e5',
    theme_color: site.themeColor || '#4f46e5',
    icons: site.icon ? [{ src: site.icon, sizes: 'any', type: 'image/svg+xml' }] : [],
  }
  sendWithSecurity(res, 200, 'application/json', JSON.stringify(manifest))
}

async function serveFavicon(res) {
  const { site } = state()
  const initials = (site.title || 'J').slice(0, 2).toUpperCase()
  const bg = site.themeColor || '#4f46e5'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="42" font-family="system-ui,sans-serif" font-size="28" font-weight="bold" fill="#fff" text-anchor="middle">${esc(initials)}</text></svg>`
  sendWithSecurity(res, 200, 'image/svg+xml', svg)
}

/* ============ OG:image auto-generation ============ */

// SVG body used for the auto-generated social image (1200×630, brand colors).
function ogImageSvg(title, description, site) {
  const t = encodeURIComponent((title || site.title || 'JPROT').slice(0, 40))
  const d = encodeURIComponent((description || '').slice(0, 80))
  // raw colors — the caller encodes the whole URI once
  const bg = site.ogColor || '#4f46e5'
  const fg = site.ogTextColor || '#ffffff'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="${bg}"/><text x="600" y="260" font-family="system-ui,sans-serif" font-size="56" font-weight="bold" fill="${fg}" text-anchor="middle">${t}</text>${d ? `<text x="600" y="340" font-family="system-ui,sans-serif" font-size="28" fill="${fg}" opacity="0.8" text-anchor="middle">${d}</text>` : ''}<text x="600" y="500" font-family="system-ui,sans-serif" font-size="22" fill="${fg}" opacity="0.5" text-anchor="middle">Built with JPROT</text></svg>`
}

// Resolve the og:image for a page: explicit site.ogImage > page `image` >
// generated SVG. Generated images are written once to <root>/.cache/og/<sha>.svg
// and served as a real file (crawlable, cacheable, tiny <head>) instead of an
// inline data: URI. Falls back to a data URI only outside a project root
// (standalone renderPage calls). Returns { url, w, h }.
async function ogImageFor({ site, page, title, desc }) {
  if (site.ogImage) return { url: site.ogImage, w: null, h: null }
  if (page.data.image) return { url: absUrl(site, page.data.image), w: null, h: null }
  const svg = ogImageSvg(title, desc, site)
  const { projectRoot } = state()
  if (projectRoot) {
    try {
      const dir = join(projectRoot, '.cache', 'og')
      const hash = createHash('sha256').update(svg).digest('hex').slice(0, 16)
      const file = join(dir, hash + '.svg')
      try { await stat(file) } catch {
        await mkdir(dir, { recursive: true })
        await writeFile(file, svg, 'utf8')
      }
      return { url: '/@jprot/og/' + hash + '.svg', w: 1200, h: 630 }
    } catch { /* fall through to a data URI */ }
  }
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, w: 1200, h: 630 }
}

// Serves a generated OG image from <root>/.cache/og — path-guarded, cached.
async function serveOgImage(req, res, pathname) {
  const { projectRoot } = state()
  const name = pathname.replace(/^\/@jprot\/og\//, '')
  if (!/^[0-9a-f]{16}\.svg$/.test(name) || !projectRoot) return notFound(res, null)
  const file = join(projectRoot, '.cache', 'og', name)
  if (!isInside(join(projectRoot, '.cache', 'og'), file)) return notFound(res, null)
  return serveFile(req, res, file, true)
}

/* ============ JSON-LD structured data ============ */

// Resolve a path to an absolute URL using the site base; already-absolute
// URLs (https:, data:, mailto:) pass through untouched.
// Strip HTML to plain text for JSON-LD articleBody (full page copy for SEO).
function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function generateJsonLd({ site, page, title, desc, ogType, pageUrl, canonical, image, layout, isHome, isPost, articleBody }) {
  const pageUrlNorm = pageUrl === '/' ? '' : pageUrl
  const absPage = absUrl(site, pageUrl || '/')
  const nodes = []

  // Site/Organization node (present on every page for a stable entity).
  const org = {
    '@type': 'Organization',
    name: site.title || title,
    url: absUrl(site, '/'),
    description: desc,
  }
  if (site.logo || site.hero?.avatar) org.logo = absUrl(site, site.logo || site.hero.avatar)
  if (site.email) org.email = site.email
  if (site.sameAs || Array.isArray(site.social)) org.sameAs = (site.sameAs || site.social).map((s) => (typeof s === 'string' ? s : s.url)).filter(Boolean)
  if (site.searchUrl) org.potentialAction = {
    '@type': 'SearchAction',
    target: absUrl(site, site.searchUrl),
    'query-input': 'required name=search_term_string',
  }
  nodes.push(org)

  // Article / BlogPosting for posts; Person for a resume; WebPage otherwise.
  if (ogType === 'article') {
    const art = {
      '@context': 'https://schema.org',
      '@type': isPost ? 'BlogPosting' : 'Article',
      headline: page.data.title || title,
      description: desc,
      articleBody: articleBody || undefined,
      url: absPage,
      mainEntityOfPage: { '@type': 'WebPage', '@id': absPage },
      image: image || undefined,
      datePublished: page.data.date || undefined,
      dateModified: page.data.lastmod || page.data.date || undefined,
      inLanguage: site.lang || 'en',
      author: { '@type': 'Person', name: page.data.author || site.author || site.title },
    }
    if (page.data.tags && page.data.tags.length) art.keywords = page.data.tags.join(', ')
    if (site.title) art.publisher = { '@type': 'Organization', name: site.title, url: absUrl(site, '/') }
    nodes.push(art)
  } else if (layout === 'resume' || page.data.layout === 'resume') {
    const person = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: page.data.title || site.title,
      url: absPage,
      description: desc,
      image: image || undefined,
    }
    if (site.email) person.email = site.email
    const sameAs = (site.sameAs || site.social || []).map((s) => (typeof s === 'string' ? s : s.url)).filter(Boolean)
    if (sameAs.length) person.sameAs = sameAs
    nodes.push(person)
  } else {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description: desc,
      url: absPage,
      inLanguage: site.lang || 'en',
      image: image || undefined,
    })
  }

  // BreadcrumbList on every non-home page: Home › Current page.
  if (!isHome) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: site.title || 'Home', item: absUrl(site, '/') || undefined },
        { '@type': 'ListItem', position: 2, name: page.data.title || title, item: absPage || undefined },
      ],
    })
  }
  return nodes
}

/* ============ Scroll animation script ============ */

const scrollAnimScript = (nonce) => `
<script nonce="${nonce}">
(function () {
  if (!window.IntersectionObserver) return
  function init() {
    var targets = document.querySelectorAll('[data-animate], [data-stagger]')
    if (!targets.length) return
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target) }
      })
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' })
    targets.forEach(function (el) { observer.observe(el) })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
</script>
`

/* ============ page rendering ============ */

async function isFile(path) {
  try { return (await stat(path)).isFile() } catch { return false }
}

async function servePage(res, url, { home, file, status } = {}) {
  const { contentDir, site, markdown, nav, projectsDir } = state()
  let page
  let projects
  if (home) {
    const idx = join(contentDir, 'index.md')
    try {
      const parsed = await readParsed(idx)
      reportFrontmatterDiagnostics(idx, parsed.diagnostics)
      const { data, body } = parsed
      page = { data, body, path: 'index.md', slug: 'index', url: '/' }
    } catch {
      page = { data: {}, body: '', path: 'index.md', slug: 'index', url: '/' }
    }
    projects = await listProjects(contentDir, projectsDir)
  } else {
    const parsed = await readParsed(file)
    reportFrontmatterDiagnostics(file, parsed.diagnostics)
    const { data, body } = parsed
    const slug = basename(file, '.md')
    page = { data, body, path: file, slug, src: file, url: url.pathname }
    projects = await listProjects(contentDir, projectsDir)
  }

  function reportFrontmatterDiagnostics(file, diagnostics = []) {
    for (const diagnostic of diagnostics) {
      console.warn(`[jprot] ${file}:${diagnostic.line} ${diagnostic.message}`)
    }
  }

  // drafts are visible in dev (author preview) but hidden in production/export
  if (page.data.draft && inProdMode()) {
    return notFound(res, url)
  }

  const posts = await listPosts(contentDir)
  const headings = []
  const shortcodeProps = { site, page, nav, projects, posts }
  const content = await renderDocumentBody(page.body, markdown, state().components || {}, shortcodeProps, headings)
  page.headings = headings
  const isHomeIndex = home || page.slug === 'index' || page.data.layout === 'home'
  const { theme } = state()
  const layout = (page.data.layout && page.data.layout !== 'home')
    ? page.data.layout
    : isHomeIndex
      ? (site.homeLayout || theme.defaultHome || 'Home')
      : (site.defaultLayout || theme.defaultPage || 'Page')
  const nonce = newNonce()
  const html = await renderPage({ page, content, projects, site, nav, layout, posts, home: isHomeIndex, docsNav: state().docsNav, nonce })
  // The built-in contact form posts anywhere (e.g. Formspree); loosen the CSP
  // connect source for that HTTPS endpoint so the form actually submits.
  const formEndpoint = site.formspree || site.form
  const extraConnectSrc = formEndpoint && /^https:\/\//.test(String(formEndpoint))
    ? [String(formEndpoint).split('/').slice(0, 3).join('/')]
    : []
  sendWithSecurity(res, status || 200, 'text/html; charset=utf-8', html, nonce, { extraConnectSrc })
}

export async function renderPage({ page, content, projects, site, nav, layout, posts = [], home, nonce = newNonce(), docsNav = [] }) {
  const { components = {} } = state()
  const Layout = components.Layout || ((p) => `<div>${p.content}</div>`)
  const Header = components.Header || (() => '')
  const Footer = components.Footer || (() => '')

  // Normalize for standalone use so a minimal call never throws.
  page = page || { data: {} }
  page.data = page.data || {}
  site = site || {}
  projects = projects || []
  nav = nav || []
  const isHome = home === true || layout === 'Home'
  const sectionList = isHome
    ? [...(site.sections || []), ...(page.data.sections || [])]
    : [...(page.data.sections || [])]
  const sectionsHtml = await renderSections({ site, page, nav, projects, posts, sections: sectionList, components })

  const layoutComp = (layout && (components[layout] || components[layout[0].toUpperCase() + layout.slice(1)])) ||
    components.Page || ((p) => `<article>${p.content}</article>`)
  const inner = await layoutComp({ page, content, projects, site, nav, docsNav, posts, sectionsHtml })

  const props = { site, page, nav, docsNav, content: inner, projects, posts, sectionsHtml }
  const headerHtml = await Header(props)
  const footerHtml = await Footer(props)

  // Sidebar: opt-in per page or site-wide. Shows on the default page layout
  // (or any layout when site.sidebar/toggle or page.data.sidebar says so),
  // never on the homepage or blog listings.
  let sidebarHtml = ''
  const { theme = {} } = state()
  const isDefaultPage = layout === (site.defaultLayout || theme.defaultPage || 'Page')
  const sidebarOn = site.sidebar === true || page.data.sidebar === true
  const showSidebar = site.sidebar !== false && page.data.sidebar !== false &&
    !isHome && layout !== 'blog' && (isDefaultPage || sidebarOn)
  if (showSidebar && components.Sidebar) {
    sidebarHtml = await components.Sidebar(props)
  }

  const bodyHtml = await Layout({ ...props, header: headerHtml, footer: footerHtml, sidebar: sidebarHtml })


  const title = [page.data.title, site.title].filter(Boolean).join(' — ')
  const cssLinks = await collectCss()
  const desc = page.data.description || page.data.subtitle || page.data.excerpt || site.description || site.tagline || ''
  const pageUrl = page.url || '/'
  const blogDir = site.blogDir || 'blog'
  const isPost = typeof pageUrl === 'string' && pageUrl.startsWith('/' + blogDir + '/')
  const ogType = page.data.layout === 'blog' || isPost ? 'article' : 'website'

  // SEO essentials ---------------------------------------------------------
  // canonical: frontmatter override > site.url + path; og:url follows it.
  const canonical = page.data.canonical
    ? absUrl(site, page.data.canonical)
    : absUrl(site, pageUrl)
  const canonicalMeta = canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''
  // og:image — explicit site.ogImage/page `image`, else a generated file
  const ogInfo = await ogImageFor({ site, page, title, desc })
  const ogImage = ogInfo.url
  const ogImageDims = ogInfo.w && ogInfo.h
    ? `  <meta property="og:image:width" content="${ogInfo.w}">\n  <meta property="og:image:height" content="${ogInfo.h}">`
    : ''
  // robots — opt-out per page via `noindex: true`
  const robotsMeta = page.data.noindex
    ? '<meta name="robots" content="noindex,nofollow">'
    : '<meta name="robots" content="index,follow">'
  const hreflangs = Array.isArray(site.alternateLangs) && site.alternateLangs.length
    ? '\n  ' + site.alternateLangs.map((l) =>
        `<link rel="alternate" hreflang="${esc(l.lang || '')}" href="${esc(absUrl(site, l.url || ''))}">`).join('\n  ')
    : ''
  const twitterSite = site.twitter ? `\n  <meta name="twitter:site" content="${esc(site.twitter)}">` : ''
  const ogLocale = site.ogLocale || site.lang || 'en'
  const ogLogo = site.logo ? `\n  <meta property="og:logo" content="${esc(absUrl(site, site.logo))}">` : ''

  const jsonLd = generateJsonLd({ site, page, title, desc, ogType, pageUrl, canonical, image: absUrl(site, ogImage), layout, isHome, isPost, articleBody: ogType === 'article' ? htmlToText(content) : undefined })

  return `<!DOCTYPE html>
<html lang="${esc(site.lang || 'en')}" dir="${esc(site.dir || 'ltr')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="generator" content="JPROT">
  ${robotsMeta}
  ${canonicalMeta}
  ${hreflangs}
  <meta property="og:type" content="${ogType}">
  <meta property="og:locale" content="${esc(ogLocale)}">
  <meta property="og:site_name" content="${esc(site.title || '')}">
  <meta property="og:title" content="${esc(page.data.title || site.title || '')}">
  <meta property="og:description" content="${esc(desc)}">
  ${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
  ${ogImageDims}
  ${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
  ${ogLogo}
  <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${esc(page.data.title || site.title || '')}">
  <meta name="twitter:description" content="${esc(desc)}">
  ${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">\n  <meta name="twitter:image:alt" content="${esc(title)}">` : ''}${twitterSite}
  <link rel="alternate" type="application/rss+xml" title="${esc(site.title || 'Blog')}" href="/feed.xml">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="${esc(site.themeColor || '#4f46e5')}">
  <style>
    :where(main > section) { content-visibility: auto; contain-intrinsic-size: auto 800px; }
  </style>
  ${cssLinks}
  ${themeScript(nonce, site.themes)}
  ${site.head || ''}
</head>
<body>
${bodyHtml}
${scrollAnimScript(nonce)}
${spaScript(nonce)}
${searchScript(site.labels || {}, nonce)}
${jsonLd ? `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(jsonLd)}</script>` : ''}
</body>
</html>`
}

const themeScript = (nonce, configuredThemes) => {
  const ids = Array.isArray(configuredThemes) && configuredThemes.length
    ? configuredThemes.map((theme) => typeof theme === 'string' ? theme : theme.id).filter(Boolean)
    : ['default', 'minimal', 'creative', 'corporate']
  return `
<script nonce="${nonce}">
/* JPROT theme toggle — light / dark, persisted locally */
(function () {
  var KEY = 'jprot-theme'
  var root = document.documentElement
  var saved = null
  try { saved = localStorage.getItem(KEY) } catch (e) {}
  if (saved === 'dark' || (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    root.setAttribute('data-theme', 'dark')
  }
  window.jprotToggleTheme = function () {
    var dark = root.getAttribute('data-theme') === 'dark'
    root.setAttribute('data-theme', dark ? 'light' : 'dark')
    try { localStorage.setItem(KEY, dark ? 'light' : 'dark') } catch (e) {}
  }

  /* JPROT variant cycle — cycles through theme variants (default → minimal → creative → corporate) */
  var VARIANTS = ${JSON.stringify(ids)}
  var VKEY = 'jprot-variant'
  try {
    var sv = localStorage.getItem(VKEY)
    if (sv && sv !== 'default') root.setAttribute('data-variant', sv)
  } catch (e) {}
  window.jprotCycleVariant = function () {
    var cur = root.getAttribute('data-variant') || 'default'
    var idx = VARIANTS.indexOf(cur)
    var next = VARIANTS[(idx + 1) % VARIANTS.length]
    if (next === 'default') root.removeAttribute('data-variant')
    else root.setAttribute('data-variant', next)
    try { localStorage.setItem(VKEY, next) } catch (e) {}
  }

  // Event delegation for data-action buttons (keeps strict CSP: no inline JS).
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-action]')
    if (btn) {
      var action = btn.getAttribute('data-action')
      if (action === 'toggle-theme') window.jprotToggleTheme()
      else if (action === 'cycle-variant') window.jprotCycleVariant()
      else if (action === 'search') window.jprotSearch && window.jprotSearch()
      else if (action === 'print') window.print()
      else if (action === 'toggle-nav') {
        var hdr = document.querySelector('.site-header')
        if (hdr) hdr.classList.toggle('nav-open')
        btn.setAttribute('aria-expanded', hdr ? hdr.classList.contains('nav-open') : 'false')
      }
      else if (action === 'copy-code') {
        var code = btn.parentElement && btn.parentElement.querySelector('code')
        if (code && navigator.clipboard) {
          navigator.clipboard.writeText(code.textContent).then(function () {
            var old = btn.textContent
            btn.textContent = 'Copied'
            setTimeout(function () { btn.textContent = old }, 1200)
          })
        }
      }
      return
    }
    // theme picker swatches
    var sw = e.target.closest && e.target.closest('.tp-swatch')
    if (sw) {
      var id = sw.getAttribute('data-variant')
      var picker = sw.closest('.theme-picker')
      if (picker) picker.querySelectorAll('.tp-swatch').forEach(function (b) { b.classList.remove('active') })
      sw.classList.add('active')
      if (id === 'default') root.removeAttribute('data-variant')
      else root.setAttribute('data-variant', id)
      try { localStorage.setItem(VKEY, id) } catch (e2) {}
    }
  })

  // Mobile menu: close after picking a link, clicking outside, or hitting Escape.
  function closeNav() {
    var hdr = document.querySelector('.site-header')
    if (!hdr) return
    hdr.classList.remove('nav-open')
    var t = hdr.querySelector('.nav-toggle')
    if (t) t.setAttribute('aria-expanded', 'false')
  }
  document.addEventListener('click', function (e) {
    if (!e.target) return
    var inHeader = e.target.closest && e.target.closest('.site-header')
    if (inHeader) {
      if (e.target.closest && e.target.closest('.site-nav a')) closeNav()
      return
    }
    closeNav()
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav()
  })

  // hydrate the theme picker's active swatch on load
  function hydratePicker() {
    var picker = document.querySelector('.theme-picker')
    if (!picker) return
    var saved = null
    try { saved = localStorage.getItem(VKEY) } catch (e) {}
    if (saved && saved !== 'default') {
      picker.querySelectorAll('.tp-swatch').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-variant') === saved)
      })
    } else {
      picker.querySelectorAll('.tp-swatch').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-variant') === 'default')
      })
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydratePicker)
  else hydratePicker()
})()
</script>
 `
 }

function searchScript(labels, nonce) {
  const placeholder = labels.searchPlaceholder || 'Search pages, posts, tags...'
  const empty = labels.searchEmpty || 'No results'
  return `
<script nonce="${nonce}">
/* JPROT instant search — indexes /@jprot/search.json, opens via jprotSearch() */
(function () {
  if (!window.fetch) return
  var overlay = null
  var input = null
  var list = null
  var index = null

  function ensure() {
    if (overlay) return
    overlay = document.createElement('div')
    overlay.className = 'search-overlay'
    overlay.innerHTML = [
      '<div class="search-box">',
      '<div class="search-header">',
      '<input class="search-input" type="search" placeholder="' + ${JSON.stringify(placeholder)} + '" autocomplete="off">',
      '<button class="search-close" type="button" aria-label="Close">&times;</button>',
      '</div>',
      '<div class="search-results"></div>',
      '</div>',
    ].join('')
    document.body.appendChild(overlay)
    input = overlay.querySelector('.search-input')
    list = overlay.querySelector('.search-results')
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close() })
    overlay.querySelector('.search-close').addEventListener('click', close)
    input.addEventListener('input', function () { render(input.value) })
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var rows = list.querySelectorAll('a')
        if (!rows.length) return
        var idx = findFocus()
        if (e.key === 'ArrowDown') idx = (idx + 1) % rows.length
        else idx = (idx - 1 + rows.length) % rows.length
        e.preventDefault()
        var next = rows[idx]
        rows.forEach(function (a) { a.removeAttribute('data-active') })
        next.setAttribute('data-active', '')
        next.scrollIntoView({ block: 'nearest' })
        return
      }
      if (e.key === 'Enter') {
        var a = list.querySelector('a[data-active]') || list.querySelector('a')
        if (a) { e.preventDefault(); openLink(a) }
      }
    })
  }

  function close() {
    if (overlay) { overlay.classList.remove('open'); input.value = '' }
  }

  function openLink(a) {
    var href = a.getAttribute('href')
    close()
    if (href) window.location.href = href // full nav to avoid SPA edge cases from modal
  }

  function norm(s) { return String(s || '').toLowerCase() }
  function reEsc(q) { return q.replace(/[.*+?^()|[\]\\{}$]/g, '\\$&') }
  function hl(s, q) {
    if (!s) return ''
    var e = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    if (!q) return e
    return e.replace(new RegExp('(' + reEsc(q) + ')', 'ig'), '<mark>$1</mark>')
  }
  function around(s, q) {
    var str = String(s || '')
    var i = norm(str).indexOf(q)
    if (i === -1) return str.slice(0, 160)
    var start = Math.max(0, i - 70)
    return (start ? '…' : '') + str.slice(start, i + q.length + 90) + (start + 160 < str.length ? '…' : '')
  }
  function findFocus() {
    var idx = -1
    list.querySelectorAll('a').forEach(function (a, i) { if (a.hasAttribute('data-active')) idx = i })
    return idx
  }

  function render(q) {
    q = norm(q)
    if (!q) { list.innerHTML = ''; return }
    var data = index || []
    var found = []
    for (var i = 0; i < data.length; i++) {
      var e = data[i]
      // every field is searchable: title, url, date, tags, full body and all
      // frontmatter — plus the unprocessed raw source so fence markers, link
      // URLs and syntax that got stripped still count
      var hay = [norm(e.title), norm(e.excerpt), norm(e.url), norm(e.date), norm(e.body), norm(e.frontmatter), norm(e.raw)]
      var tags = e.tags || []
      for (var t = 0; t < tags.length; t++) hay.push(norm(tags[t]))
      var hit = false
      for (var j = 0; j < hay.length; j++) { if (hay[j].indexOf(q) !== -1) { hit = true; break } }
      if (hit) {
        found.push(e)
        if (found.length >= 12) break
      }
    }
    if (!found.length) { list.innerHTML = '<div class="search-empty">' + ${JSON.stringify(empty)} + '</div>'; return }
    list.innerHTML = found.map(function (e) {
      var title = hl(e.title, q)
      var snippet = ''
      if (e.body && norm(e.body).indexOf(q) !== -1) snippet = hl(around(e.body, q), q)
      else if (e.raw && norm(e.raw).indexOf(q) !== -1) snippet = hl(around(e.raw, q), q)
      else if (e.frontmatter && norm(e.frontmatter).indexOf(q) !== -1) snippet = hl('Config: ' + around(e.frontmatter, q), q)
      if (!snippet && e.excerpt) snippet = hl(e.excerpt, q)
      var tag = (e.tags && e.tags.length) ? '<span class="search-tags">' + e.tags.map(function (t) { return '<span>' + hl(t, q) + '</span>' }).join('') + '</span>' : ''
      var excerpt = snippet ? '<span class="search-excerpt">' + snippet + '</span>' : ''
      return '<a href="' + e.url + '" class="search-result"><span class="search-title">' + title + '</span>' + excerpt + tag + '</a>'
    }).join('')
  }

  window.jprotSearch = async function () {
    ensure()
    overlay.classList.add('open')
    input.focus()
    if (index === null) {
      try {
        const res = await fetch('/@jprot/search.json')
        index = (await res.json()) || []
        render(input.value)
      } catch {
        index = []
      }
    } else {
      render(input.value)
    }
  }
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); window.jprotSearch() }
  })
})()
</script>
`
}

const spaScript = (nonce) => `
<script nonce="${nonce}">
/* JPROT SPA navigation — no full page reload on internal links */
(function () {
  if (!window.history || !window.fetch) return

  var scrollMap = {}

  function isSameOrigin(url) {
    return url.origin === window.location.origin
  }

  function pathOf(url) {
    return new URL(url, window.location.href).pathname
  }

  function setActiveLink() {
    var path = window.location.pathname
    document.querySelectorAll('.site-nav a[href], .sb-link[href]').forEach(function (a) {
      var href = a.getAttribute('href') || ''
      var hrefPath = href.split('#')[0].replace(/\\/$/, '')
      var cur = path.replace(/\\/$/, '')
      var active = hrefPath === cur || (hrefPath !== '/' && cur.startsWith(hrefPath))
      a.classList.toggle('active', active)
    })
  }

  function scrollToHash(hash) {
    if (!hash) return
    var el = document.getElementById(hash.replace('#', ''))
    if (el) el.scrollIntoView()
  }

  function applyScroll(url, restore) {
    if (restore) {
      var saved = scrollMap[pathOf(url)]
      window.scrollTo(0, saved || 0)
      scrollToHash(new URL(url, window.location.href).hash)
    } else {
      window.scrollTo(0, 0)
    }
  }

  async function loadPage(url, push, restore) {
    try {
      const res = await fetch(url, { headers: { 'X-JPROT-SPA': '1' } })
      if (!res.ok) { window.location.href = url; return }
      const html = await res.text()
      // res.url is the final URL after any redirect (e.g. .md → clean URL),
      // so the address bar, history and scroll map agree with what was served
      var finalUrl = new URL(res.url || url, window.location.href).href
      var doc = new DOMParser().parseFromString(html, 'text/html')
      var nextMain = doc.querySelector('main')
      var curMain = document.querySelector('main')
      if (nextMain && curMain) {
        curMain.outerHTML = nextMain.outerHTML
      }
      document.title = doc.title || document.title
      if (push) { history.pushState({ path: finalUrl }, '', finalUrl) }
      setActiveLink()
      applyScroll(finalUrl, restore)
    } catch {
      window.location.href = url
    }
  }

  document.addEventListener('click', function (e) {
    var target = e.target.closest ? e.target.closest('a[href]') : null
    if (!target) return
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (target.hasAttribute('download') || target.target === '_blank') return

    var url = new URL(target.href, window.location.href)
    if (!isSameOrigin(url)) return

    // same page with an anchor: just scroll to the element
    if (pathOf(url.href) === pathOf(window.location.href)) {
      if (url.hash) {
        e.preventDefault()
        scrollToHash(url.hash)
        history.replaceState({ path: url.href }, '', url.href)
      }
      return
    }

    // remember where we were, so Back restores this position
    scrollMap[window.location.pathname] = window.scrollY

    e.preventDefault()
    loadPage(url.href, true, false)
  })

  window.addEventListener('popstate', function () {
    loadPage(window.location.href, false, true)
  })

  // mobile sidebar toggle
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.sidebar-toggle') : null
    if (!btn) return
    e.preventDefault()
    document.querySelector('.sidebar-layout')?.classList.toggle('sidebar-open')
  })

  // project filter buttons (strict-CSP friendly: no inline scripts)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-filter]') : null
    if (!btn) return
    var f = btn.getAttribute('data-filter')
    document.querySelectorAll('.filter-btn').forEach(function (b) {
      b.classList.toggle('active', b === btn)
    })
    var showAll = f === '*'
    document.querySelectorAll('.project-card').forEach(function (card) {
      var tags = card.getAttribute('data-tags') || ''
      card.style.display = (showAll || tags.split(' ').includes('tag-' + f)) ? '' : 'none'
    })
  })

  // contact form submit via fetch (strict-CSP friendly: no inline scripts)
  document.addEventListener('submit', function (e) {
    var form = e.target.closest ? e.target.closest('.contact-form') : null
    if (!form) return
    e.preventDefault()
    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'Accept': 'application/json' }
    }).then(function (r) {
      if (r.ok) {
        form.style.display = 'none'
        document.querySelector('.contact-success').style.display = 'block'
      }
    }).catch(function () {})
  })

  // scrollspy: highlight the sidebar link of the section in view
  function updateSpy() {
    var anchors = Array.from(document.querySelectorAll('.sb-anchor[href^="#"]'))
    if (!anchors.length) return
    var pos = window.scrollY + 120
    var current = null
    for (var i = 0; i < anchors.length; i++) {
      var el = document.getElementById(anchors[i].getAttribute('href').slice(1))
      if (el && el.offsetTop <= pos) current = anchors[i]
    }
    anchors.forEach(function (a) { a.classList.toggle('active', a === current) })
  }
  var spyTimer = null
  window.addEventListener('scroll', function () {
    clearTimeout(spyTimer)
    spyTimer = setTimeout(updateSpy, 80)
  })
  setTimeout(updateSpy, 200)

  setActiveLink()
})()
</script>
`

async function collectCss() {
  const { cssRegistry } = state()
  // no theme resolved (standalone render call with no built instance) → no links
  if (!cssRegistry || !cssRegistry.size) return ''
  const lines = []
  for (const sha of cssRegistry.keys()) {
    const href = `/@jprot/css/${sha}.css`
    lines.push(`<link rel="preload" as="style" href="${href}">`)
    lines.push(`<link rel="stylesheet" href="${href}">`)
  }
  return lines.join('\n  ')
}

/* ============ static/file serving ============ */

async function serveFile(req, res, file, fingerprinted = false) {
  let st
  try { st = await stat(file) } catch {
    return notFound(res, null)
  }
  if (!st.isFile()) return notFound(res, null)
  const mime = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
  const body = await readFile(file)
  const tag = etagOf(body)
  if (req && req.headers['if-none-match'] === tag) {
    res.writeHead(304, { ETag: tag, 'Cache-Control': cacheControlFor(fingerprinted), ...SECURITY_HEADERS })
    return res.end()
  }
  sendWithSecurity(res, 200, mime, body, '', { etag: tag, cache: cacheControlFor(fingerprinted) })
}

async function serveThemeCss(req, res, pathname) {
  const url = new URL(req.url, 'http://x')
  // hash-based: /@jprot/css/<sha>.css — the URL used by every rendered page
  const m = pathname.match(/^\/@jprot\/css\/([0-9a-f]{16})\.css$/)
  if (m) {
    const { cssRegistry } = state()
    const file = cssRegistry && cssRegistry.get(m[1])
    if (file) return serveFile(req, res, file, true)
    return notFound(res, url)
  }
  // legacy: ?f=(absolute path inside the theme dir) — kept for compatibility
  const p = url.searchParams.get('f')
  if (p) {
    return serveCssFromTrustedDir(req, res, url, p, 'theme')
  }
  notFound(res, url)
}

async function serveCss(req, res, url) {
  const p = url.searchParams.get('p')
  if (p) {
    return serveCssFromTrustedDir(req, res, url, p)
  }
  notFound(res, url)
}

// Security: only ever serve stylesheets from inside the theme directories.
// Never an arbitrary file from disk (guards against path-traversal reads).
async function serveCssFromTrustedDir(req, res, url, file, kind) {
  const { themeDir, userThemeDir } = state()
  const roots = [themeDir, userThemeDir]
  const within = roots.some((root) => isInside(root, file))
  if (!within || extname(file).toLowerCase() !== '.css' || !(await isFile(file))) {
    return notFound(res, url)
  }
  return serveFile(req, res, file, url.searchParams.has('v'))
}

function notFound(res, url) {
  const { site, labels } = state()
  const p = url ? esc(url.pathname) : ''
  const brand = site.title || 'JPROT'
  const title = (labels && labels.pageNotFound) || 'Page not found'
  const back = (labels && labels.backToHome) || 'Back to'
  const bg = site.themeColor || 'var(--color-accent, #4f46e5)'
  const html = `<!DOCTYPE html>
<html lang="${esc(site.lang || 'en')}" dir="${esc(site.dir || 'ltr')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 — ${esc(brand)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      min-height: 100vh; display: grid; place-items: center;
      background: ${esc(site.lang === 'ar' ? '#fff' : '#ffffff')};
      color: #1a1a1a; text-align: center; padding: 2rem;
    }
    .nf { max-width: 34rem; }
    .nf-code { font-size: 5rem; font-weight: 900; margin: 0; letter-spacing: -0.04em; color: ${bg}; }
    .nf-title { font-size: 1.3rem; margin: 0.5rem 0 0.75rem; }
    .nf-path { color: #6b7280; font-family: ui-monospace, monospace; font-size: 0.9rem; }
    .nf a {
      display: inline-block; margin-top: 1.5rem; padding: 0.7rem 1.4rem; border-radius: 12px;
      background: ${bg}; color: #fff; text-decoration: none; font-weight: 600;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .nf a:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(79,70,229,0.3); }
  </style>
</head>
<body>
  <div class="nf">
    <p class="nf-code">404</p>
    <h1 class="nf-title">${esc(title)}</h1>
    <p class="nf-path">${p}</p>
    <a href="/">${esc(back)} ${esc(brand)}</a>
  </div>
</body>
</html>`
  const nonce = newNonce()
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP(nonce), ...SECURITY_HEADERS, 'Cache-Control': 'no-cache' })
  res.end(html)
}

// Allows running this file directly: node core/server.js (spawns the CLI as
// a child to avoid a circular ESM import between the two entry points).
function isMainModule() {
  const argv1 = process.argv[1]
  if (!argv1) return false
  try {
    return import.meta.url === pathToFileURL(resolve(realpathSync(argv1))).href
  } catch {
    return false
  }
}

if (isMainModule()) {
  const { spawn } = await import('node:child_process')
  const cli = fileURLToPath(new URL('./cli.js', import.meta.url))
  const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}
