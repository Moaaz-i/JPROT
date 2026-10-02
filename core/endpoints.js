// Machine-readable endpoints: sitemap, robots.txt, llms.txt, RSS and the web
// app manifest.
//
// These are grouped rather than split per-file because they share one
// dependency — the content graph — and one convention: each is a pure function
// of state() that writes a single response and returns.
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";

import { contentGraph, stripMarkdown } from "./graph.js";
import { sendWithSecurity, newNonce } from "./http.js";
import { state } from "./state.js";
import { esc, safeColor } from "./utils.js";
import { applyJsonHooks } from "./plugins-api.js";

export {
  homepageSearchEntry,
  serveFeed,
  serveFavicon,
  serveLlmsIndex,
  serveManifest,
  serveRobotsTxt,
  serveSearchIndex,
  serveSitemap,
};

// Homepage is a first-class searchable page: its index.md body plus the whole
// site config (hero, sections props, nav labels, tagline…) so config-driven
// text is captured too. `raw` keeps every byte searchable.
async function homepageSearchEntry(graph, site) {
  let md = "";
  const home = graph && graph.byUrl.get("/");
  if (home) md = home.body;
  const config = JSON.stringify(site || {});
  return {
    title: site.title || "Home",
    url: "/",
    excerpt: site.description || site.tagline || "",
    tags: [],
    date: "",
    image: "",
    body: stripMarkdown(md + "\n" + config),
    raw: (md + "\n" + config).trim(),
    frontmatter: "",
  };
}

async function serveSearchIndex(res) {
  const { site } = state();
  const graph = await contentGraph();
  const entries = [...graph.searchIndex];
  entries.unshift(await homepageSearchEntry(graph, site));
  sendWithSecurity(res, 200, "application/json", JSON.stringify(await applyJsonHooks(entries, "/@jprot/search.json")));
}
// ISO date (yyyy-mm-dd) of the most recent commit touching `file`, from git.
// Returns null when the project is not a git repo or git is unavailable.
function gitLastCommitDate(file) {
  return new Promise((resolvePromise) => {
    execFile(
      "git",
      ["log", "-1", "--format=%cI", "--", file],
      (err, stdout) => {
        if (err || !stdout || !stdout.trim()) return resolvePromise(null);
        const iso = stdout.trim();
        return resolvePromise(
          /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null,
        );
      },
    );
  });
}

