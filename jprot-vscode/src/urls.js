"use strict";

/**
 * Mirrors core/content.js `indexAll()` URL derivation: given a Markdown file
 * inside a JPROT content directory, return the clean page URL it maps to.
 * Pure and dependency-free so it can be unit-tested without VSCode.
 * Path separators are normalized, so Windows-style paths work on any OS.
 *
 *   content/index.md                 -> "/"
 *   content/blog/post.md             -> "/blog/post"
 *   content/getting-started/index.md -> "/getting-started"
 *   content/404.md                   -> null (error page — no URL)
 *   anything outside contentDir, or not .md -> null
 *
 * @param {string} contentDir absolute path of the content directory
 * @param {string} file       absolute path of a file
 * @returns {string | null}
 */
function contentPathToUrl(contentDir, file) {
  if (!file.endsWith(".md")) return null;
  const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const content = norm(contentDir);
  const current = norm(file);
  if (!current.startsWith(content + "/")) return null;
  const clean = current
    .slice(content.length + 1)
    .replace(/\.md$/, "")
    .replace(/\/index$/, "");
  if (clean === "index") return "/";
  if (clean === "404") return null;
  return "/" + clean;
}

module.exports = { contentPathToUrl };