// Structured data (schema.org JSON-LD) and the helpers that feed it.
//
// Kept apart from core/server.js so the schema shapes can be asserted directly
// — they are the part of the output most likely to be silently wrong and the
// least likely to be noticed, because a broken JSON-LD block still renders a
// perfectly good-looking page.
import { absUrl } from "./urls.js";

export { generateJsonLd, htmlToText };

/* ============ JSON-LD structured data ============ */

// Resolve a path to an absolute URL using the site base; already-absolute
// URLs (https:, data:, mailto:) pass through untouched.
// Strip HTML to plain text for JSON-LD articleBody (full page copy for SEO).
function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function generateJsonLd({
  site,
  page,
  title,
  desc,
  ogType,
  pageUrl,
  canonical,
  image,
  layout,
  isHome,
  isPost,
  articleBody,
}) {
  const pageUrlNorm = pageUrl === "/" ? "" : pageUrl;
  const absPage = absUrl(site, pageUrl || "/");
  const nodes = [];

  // Site/Organization node (present on every page for a stable entity).
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.title || title,
    url: absUrl(site, "/"),
    description: desc,
  };
  // `logo` wins, then whichever avatar the hero actually renders — including the
  // site-wide `avatar` fallback Home.js uses, so setting only `avatar` does not
  // leave the Organization schema with an empty logo.
  const orgLogo = site.logo || site.hero?.avatar || site.avatar;
  if (orgLogo) org.logo = absUrl(site, orgLogo);
  if (site.email) org.email = site.email;
  if (site.sameAs || Array.isArray(site.social))
    org.sameAs = (site.sameAs || site.social)
      .map((s) => (typeof s === "string" ? s : s.url))
      .filter(Boolean);
  if (site.searchUrl)
    org.potentialAction = {
      "@type": "SearchAction",
      target: absUrl(site, site.searchUrl),
      "query-input": "required name=search_term_string",
    };
  nodes.push(org);

  // Article / BlogPosting for posts; Person for a resume; WebPage otherwise.
  if (ogType === "article") {
    const art = {
      "@context": "https://schema.org",
      "@type": isPost ? "BlogPosting" : "Article",
      headline: page.data.title || title,
      description: desc,
      articleBody: articleBody || undefined,
      url: absPage,
      mainEntityOfPage: { "@type": "WebPage", "@id": absPage },
      image: image || undefined,
      datePublished: page.data.date || undefined,
      dateModified: page.data.lastmod || page.data.date || undefined,
      inLanguage: site.lang || "en",
      author: {
        "@type": "Person",
        name: page.data.author || site.author || site.title,
      },
    };
    if (page.data.tags && page.data.tags.length)
      art.keywords = page.data.tags.join(", ");
    if (site.title)
      art.publisher = {
        "@type": "Organization",
        name: site.title,
        url: absUrl(site, "/"),
      };
    nodes.push(art);
  } else if (layout === "resume" || page.data.layout === "resume") {
    const person = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: page.data.title || site.title,
      url: absPage,
      description: desc,
      image: image || undefined,
    };
    if (site.email) person.email = site.email;
    const sameAs = (site.sameAs || site.social || [])
      .map((s) => (typeof s === "string" ? s : s.url))
      .filter(Boolean);
    if (sameAs.length) person.sameAs = sameAs;
    nodes.push(person);
  } else {
    nodes.push({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description: desc,
      url: absPage,
      inLanguage: site.lang || "en",
      image: image || undefined,
    });
  }

  // BreadcrumbList on every non-home page: Home › Current page.
  if (!isHome) {
    nodes.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: site.title || "Home",
          item: absUrl(site, "/") || undefined,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: page.data.title || title,
          item: absPage || undefined,
        },
      ],
    });
  }
  return nodes;
}
