// Static file serving: public/ assets, fingerprinted theme CSS, and the two
// legacy `?p=`/`?f=` stylesheet endpoints kept for older generated links.
//
// The one rule that matters here is that a stylesheet is only ever read from
// inside the theme directories — see serveCssFromTrustedDir, which is the
// guard against turning the dev server into an arbitrary file reader.
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";

import { SECURITY_HEADERS, etagOf, sendWithSecurity } from "./http.js";
import { state } from "./state.js";
import { MIME, isInside } from "./utils.js";
import { notFound } from "./notfound.js";

export { collectCss, isFile, serveCss, serveFile, serveThemeCss };

// Assets are cacheable forever when fingerprinted (export copies them under
// content-hashed names); in dev they must revalidate so edits show instantly.
function cacheControlFor(asset) {
  const s = state();
  return s && s.prod && asset
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

// A cheap existence check used by every route that probes an optional file.
async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function collectCss() {
  const { cssRegistry } = state();
  // no theme resolved (standalone render call with no built instance) → no links
  if (!cssRegistry || !cssRegistry.size) return "";
  const lines = [];
  for (const sha of cssRegistry.keys()) {
    const href = `/@jprot/css/${sha}.css`;
    lines.push(`<link rel="preload" as="style" href="${href}">`);
    lines.push(`<link rel="stylesheet" href="${href}">`);
  }
  return lines.join("\n  ");
}

/* ============ static/file serving ============ */

async function serveFile(req, res, file, fingerprinted = false) {
  let st;
  try {
    st = await stat(file);
  } catch {
    return notFound(res, null);
  }
  if (!st.isFile()) return notFound(res, null);
  const mime = MIME[extname(file).toLowerCase()] || "application/octet-stream";
  const body = await readFile(file);
  const tag = etagOf(body);
  if (req && req.headers["if-none-match"] === tag) {
    res.writeHead(304, {
      ETag: tag,
      "Cache-Control": cacheControlFor(fingerprinted),
      ...SECURITY_HEADERS,
    });
    return res.end();
  }
  sendWithSecurity(res, 200, mime, body, "", {
    etag: tag,
    cache: cacheControlFor(fingerprinted),
  });
}

async function serveThemeCss(req, res, pathname) {
  const url = new URL(req.url, "http://x");
  // hash-based: /@jprot/css/<sha>.css — the URL used by every rendered page
  const m = pathname.match(/^\/@jprot\/css\/([0-9a-f]{16})\.css$/);
  if (m) {
    const { cssRegistry } = state();
    const file = cssRegistry && cssRegistry.get(m[1]);
    if (file) return serveFile(req, res, file, true);
    return notFound(res, url);
  }
  // legacy: ?f=(absolute path inside the theme dir) — kept for compatibility
  const p = url.searchParams.get("f");
  if (p) {
    return serveCssFromTrustedDir(req, res, url, p, "theme");
  }
  notFound(res, url);
}

async function serveCss(req, res, url) {
  const p = url.searchParams.get("p");
  if (p) {
    return serveCssFromTrustedDir(req, res, url, p);
  }
  notFound(res, url);
}

// Security: only ever serve stylesheets from inside the theme directories.
// Never an arbitrary file from disk (guards against path-traversal reads).
async function serveCssFromTrustedDir(req, res, url, file, kind) {
  const { themeDir, userThemeDir } = state();
  const roots = [themeDir, userThemeDir];
  const within = roots.some((root) => isInside(root, file));
  if (
    !within ||
    extname(file).toLowerCase() !== ".css" ||
    !(await isFile(file))
  ) {
    return notFound(res, url);
  }
  return serveFile(req, res, file, url.searchParams.has("v"));
}
