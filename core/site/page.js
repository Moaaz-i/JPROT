// Turning a content file into a complete HTML document.
//
// This is the heart of the request path: resolve the page from the graph,
// render its Markdown, pick a layout, compose Header/Sidebar/Footer/Layout, and
// emit the <head> with SEO metadata. It was the largest single block in the old
// core/server.js and is now the largest file in core/ — deliberately, because
// it is one cohesive pipeline and splitting it further would only hide the
// order the steps have to happen in.
import { basename, join } from "node:path";

import { collectCss, isFile } from "./assets.js";
import { contentGraph, postItems, projectItems, readParsed } from "../content/graph.js";
import { newNonce, sendWithSecurity } from "../foundation/http.js";
import { generateJsonLd, htmlToText } from "../content/jsonld.js";
import { notFound } from "./notfound.js";
import { ogImageFor } from "./og.js";
import { applyHtmlHooks } from "../runtime/plugins-api.js";
import { renderDocumentBody, renderSections } from "../content/render.js";
import { scrollAnimScript, searchScript, spaScript, themeScript } from "../runtime/scripts/index.js";
import { state } from "../foundation/state.js";
import { absUrl } from "../foundation/urls.js";
import { esc, safeColor } from "../../lib/utils.js";


function inProdMode() {
  const s = state();
  return !!(s && s.prod);
}

export async function servePage(res, url, { home, file, status } = {}) {
  const { contentDir, site, markdown, nav } = state();
  // Posts and projects come from the same content graph the nav and search use,
  // so one request never walks the content tree more than once.
  const graph = await contentGraph();
  const projects = projectItems(graph);
  const posts = postItems(graph);
  let page;
  if (home) {
    const entry = graph.byUrl.get("/");
    if (entry) {
      page = { data: entry.data, body: entry.body, path: "index.md", slug: "index", url: "/" };
    } else {
      const idx = join(contentDir, "index.md");
      try {
        const parsed = await readParsed(idx);
        reportFrontmatterDiagnostics(idx, parsed.diagnostics);
        const { data, body } = parsed;
        page = { data, body, path: "index.md", slug: "index", url: "/" };
      } catch {
        page = { data: {}, body: "", path: "index.md", slug: "index", url: "/" };
      }
    }
  } else {
    const entry = graph.entryFor(file);
    const slug = basename(file, ".md");
    if (entry) {
      page = { data: entry.data, body: entry.body, path: file, slug, src: file, url: url.pathname };
    } else {
      const parsed = await readParsed(file);
      reportFrontmatterDiagnostics(file, parsed.diagnostics);
      const { data, body } = parsed;
      page = { data, body, path: file, slug, src: file, url: url.pathname };
    }
  }

  function reportFrontmatterDiagnostics(file, diagnostics = []) {
    for (const diagnostic of diagnostics) {
      console.warn(`[jprot] ${file}:${diagnostic.line} ${diagnostic.message}`);
    }
  }

  // drafts are visible in dev (author preview) but hidden in production/export
  if (page.data.draft && inProdMode()) {
    return notFound(res, url);
  }

  const headings = [];
  const shortcodeProps = { site, page, nav, projects, posts };
  const content = await renderDocumentBody(
    page.body,
    markdown,
    state().components || {},
    shortcodeProps,
    headings,
  );
  page.headings = headings;
  const isHomeIndex =
    home || page.slug === "index" || page.data.layout === "home";
  const { theme } = state();
  const layout =
    page.data.layout && page.data.layout !== "home"
      ? page.data.layout
      : isHomeIndex
        ? site.homeLayout || theme.defaultHome || "Home"
        : site.defaultLayout || theme.defaultPage || "Page";
  const nonce = newNonce();
  const html = await renderPage({
    page,
    content,
    projects,
    site,
    nav,
    layout,
    posts,
    home: isHomeIndex,
    docsNav: state().docsNav,
    nonce,
  });
  // The built-in contact form posts anywhere (e.g. Formspree); loosen the CSP
  // connect source for that HTTPS endpoint so the form actually submits.
  const formEndpoint = site.formspree || site.form;
  const extraConnectSrc =
    formEndpoint && /^https:\/\//.test(String(formEndpoint))
      ? [String(formEndpoint).split("/").slice(0, 3).join("/")]
      : [];
  sendWithSecurity(
    res,
    status || 200,
    "text/html; charset=utf-8",
    await applyHtmlHooks(html, page),
    nonce,
    { extraConnectSrc },
  );
}

