// The request lifecycle: build the state snapshot, route a URL, write a
// response. Each imported module owns one kind of answer, so each can be
// read — and tested — on its own.

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

import { createMarkdown } from "../../lib/markdown.js";
import { loadComponents, normalizeComponent } from "../content/components.js";
import { DEFAULT_THEME_DIR, loadSiteConfig, loadThemeMeta } from "../foundation/config.js";
import { contentGraph, loadContentGraph, resolveContent } from "../content/graph.js";
import {
  badRequest,
  CSP,
  methodNotAllowed,
  newNonce,
  SECURITY_HEADERS,
  sendWithSecurity,
  setFramePolicy,
} from "../foundation/http.js";
import { runPlugins } from "../runtime/plugins.js";
import { CONFIG_KEYS } from "../content/schema.js";
import { suggestConfigKey } from "../tooling/scaffold.js";
import { DEFAULT_LABELS, runScoped, setFallbackState, state } from "../foundation/state.js";
import { decodeRequestPath, mdCanonical, originFor } from "../foundation/urls.js";
import { isInside } from "../../lib/utils.js";
import { startReloadWatcher } from "../runtime/watch.js";

// Extracted modules. This file is now just the request lifecycle: build the
// state snapshot, route a URL, write a response. Each module below owns one
// kind of answer, so each can be read — and tested — on its own.
import { isFile, serveCss, serveFile, serveThemeCss } from "./assets.js";
import {
  serveFeed,
  serveFavicon,
  serveLlmsIndex,
  serveManifest,
  serveRobotsTxt,
  serveSearchIndex,
  serveSitemap,
} from "./endpoints.js";
import { notFound } from "./notfound.js";
import { serveOgImage } from "./og.js";
import { servePage } from "./page.js";


// Keys the unknown-key hint checker must not warn about. Derived from the same
// schema `jprot check` validates against, so the two can never disagree about
// which keys are real.
const CONFIG_KEY_HINTS = new Set([...CONFIG_KEYS, "sections"]);

// Dispatch one hook by name. Every declared hook goes through here, so a hook
// that is accepted by `on()` can never be silently dropped. A throwing handler
// is reported and skipped: one bad plugin must not take the site down.
async function fireHook(hooks, name, ...args) {
  for (const handler of (hooks && hooks[name]) || []) {
    try {
      await handler(...args);
    } catch (e) {
      console.warn(`[jprot] plugin "${name}" hook failed: ${e.message}`);
    }
  }
}

/**
 * One hash standing for "everything a user can write by hand that is not
 * content": the files in their `theme/` directory and their config file.
 *
 * The incremental exporter needs this. A page's HTML depends on the component
 * that rendered it, so editing `theme/components/Projects.js` changes pages
 * even though no content file changed. Hashing the sources is what lets an
 * unchanged build skip re-rendering without ever serving a stale page.
 *
 * The built-in theme needs no hash of its own: it ships with the package, so
 * `JPROT_VERSION` already changes when it does. CSS is included by way of the
 * content-keyed `cssRegistry`, which the caller passes in.
 */
async function fingerprintSources(projectRoot, userThemeDir, configFiles, cssRegistry) {
  const hash = createHash("sha256");
  // Length-prefixed rather than delimiter-separated: no separator can ever be
  // confused with file content, so two different trees cannot collide.
  const add = async (label, file) => {
    let body;
    try {
      body = await readFile(file);
    } catch {
      // Missing or unreadable: nothing to contribute. If the file mattered, the
      // read that needed it already failed loudly elsewhere.
      return;
    }
    hash.update(`${label.length}:${label}:${body.length}:`).update(body);
  };
  // Sorted, so the hash does not depend on directory-listing order.
  const walk = async (dir, prefix = "") => {
    let names;
    try {
      names = (await readdir(dir, { withFileTypes: true }))
        .map((d) => d.name)
        .sort();
    } catch {
      return;
    }
    for (const name of names) {
      const full = join(dir, name);
      const st = await stat(full).catch(() => null);
      if (!st) continue;
      if (st.isDirectory()) await walk(full, `${prefix}${name}/`);
      else await add(prefix + name, full);
    }
  };
  await walk(userThemeDir);
  for (const name of configFiles) await add(name, join(projectRoot, name));
  for (const cssSha of [...cssRegistry.keys()].sort()) {
    hash.update(`css:${cssSha}:`);
  }
  return hash.digest("hex").slice(0, 16);
}

