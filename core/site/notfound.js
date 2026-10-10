// The built-in 404 document.
//
// Extracted from core/server.js, which had grown to 1857 lines with this one
// function at the bottom of it. It is a leaf: it reads `state()` for the brand,
// the labels and the accent colour, and nothing imports it except the handlers
// that have nothing better to serve.
import { CSP, SECURITY_HEADERS, newNonce } from "../foundation/http.js";
import { state } from "../foundation/state.js";
import { esc, safeColor } from "../../lib/utils.js";

export function notFound(res, url) {
  const { site, labels } = state();
  const p = url ? esc(url.pathname) : "";
  const brand = site.title || "JPROT";
  const title = (labels && labels.pageNotFound) || "Page not found";
  const back = (labels && labels.backToHome) || "Back to";
  // This value lands inside a <style> block, so it is validated as a CSS color
  // and not merely escaped: `esc()` alone would still let a `}` or a `/*`
  // through, which is enough to rewrite the rest of the stylesheet.
  const bg = safeColor(site.themeColor) || "var(--color-accent, #4f46e5)";
  const html = `<!DOCTYPE html>
<html lang="${esc(site.lang || "en")}" dir="${esc(site.dir || "ltr")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 — ${esc(brand)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      min-height: 100vh; display: grid; place-items: center;
      background: ${esc(site.lang === "ar" ? "#fff" : "#ffffff")};
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
</html>`;
  const nonce = newNonce();
  res.writeHead(404, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": CSP(nonce),
    ...SECURITY_HEADERS,
    "Cache-Control": "no-cache",
  });
  res.end(html);
}