async function contentFilePath(contentDir, entryUrl) {
  if (entryUrl === "/") return join(contentDir, "index.md");
  return join(
    contentDir,
    entryUrl.replace(/^\//, "").replace(/\/$/, "/index") + ".md",
  );
}

// lastmod: last git commit that touched the file (best signal), else mtime.
async function pageLastmod(contentDir, entryUrl) {
  try {
    const p = await contentFilePath(contentDir, entryUrl);
    const gitDate = await gitLastCommitDate(p);
    if (gitDate) return gitDate;
    return (await stat(p)).mtime.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

async function serveSitemap(res) {
  const { contentDir, site } = state();
  const graph = await contentGraph();
  const entries = graph.searchIndex;
  const base = (site.url || "").replace(/\/$/, "");
  const imageNS =
    ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
  const urls = ["/", ...entries.map((e) => e.url)].map(async (u) => {
    const loc = esc(base + u);
    const lm = await pageLastmod(contentDir, u);
    const priority =
      u === "/"
        ? "1.0"
        : u.split("/").filter(Boolean).length === 1
          ? "0.8"
          : "0.6";
    const entry = u === "/" ? null : entries.find((e) => e.url === u);
    const img =
      entry && entry.image
        ? `<image:image><image:loc>${esc(/^(https?:|data:)/.test(entry.image) ? entry.image : base + entry.image)}</image:loc></image:image>`
        : "";
    // <image:image> must be a child of <url>, not of <urlset> — otherwise
    // Google's validator reports "tag not recognized / parent tag: urlset".
    return `  <url><loc>${loc}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ""}<changefreq>${u === "/" ? "daily" : "weekly"}</changefreq><priority>${priority}</priority>${img}</url>`;
  });
  const body = await Promise.all(urls);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${imageNS}>
${body.join("\n")}
</urlset>`;
  sendWithSecurity(res, 200, "application/xml", xml);
}

async function serveRobotsTxt(res) {
  const { site } = state();
  const base = (site.url || "").replace(/\/$/, "");
  const sitemap = base ? `\nSitemap: ${base}/sitemap.xml` : "";
  const txt = `# JPROT
User-agent: *
Allow: /
Disallow: /@jprot/
Disallow: /@editor/
Disallow: /feed.xml${sitemap}
`;
  sendWithSecurity(res, 200, "text/plain; charset=utf-8", txt);
}

// llms.txt + llms-full.txt — lightweight machine-readable site indexes consumed
// by LLM/AI crawlers. The index lists every page with a one-line excerpt; the
// full file appends each page's Markdown body for depth.
async function serveLlmsIndex(res, full) {
  const { contentDir, site } = state();
  const graph = await contentGraph();
  const entries = graph.searchIndex;
  const home = await homepageSearchEntry(graph, site);
  const base = (site.url || "").replace(/\/$/, "");
  const name = site.title || "JPROT";
  const blurb = site.description || site.tagline || "";
  if (full) {
    const parts = [`# ${name}`, "", blurb, "", "## Pages", ""];
    // homepage first: index.md body + full config text so nothing is missing
    const homeEntry = graph.byUrl.get("/");
    const homeBody = homeEntry ? homeEntry.body.trim() : home.body || "";
    parts.push(
      `### ${home.title}`,
      "",
      `> Source: ${base}/`,
      "",
      homeBody || home.body,
      "",
    );
    for (const e of entries) {
      // The graph already holds every parsed body — no re-read from disk.
      const entry = graph.lookup(e.url);
      parts.push(
        `### ${e.title}`,
        "",
        `> Source: ${base + e.url}`,
        "",
        (entry ? entry.body : "").trim(),
        "",
      );
    }
    sendWithSecurity(res, 200, "text/plain; charset=utf-8", parts.join("\n"));
  } else {
    const lines = [`# ${name}`, "", `> ${blurb}`, "", "## Docs", ""];
    lines.push(`- [${home.title}](${base}/): ${home.excerpt || blurb}`);
    for (const e of entries)
      lines.push(`- [${e.title}](${base + e.url}): ${e.excerpt}`);
    sendWithSecurity(res, 200, "text/plain; charset=utf-8", lines.join("\n"));
  }
}

async function serveFeed(res, url) {
  const { site } = state();
  const graph = await contentGraph();
  const posts = graph.posts;
  const base = (site.url || `http://${url.host}`).replace(/\/$/, "");
  const items = posts
    .map((p) => {
      let pubDate = ""
      if (p.data.date) {
        const d = new Date(p.data.date)
        if (!Number.isNaN(d.getTime())) pubDate = `\n    <pubDate>${d.toUTCString()}</pubDate>`
      }
      const desc = esc(p.data.excerpt || p.excerpt || "");
      // p.url is already the clean site path (`/blog/hello`).
      return `  <item>
    <title>${esc(p.data.title || p.slug)}</title>
    <link>${esc(base + p.url)}</link>
    <guid>${esc(base + p.url)}</guid>${pubDate}
    <description>${desc}</description>
  </item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${esc(site.title || "Blog")}</title>
  <link>${esc(base)}</link>
  <description>${esc(site.description || "")}</description>
  ${items}
</channel>
</rss>`;
  sendWithSecurity(res, 200, "application/rss+xml; charset=utf-8", xml);
}

async function serveManifest(res) {
  const { site } = state();
  const manifest = {
    name: site.title || "JPROT Portfolio",
    short_name: (site.title || "JPROT").slice(0, 12),
    description: site.description || site.tagline || "",
    start_url: "/",
    display: "standalone",
    background_color: safeColor(site.themeColor) || "#4f46e5",
    theme_color: safeColor(site.themeColor) || "#4f46e5",
    icons: site.icon
      ? [{ src: site.icon, sizes: "any", type: "image/svg+xml" }]
      : [],
  };
  sendWithSecurity(res, 200, "application/json", JSON.stringify(await applyJsonHooks(manifest, "/manifest.json")));
}

async function serveFavicon(res) {
  const { site } = state();
  const initials = (site.title || "J").slice(0, 2).toUpperCase();
  // `themeColor` is author-controlled and lands in a double-quoted XML
  // attribute, so it is escaped like any other value — and a CSP is sent so
  // navigating straight to this URL cannot execute injected script.
  const bg = esc(safeColor(site.themeColor) || "#4f46e5");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="42" font-family="system-ui,sans-serif" font-size="28" font-weight="bold" fill="#fff" text-anchor="middle">${esc(initials)}</text></svg>`;
  sendWithSecurity(res, 200, "image/svg+xml", svg, newNonce());
}