export async function createJprot(options = {}) {
  const projectRoot = options.root ?? process.cwd();
  const contentDir = options.contentDir ?? join(projectRoot, "content");
  const publicDir = options.publicDir ?? join(projectRoot, "public");
  const userThemeDir = join(projectRoot, "theme");

  // Mutable per-instance snapshot. Reassigned on each (re)build; every
  // request reads the latest snapshot via the AsyncLocalStorage store.
  let instanceState = {};

  async function buildState(bust = false) {
    const site = await loadSiteConfig(projectRoot, options.config, bust);
    // Plugins run first: they get to contribute components, routes, Markdown
    // extensions and hook handlers before anything reads the registries, so a
    // plugin component can be used by a section on this very build. A fresh
    // registry per build keeps hot reload idempotent — a plugin that was removed
    // from the config leaves nothing behind.
    const { registry, plugins } = await runPlugins({
      projectRoot,
      config: site,
      bust: true,
    });
    const markdown = createMarkdown({
      ...registry.markdown.defaults,
      // A plugin's Markdown extensions. These are collected by
      // `extendMarkdown({ extensions })` and have to be handed to the renderer
      // here or they never run — `defaults` alone left the whole `extensions`
      // array unreachable.
      extensions: registry.markdown.extensions,
      ...(site.markdown || {}),
    });
    // Blog/project directories decide how a file is classified, so they must be
    // known before the content graph is built.
    const blogDir = join(contentDir, site.blogDir || "blog");
    const projectsDir = join(contentDir, site.projectsDir || "projects");
    // One graph build replaces four independent walks of the content tree
    // (navbar, docs sidebar, posts, projects). Everything below reads from it.
    const graph = await loadContentGraph({
      contentDir,
      blogDir,
      projectsDir,
      docs: site.docs === true,
    });
    let nav = graph.navigation;
    if (Array.isArray(site.nav) && site.nav.length) {
      nav = site.nav.map((n) =>
        typeof n === "string" ? { label: n, url: n } : n,
      );
    }
    // Docs mode gets its own full reading order (every content page, sorted by
    // frontmatter `order`) for the sidebar and prev/next — separate from the
    // compact navbar, which is user-controlled via site.nav. Blog posts and
    // project entries are excluded so they don't clutter the docs sidebar.
    const docsNav = site.docs ? graph.docsNavigation : [];
    const components = await loadComponents(userThemeDir, bust, markdown);
    // Plugin components are applied after the theme's, so `addComponent` with
    // a built-in's name is a deliberate override.
    for (const { name, component } of registry.components) {
      components[name] = normalizeComponent(name, component);
    }
    // `components:load` fires after plugins have contributed but before the
    // state is frozen, so a handler can still add or wrap a component.
    await fireHook(registry.hooks, "components:load", components);
    let themeDir = DEFAULT_THEME_DIR;
    try {
      await stat(join(userThemeDir, "main.js"));
      themeDir = userThemeDir;
    } catch {}
    const theme = await loadThemeMeta(themeDir);
    const labels = { ...DEFAULT_LABELS, ...(site.labels || {}) };
    const names = new Set(Object.keys(components));
    for (const sec of site.sections || []) {
      const n = sec.component || sec.type;
      if (n && !names.has(n)) {
        console.warn(
          `[jprot] section "${n}" (${sec.title || "untitled"}) — no component named "${n}" found. Available: ${[...names].sort().join(", ") || "—"}`,
        );
      }
    }
    for (const key of Object.keys(site)) {
      if (key === "sections" || CONFIG_KEY_HINTS.has(key)) continue;
      const hint = suggestConfigKey(key);
      if (hint)
        console.warn(
          `[jprot] config key "${key}" not recognized — did you mean "${hint}"?`,
        );
    }
    // Index live stylesheets by content hash. Pages link to /@jprot/css/<sha>.css,
    // so the URLs are stable, immutable-cacheable, and never leak the absolute
    // disk path of the theme in the raw HTML.
    const cssRegistry = new Map();
    const cssOrder = [
      themeDir ? join(themeDir, "styles.css") : null,
      userThemeDir ? join(userThemeDir, "custom.css") : null,
    ];
    for (const p of cssOrder) {
      if (!p) continue;
      try {
        if (!(await stat(p)).isFile()) continue;
        const body = await readFile(p);
        cssRegistry.set(
          createHash("sha256").update(body).digest("hex").slice(0, 16),
          p,
        );
      } catch {
        /* unreadable → just skip */
      }
    }
    // Everything a user wrote by hand, as one hash. Read fresh on every build
    // so an incremental export cannot mistake an edited component for an
    // unchanged one.
    const sourceFingerprint = await fingerprintSources(
      projectRoot,
      userThemeDir,
      ["jprot.config.js", "jprot.config.json"],
      cssRegistry,
    );

    instanceState = {
      projectRoot,
      contentDir,
      publicDir,
      userThemeDir,
      themeDir,
      theme,
      site,
      labels,
      markdown,
      nav,
      docsNav,
      components,
      blogDir,
      projectsDir,
      graph,
      prod: options.prod === true,
      cssRegistry,
      sourceFingerprint,
      // Plugin output, kept on the state so request handlers and `jprot
      // export` can reach the same hooks, routes and plugin list.
      hooks: registry.hooks,
      routes: registry.routes,
      plugins,
    };
    setFallbackState(instanceState);
    // A plugin may want to know a build happened (clear a cache, warm an
    // index). `state:build` is the mutable pre-freeze view; `build` is the
    // frozen one. Both fire here so neither declaration is a no-op.
    await fireHook(registry.hooks, "state:build", instanceState);
    await fireHook(registry.hooks, "build", instanceState);
  }

  await buildState(false);

  const port = Number(options.port ?? process.env.PORT ?? 4114);
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";

  // Dev-server opt-in: allow the site to be embedded in an iframe (the VSCode
  // extension's live preview). Everything else stays fully locked down — this
  // only relaxes framing, and only when explicitly enabled.
  setFramePolicy(options.allowEmbed ? ["'self'", "*"] : []);

  // watch the project for changes and hot-reload state (dev only)
  //
  // The watcher classifies each change, so an edit only invalidates the layer
  // it can actually affect: a content edit re-walks the graph, a theme edit
  // re-reads components + CSS with the module cache busted, and a public/
  // asset edit needs no rebuild at all (those files are streamed from disk).
  // `jprot export` writing to dist/ is ignored entirely, which is what keeps
  // the dev server from reloading in a loop while you preview a build.
  const watcher =
    options.watch !== false
      ? startReloadWatcher({
          projectRoot,
          contentDir,
          userThemeDir,
          publicDir,
          configFiles: [
            join(projectRoot, "jprot.config.js"),
            join(projectRoot, "jprot.config.json"),
          ],
          onChange: (change) => {
            if (change.rebuild === "none") return;
            return buildState(change.bust);
          },
        })
      : null;
  const handleRequest = async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.setHeader("Allow", "GET, HEAD");
        return methodNotAllowed(res);
      }
      // origin-form request-targets are absolute-paths, so a leading // must
      // never be parsed as an authority (new URL would take '//server.js' to
      // host 'server.js' and serve '/' instead of 404)
      if (req.url.startsWith("//")) req.url = req.url.slice(1);
      const url = new URL(req.url, originFor(host, port));
      let pathname;
      try {
        pathname = decodeRequestPath(url.pathname);
      } catch {
        return badRequest(res, "Invalid request path");
      }

      if (pathname === "/__css") {
        return await serveCss(req, res, url);
      }

      if (pathname.startsWith("/@jprot/css")) {
        return await serveThemeCss(req, res, pathname);
      }

      if (pathname === "/@jprot/search.json") {
        return await serveSearchIndex(res);
      }

      if (pathname === "/sitemap.xml") {
        return await serveSitemap(res);
      }

      if (pathname === "/robots.txt") {
        return await serveRobotsTxt(res);
      }

      if (pathname === "/feed.xml" || pathname === "/rss.xml") {
        return await serveFeed(res, url);
      }

      if (pathname === "/manifest.json") {
        return await serveManifest(res);
      }

      if (pathname === "/favicon.svg") {
        return await serveFavicon(res);
      }

      // auto-generated OG images live in <root>/.cache/og (fingerprinted file)
      if (pathname.startsWith("/@jprot/og/")) {
        return await serveOgImage(req, res, pathname);
      }

      if (pathname === "/llms.txt") {
        return await serveLlmsIndex(res, false);
      }

      if (pathname === "/llms-full.txt") {
        return await serveLlmsIndex(res, true);
      }

      if (pathname === "/" || pathname === "/index.html") {
        return await servePage(res, url, { home: true });
      }

      // Plugin routes are matched exactly and sit between the engine endpoints
      // and the content router, so a plugin can serve a generated file
      // (/feed.json, /api/search) without owning a content page for it.
      const pluginRoute = (state().routes || []).find((r) => r.path === pathname);
      if (pluginRoute) {
        return await pluginRoute.handler(req, res, url);
      }

      const pubFile = join(publicDir, pathname.replace(/^\//, ""));
      if (isInside(publicDir, pubFile) && (await isFile(pubFile))) {
        return await serveFile(req, res, pubFile);
      }

      // `.md` URLs exist so docs links keep working on GitHub; here they 301 to
      // the clean URL so the site never serves duplicate content.
      const canonical = mdCanonical(pathname);
      if (canonical && (await resolveContent(contentDir, pathname))) {
        // Root-relative Location so the redirect stays on whatever origin the
        // visitor used (dev server, proxy, IPv6 literal) instead of following
        // the production site.url.
        res.writeHead(301, {
          Location: canonical,
          ...SECURITY_HEADERS,
          "Cache-Control": "no-cache",
        });
        return res.end();
      }

      // trailing slashes on directory pages (/docs/ → /docs) collapse into one
      // canonical URL so search engines and links never see duplicate content;
      // the homepage and index.html are handled above.
      if (pathname.length > 1 && pathname.endsWith("/")) {
        const clean = pathname.replace(/\/+$/, "");
        if (await resolveContent(contentDir, clean)) {
          res.writeHead(301, {
            Location: clean,
            ...SECURITY_HEADERS,
            "Cache-Control": "no-cache",
          });
          return res.end();
        }
      }

      const contentFile = await resolveContent(contentDir, pathname);
      if (contentFile) {
        return await servePage(res, url, { file: contentFile });
      }

      // custom 404 page (content/404.md) if the author provided one
      const notFoundFile = join(contentDir, "404.md");
      if (await isFile(notFoundFile)) {
        return await servePage(res, url, { file: notFoundFile, status: 404 });
      }
      notFound(res, url);
    } catch (err) {
      // The message goes to the server log, never to the client: it can carry
      // absolute filesystem paths and internal module names. The response gets
      // the same security headers as every other one, which the old inline
      // writeHead skipped.
      console.error("[jprot]", err);
      if (!res.headersSent) {
        // A nonce is passed even though the body is plain text, so an error
        // response carries the same CSP as every other one. (Static files
        // deliberately get no CSP — see sendWithSecurity.)
        sendWithSecurity(res, 500, "text/plain; charset=utf-8", "Server error", newNonce());
      } else {
        res.end();
      }
    }
  };

  // Runs each incoming request inside an AsyncLocalStorage scope bound to
  // this instance's state snapshot, so concurrent instances never share state.
  const scopedHandler = (req, res) =>
    runScoped(instanceState, () => handleRequest(req, res));

  let server = createServer(scopedHandler);
  let boundPort = port;

  return {
    get server() {
      return server;
    },
    get port() {
      return boundPort;
    },
    host,
    contentDir,
    publicDir,
    projectRoot,
    reload: () => buildState(true),
    closeWatcher: () => watcher && watcher.close(),
    async listen(portOverride) {
      return new Promise((resolvePromise, reject) => {
        let currentPort = portOverride ?? port;
        const tryListen = () => {
          server = createServer(scopedHandler);
          server.once("error", (err) => {
            if (err.code === "EADDRINUSE") {
              currentPort += 1;
              tryListen();
            } else {
              reject(err);
            }
          });
          server.listen(currentPort, host, () => {
            server.removeListener("error", reject);
            const addr = server.address();
            boundPort =
              addr && typeof addr === "object" ? addr.port : currentPort;
            resolvePromise(boundPort);
          });
        };
        tryListen();
      });
    },
  };
}