export async function renderPage({
  page,
  content,
  projects,
  site,
  nav,
  layout,
  posts = [],
  home,
  nonce = newNonce(),
  docsNav = [],
}) {
  const { components = {} } = state();
  const Layout = components.Layout || ((p) => `<div>${p.content}</div>`);
  const Header = components.Header || (() => "");
  const Footer = components.Footer || (() => "");

  // Normalize for standalone use so a minimal call never throws.
  page = page || { data: {} };
  page.data = page.data || {};
  site = site || {};
  projects = projects || [];
  nav = nav || [];
  const isHome = home === true || layout === "Home";
  const sectionList = isHome
    ? [...(site.sections || []), ...(page.data.sections || [])]
    : [...(page.data.sections || [])];
  const sectionsHtml = await renderSections({
    site,
    page,
    nav,
    projects,
    posts,
    sections: sectionList,
    components,
  });

  const layoutComp =
    (layout &&
      (components[layout] ||
        components[layout[0].toUpperCase() + layout.slice(1)])) ||
    components.Page ||
    ((p) => `<article>${p.content}</article>`);
  const inner = await layoutComp({
    page,
    content,
    projects,
    site,
    nav,
    docsNav,
    posts,
    sectionsHtml,
  });

  const props = {
    site,
    page,
    nav,
    docsNav,
    content: inner,
    projects,
    posts,
    sectionsHtml,
  };
  // Sidebar: opt-in per page or site-wide. Shows on the default page layout
  // (or any layout when site.sidebar/toggle or page.data.sidebar says so),
  // never on the homepage or blog listings.
  let sidebarHtml = "";
  const { theme = {} } = state();
  const isDefaultPage =
    layout === (site.defaultLayout || theme.defaultPage || "Page");
  const sidebarOn = site.sidebar === true || page.data.sidebar === true;
  const showSidebar =
    site.sidebar !== false &&
    page.data.sidebar !== false &&
    !isHome &&
    layout !== "blog" &&
    (isDefaultPage || sidebarOn);
  if (showSidebar && components.Sidebar) {
    sidebarHtml = await components.Sidebar(props);
  }

  const headerHtml = await Header({ ...props, sidebar: sidebarHtml });
  const footerHtml = await Footer(props);

  const bodyHtml = await Layout({
    ...props,
    header: headerHtml,
    footer: footerHtml,
    sidebar: sidebarHtml,
  });

  const title = [page.data.title, site.title].filter(Boolean).join(" — ");
  const cssLinks = await collectCss();
  const desc =
    page.data.description ||
    page.data.subtitle ||
    page.data.excerpt ||
    site.description ||
    site.tagline ||
    "";
  const pageUrl = page.url || "/";
  const blogDir = site.blogDir || "blog";
  const isPost =
    typeof pageUrl === "string" && pageUrl.startsWith("/" + blogDir + "/");
  const ogType = page.data.layout === "blog" || isPost ? "article" : "website";

  // SEO essentials ---------------------------------------------------------
  // canonical: frontmatter override > site.url + path; og:url follows it.
  const canonical = page.data.canonical
    ? absUrl(site, page.data.canonical)
    : absUrl(site, pageUrl);
  const canonicalMeta = canonical
    ? `<link rel="canonical" href="${esc(canonical)}">`
    : "";
  // og:image — explicit site.ogImage/page `image`, else a generated file
  const ogInfo = await ogImageFor({ site, page, title, desc });
  const ogImage = ogInfo.url;
  const ogImageDims =
    ogInfo.w && ogInfo.h
      ? `  <meta property="og:image:width" content="${ogInfo.w}">\n  <meta property="og:image:height" content="${ogInfo.h}">`
      : "";
  // robots — opt-out per page via `noindex: true`
  const robotsMeta = page.data.noindex
    ? '<meta name="robots" content="noindex,nofollow">'
    : '<meta name="robots" content="index,follow">';
  const hreflangs =
    Array.isArray(site.alternateLangs) && site.alternateLangs.length
      ? "\n  " +
        site.alternateLangs
          .map(
            (l) =>
              `<link rel="alternate" hreflang="${esc(l.lang || "")}" href="${esc(absUrl(site, l.url || ""))}">`,
          )
          .join("\n  ")
      : "";
  const twitterSite = site.twitter
    ? `\n  <meta name="twitter:site" content="${esc(site.twitter)}">`
    : "";
  const ogLocale = site.ogLocale || site.lang || "en";
  const ogLogo = site.logo
    ? `\n  <meta property="og:logo" content="${esc(absUrl(site, site.logo))}">`
    : "";

  const jsonLd = generateJsonLd({
    site,
    page,
    title,
    desc,
    ogType,
    pageUrl,
    canonical,
    image: absUrl(site, ogImage),
    layout,
    isHome,
    isPost,
    articleBody: ogType === "article" ? htmlToText(content) : undefined,
  });

  return `<!DOCTYPE html>
<html lang="${esc(site.lang || "en")}" dir="${esc(site.dir || "ltr")}">
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
  <meta property="og:site_name" content="${esc(site.title || "")}">
  <meta property="og:title" content="${esc(page.data.title || site.title || "")}">
  <meta property="og:description" content="${esc(desc)}">
  ${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
  ${ogImageDims}
  ${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ""}
  ${ogLogo}
  <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${esc(page.data.title || site.title || "")}">
  <meta name="twitter:description" content="${esc(desc)}">
  ${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">\n  <meta name="twitter:image:alt" content="${esc(title)}">` : ""}${twitterSite}
  <link rel="alternate" type="application/rss+xml" title="${esc(site.title || "Blog")}" href="/feed.xml">
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="${esc(safeColor(site.themeColor) || "#4f46e5")}">
  <style>
    :where(main > section) { content-visibility: auto; contain-intrinsic-size: auto 800px; }
  </style>
  ${cssLinks}
  ${themeScript(nonce, site.themes)}
  ${site.head || ""}
</head>
<body>
${bodyHtml}
${scrollAnimScript(nonce)}
${spaScript(nonce)}
${searchScript(site.labels || {}, nonce)}
${jsonLd ? `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(jsonLd)}</script>` : ""}
</body>
</html>`;
}
