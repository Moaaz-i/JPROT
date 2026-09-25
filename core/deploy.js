// Deployment targets: everything about "where does this site actually live".
//
// `core/export.js` answers *what* gets written; this module answers *under which
// prefix*. Keeping the two apart means the prefixing rules are testable on
// their own, reusable by a future CDN/upload target, and honest about why each
// rewrite exists.
//
// A "base path" is the sub-path a site is served from — `/JPROT` for a GitHub
// Pages project site, `''` for a root domain. The dev server always serves from
// `/`, so the base path only ever appears in exported output: every href, src,
// canonical URL, feed item, sitemap entry and search result has to grow the
// prefix or the deployed site 404s on itself.
import { loadSiteConfig } from './config.js'

/** Normalize user input into a canonical base path: `''` or `/segment`. */
export function normalizeBasePath(value) {
  if (!value) return ''
  const path = String(value).trim()
  if (!path || path === '/') return ''
  return '/' + path.replace(/^\/+|\/+$/g, '')
}

/**
 * The absolute site URL a deployment should advertise, i.e. `site.url` with the
 * base path folded in. The server generates sitemap/feed/llms/robots/canonical
 * tags from this, so the export must run with the deployment-correct value
 * rather than whatever the author left in the config.
 */
export function deployUrlFor(config, basePath) {
  const base = String(config.url || '').replace(/\/+$/, '')
  const path = basePath.replace(/^\/+|\/+$/g, '')
  if (!base || !path) return base
  return base.endsWith('/' + path) ? base : base + '/' + path
}

/**
 * Build the rewriter for one deployment target.
 *
 * @param {object} options
 * @param {string} [options.basePath]   sub-path prefix, `''` for a root domain
 * @param {Iterable<string>} [options.pageUrls] exported page URLs, used to tell
 *        a real page link from a plain file path (see `rewriteHtml`)
 * @returns {{basePath: string, url: string, rewriteHtml: Function,
 *           rewriteSearchIndex: Function, rewriteManifest: Function}}
 */
