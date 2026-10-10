// The public API surface, documented in README.md and typed in jprot.d.ts.
// Every entry point listed there must be reachable from the package root:
// `import { createJprot, exportSite } from "jprot"` resolves here.
//
// Nothing but wiring lives in this file. When it also held the server,
// `export.js` had to import it back for `createJprot` while it re-exported
// `exportSite` — the entry point and its own export path importing each
// other. A barrel that nobody imports cannot form a cycle, so the request
// lifecycle sits in `./site/app.js` and this file is free to name it.

// Used only by the "run this file directly" guard at the bottom.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export { parseFrontmatter } from "../lib/frontmatter.js";
export { createMarkdown } from "../lib/markdown.js";
export { runCheck, checkConfig } from "./tooling/check.js";
export { runLint, analyzeSite } from "./tooling/lint.js";
export { exportSite } from "./export.js";
export { scaffoldSite, scaffoldNew } from "./tooling/scaffold.js";
export { loadSiteConfig, ConfigLoadError } from "./foundation/config.js";
export { contentGraph, loadContentGraph } from "./content/graph.js";
export { HOOKS, loadPlugins, runPlugins } from "./runtime/plugins.js";
export { validateConfig, CONFIG_KEYS, formatConfigIssues } from "./content/schema.js";
export { esc, safeHref, safeColor, isInside, slugify, MIME, editDistance } from "../lib/utils.js";
export { resolveRelativeUrl } from "./foundation/urls.js";
export { renderPage } from "./site/page.js";
export { applyHtmlHooks, applyJsonHooks } from "./runtime/plugins-api.js";
export { createJprot } from "./site/app.js";

// Allows running this file directly: node core/server.js (spawns the CLI as
// a child to avoid a circular ESM import between the two entry points).
function isMainModule() {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(realpathSync(argv1))).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const { spawn } = await import("node:child_process");
  const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
  const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

