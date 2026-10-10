// Auto-generated social (og:image) cards.
//
// Three concerns, one file: building the SVG, deciding which image a page should
// advertise, and serving the generated file back. Splitting them out of
// core/server.js is what lets the SVG builder be unit-tested without booting a
// server.
import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { absUrl } from "../foundation/urls.js";
import { state } from "../foundation/state.js";
import { isInside, safeColor } from "../../lib/utils.js";
import { notFound } from "./notfound.js";
import { serveFile } from "./assets.js";

export { ogImageFor, ogImageSvg, serveOgImage };

/* ============ OG:image auto-generation ============ */

// SVG body used for the auto-generated social image (1200×630, brand colors).
function ogImageSvg(title, description, site) {
  const t = encodeURIComponent((title || site.title || "JPROT").slice(0, 40));
  const d = encodeURIComponent((description || "").slice(0, 80));
  // Colors are validated (not just escaped) because they land inside a
  // double-quoted XML attribute in a standalone SVG document.
  const bg = safeColor(site.ogColor) || "#4f46e5";
  const fg = safeColor(site.ogTextColor) || "#ffffff";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="${bg}"/><text x="600" y="260" font-family="system-ui,sans-serif" font-size="56" font-weight="bold" fill="${fg}" text-anchor="middle">${t}</text>${d ? `<text x="600" y="340" font-family="system-ui,sans-serif" font-size="28" fill="${fg}" opacity="0.8" text-anchor="middle">${d}</text>` : ""}<text x="600" y="500" font-family="system-ui,sans-serif" font-size="22" fill="${fg}" opacity="0.5" text-anchor="middle">Built with JPROT</text></svg>`;
}

// Resolve the og:image for a page: explicit site.ogImage > page `image` >
// generated SVG. Generated images are written once to <root>/.cache/og/<sha>.svg
// and served as a real file (crawlable, cacheable, tiny <head>) instead of an
// inline data: URI. Falls back to a data URI only outside a project root
// (standalone renderPage calls). Returns { url, w, h }.
async function ogImageFor({ site, page, title, desc }) {
  if (site.ogImage) return { url: site.ogImage, w: null, h: null };
  if (page.data.image)
    return { url: absUrl(site, page.data.image), w: null, h: null };
  const svg = ogImageSvg(title, desc, site);
  const { projectRoot } = state();
  if (projectRoot) {
    try {
      const dir = join(projectRoot, ".cache", "og");
      const hash = createHash("sha256").update(svg).digest("hex").slice(0, 16);
      const file = join(dir, hash + ".svg");
      try {
        await stat(file);
      } catch {
        await mkdir(dir, { recursive: true });
        await writeFile(file, svg, "utf8");
      }
      return { url: "/@jprot/og/" + hash + ".svg", w: 1200, h: 630 };
    } catch {
      /* fall through to a data URI */
    }
  }
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    w: 1200,
    h: 630,
  };
}

// Serves a generated OG image from <root>/.cache/og — path-guarded, cached.
async function serveOgImage(req, res, pathname) {
  const { projectRoot } = state();
  const name = pathname.replace(/^\/@jprot\/og\//, "");
  if (!/^[0-9a-f]{16}\.svg$/.test(name) || !projectRoot)
    return notFound(res, null);
  const file = join(projectRoot, ".cache", "og", name);
  if (!isInside(join(projectRoot, ".cache", "og"), file))
    return notFound(res, null);
  return serveFile(req, res, file, true);
}