export function createDeployment({ basePath, pageUrls } = {}) {
  const base = normalizeBasePath(basePath)
  const pageUrlSet = pageUrls instanceof Set ? pageUrls : new Set(pageUrls || [])

  // Exported pages are directories (`docs/index.html`), so a link to a page
  // must keep its trailing slash or the static host 404s. The homepage does
  // not, and neither do plain files.
  const withPageSlash = (value) => {
    const match = value.match(/^([^?#]*)([?#].*)?$/)
    if (!match) return value
    const path = match[1]
    if (!pageUrlSet.has(path) || path === '/') return value
    return path.replace(/\/?$/, '/') + (match[2] || '')
  }

  const rewriteAttribute = (match, name, value, currentUrl) => {
    if (value.includes("' + ") || value.includes('" + ')) return match
    // Already prefixed: rewriting twice would produce `/repo/repo/…`. Cheap
    // insurance, because the rewriter is exported and callers compose it.
    if (base && (value === base || value.startsWith(base + '/') || value.startsWith(base + '?'))) return match
    // Header links historically normalize external URLs to `/https://...`.
    // Restore those values before applying the project base path.
    if (/^\/(?:https?:|mailto:|tel:|data:)/i.test(value)) {
      return `${name}="${value.slice(1)}"`
    }
    if (name === 'href' && value && !value.startsWith('/') && !value.startsWith('#') &&
        !/^(?:https?:|mailto:|tel:|data:|javascript:|vbscript:)/i.test(value)) {
      const baseUrl = currentUrl.endsWith('/') ? currentUrl : currentUrl + '/'
      const resolved = new URL(value, `http://jprot.local${baseUrl}`).pathname
      // Documentation links commonly use `content` as a site page name.
      // Prefer the actual exported root page when the browser-relative path
      // does not exist, preventing `/getting-started/content` 404s.
      const rootCandidate = '/' + value.replace(/^(\.\/|\.\.\/)+/, '').replace(/^\/+/, '')
      const rootRelative = pageUrlSet.has(resolved) ? resolved : rootCandidate
      const path = withPageSlash(rootRelative)
      return `${name}="${base}${path}"`
    }
    if (!value.startsWith('/') || value.startsWith('//')) return match
    const path = withPageSlash(value)
    return `${name}="${base}${path}"`
  }

  return {
    basePath: base,

    /** The deployment-correct absolute URL for a config's `site.url`. */
    url: (config) => deployUrlFor(config, base),

    /**
     * The same deployment, re-scoped to a known set of exported pages. The
     * export learns its page list from the running server (search.json), which
     * is only available after the server has already been configured with
     * `exportConfig`.
     */
    withPages(pages) {
      return createDeployment({ basePath: base, pageUrls: pages })
    },

    /**
     * Prefix every same-origin URL in a page so the exported site works under
     * the deployment sub-path. A no-op when the base path is empty.
     *
     * @param {string} html
     * @param {string} [currentUrl] the page's own URL, so relative hrefs
     *        resolve the same way a browser would
     */
    rewriteHtml(html, currentUrl = '/') {
      if (!base) return html
      const url = currentUrl.endsWith('/') ? currentUrl : currentUrl + '/'
      return String(html)
        .replace(/\b(href|src|action|poster)="([^"]*)"/g, (m, name, value) => rewriteAttribute(m, name, value, url))
        .replace(/fetch\('\/@jprot\//g, `fetch('${base}/@jprot/`)
        .replace(/href="' \+ e\.url/g, `href="${base}' + (e.url === '/' ? '/' : e.url.replace(/\\\/?$/, '/'))`)
    },

    /**
     * The search index is consumed client-side and every result link is built
     * from `entry.url`, so each one needs the prefix written into the data
     * rather than into markup.
     *
     * @param {string} body raw `search.json`
     * @returns {string} rewritten JSON (or the input unchanged if unparseable)
     */
    rewriteSearchIndex(body) {
      if (!base) return body
      const pageSlash = (path) => (path === '/' ? '/' : path.replace(/\/?$/, '/'))
      try {
        const index = JSON.parse(body)
        if (Array.isArray(index)) {
          for (const entry of index) entry.url = base + pageSlash(entry.url)
          return JSON.stringify(index)
        }
        return body
      } catch (err) {
        console.warn('deploy: could not prefix search.json URLs — ' + err.message)
        return body
      }
    },

    /**
     * A PWA manifest must scope itself to the deployment root, otherwise the
     * installed app claims URLs outside its own deployment.
     *
     * @param {string} body raw `manifest.json`
     * @returns {string} rewritten JSON (or the input unchanged if unparseable)
     */
    rewriteManifest(body) {
      if (!base) return body
      try {
        const manifest = JSON.parse(body)
        const withRoot = (value) => {
          if (typeof value !== 'string') return value
          if (/^(?:https?:|data:|blob:)/i.test(value)) return value
          const p = value.startsWith('/') ? value : '/' + value
          return base + (p === base ? '/' : p)
        }
        manifest.start_url = withRoot(manifest.start_url || '/')
        manifest.scope = withRoot(manifest.scope || '/')
        if (Array.isArray(manifest.icons)) {
          for (const icon of manifest.icons) {
            if (icon && icon.src) icon.src = withRoot(icon.src)
          }
        }
        return JSON.stringify(manifest)
      } catch (err) {
        console.warn('deploy: could not prefix manifest.json paths — ' + err.message)
        return body
      }
    },
  }
}

/**
 * Read the config and build the deployment it describes: an explicit
 * `basePath` argument wins over the one in `jprot.config.js`.
 *
 * @param {object} options
 * @param {string} [options.root] project root (defaults to cwd)
 * @param {string} [options.basePath] override for the configured base path
 * @param {Iterable<string>} [options.pageUrls] exported page URLs
 * @returns {Promise<{deployment: object, config: object, exportConfig: object}>}
 */
export async function resolveDeployment({ root, basePath, pageUrls } = {}) {
  const config = await loadSiteConfig(root)
  const deployment = createDeployment({ basePath: basePath ?? config.basePath, pageUrls })
  return {
    config,
    deployment,
    // The server generates every absolute URL from `url`, so the export runs
    // with the deployment-correct value (site.url + basePath) instead of a
    // leftover localhost/dev setting.
    exportConfig: { ...config, url: deployment.url(config) },
  }
}
