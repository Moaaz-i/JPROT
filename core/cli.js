#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { originFor } from "./urls.js";

function printHelp() {
  console.log(`
  JPROT - Portfolio site generator without a build step

  Usage:
    jprot                Start the dev server (default port 4114)
    jprot 8080           Start on a specific port
    jprot init           Scaffold a new site (--docs | --resume | --portfolio)
    jprot new <kind>     Add content: post | page | project | resume [title] [--draft]
    jprot g component    Scaffold a theme component (--palette section|cards|cta|stats, --format js|md)
    jprot lint           Check content for broken links / missing metadata
    jprot search [q]     Search the component catalog (or list everything)
    jprot add <Name>     Install a component from the catalog into theme/components/
    jprot export         Export the whole site as static files to dist/
    jprot --prod         Serve with production caching (no watcher)
    jprot --export       Alias for export

  Options:
    --port <n>           Port to listen on (default 4114)
    --out <dir>          Export output directory (default dist/)
    --base-path <path>   Prefix exported URLs for a project site (e.g. /JPROT)
    --draft              'jprot new': mark the page as a draft
    --template <name>    'jprot new': use templates/<name>.md
    --from <url>         'jprot add/search': catalog base URL override
    --prod               Production mode: immutable cache headers, drafts hidden
    --no-watch           Disable the file watcher
    --allow-embed        Allow embedding the site in an iframe (editor previews)
    -h, --help           Show this help
    -v, --version        Show the version

  Environment:
    PORT                 Port override
    HOST                 Host to bind (default 127.0.0.1)
    NO_WATCH=1           Disable the file watcher
`);
}

async function printVersion() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(await readFile(join(here, "../package.json"), "utf8"));
  console.log(pkg.version);
}

export async function bootstrap() {
  const { createJprot } = await import("./server.js");
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }
  if (args.includes("-v") || args.includes("--version")) {
    await printVersion();
    return;
  }

  if (args[0] === "search" || args[0] === "add") {
    const { searchCatalog, addCatalogElement, resolveCatalogUrl, catalogHelp } = await import("./catalog.js");
    const fromIdx = args.indexOf("--from");
    const projectRoot = resolve(process.cwd());
    const catalogUrl = await resolveCatalogUrl({ projectRoot, from: fromIdx >= 0 ? args[fromIdx + 1] : undefined });
    if (!catalogUrl) {
      console.error("  \u2716 no catalog URL configured.");
      for (const l of catalogHelp()) console.error(l);
      process.exitCode = 1;
      return;
    }
    if (args[0] === "search") {
      const query = args[1];
      try {
        const { items, meta } = await searchCatalog({ catalogUrl: catalogUrl, query });
        console.log(`  ${items.length} element(s)` + (query ? ` for "${query}"` : "") + ` — catalog v${meta.version || "?"} (${catalogUrl})`);
        console.log("");
        for (const e of items) {
          const tags = (e.tags || []).slice(0, 3).join(", ");
          console.log(`    ${e.name.padEnd(18)} ${String(e.category || '').padEnd(14)} ${tags}`);
        }
        console.log("");
        console.log("  Install one with:  jprot add <Name>");
      } catch (err) {
        console.error(`  \u2716 ${err.message}`);
        process.exitCode = 1;
      }
      return;
    }
    const name = args[1];
    if (!name || !/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      console.error("  Usage: jprot add <ComponentName>   e.g. jprot add SplitHero");
      process.exitCode = 1;
      return;
    }
    try {
      const installed = await addCatalogElement({ projectRoot, catalogUrl: catalogUrl, name });
      console.log(`  \u2714 Installed ${installed.name} → ${installed.file}`);
      console.log(`     Use it as a section: { component: '${installed.name}' } or inline: :::${installed.name}`);
    } catch (err) {
      console.error(`  \u2716 ${err.message}`);
      process.exitCode = 1;
    }
    return;
  }

  if (args[0] === "export" || args.includes("--export")) {
    const { exportSite } = await import("./export.js");
    const outIdx = args.indexOf("--out");
    const outDir = outIdx >= 0 ? args[outIdx + 1] : undefined;
    const baseIdx = args.indexOf("--base-path");
    const basePath = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
    const dest = await exportSite({ outDir, basePath });
    console.log(`  Exported site to: ${dest}`);
    return;
  }

  if (args.includes("lint")) {
    const { runLint } = await import("./lint.js");
    const code = await runLint({});
    process.exitCode = code;
    return;
  }

  if (args[0] === "init") {
    const { scaffoldSite } = await import("./scaffold.js");
    const type = args.find((a) => ["--portfolio", "--docs", "--resume"].includes(a))?.replace("--", "") || "portfolio";
    await scaffoldSite({ type });
    console.log("");
    console.log("  \u2714 Site scaffolded into the current folder.");
    console.log("     Run `jprot` to preview, `jprot new post \"My First Post\"` to add content.");
    console.log("     (Fresh folder? `npm create jprot` scaffolds and installs in one step.)");
    console.log("");
    return;
  }

  if (args[0] === "new") {
    const { scaffoldNew } = await import("./scaffold.js");
    const kind = args[1];
    const title = args[2];
    const draft = args.includes("--draft");
    const tIdx = args.indexOf("--template");
    const template = tIdx >= 0 ? args[tIdx + 1] : undefined;
    try {
      const file = await scaffoldNew({ kind, title, draft, template });
      console.log(`  \u2714 Created ${file}`);
    } catch (err) {
      console.error(`  \u2716 ${err.message}`);
      process.exitCode = 1;
    }
    return;
  }

  if (args[0] === "g" || args[0] === "generate") {
    const { componentPaletteList } = await import("./scaffold.js");
    if (args[1] === "list") {
      console.log("  Component templates:");
      for (const t of componentPaletteList()) console.log(`    ${t.id.padEnd(9)} ${t.desc}`);
      return;
    }
    if (args[1] === "component") {
      const { scaffoldComponent } = await import("./scaffold.js");
      const name = args[2];
      const pIdx = args.indexOf("--palette");
      const palette = pIdx >= 0 ? args[pIdx + 1] : "section";
      const fIdx = args.indexOf("--format");
      const format = fIdx >= 0 ? args[fIdx + 1] : "js";
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name || "")) {
        console.error("  \u2716 component name must start with a letter and contain only letters/digits");
        process.exitCode = 1;
        return;
      }
      if (!/^(js|md)$/.test(format)) {
        console.error("  \u2716 unknown format \"" + format + "\" (js | md)");
        process.exitCode = 1;
        return;
      }
      const paletteIds = componentPaletteList().map((t) => t.id);
      if (!paletteIds.includes(palette)) {
        console.error(`  \u2716 unknown palette "${palette}" (${paletteIds.join(" | ")})`);
        process.exitCode = 1;
        return;
      }
      try {
        const file = await scaffoldComponent({ palette, name, format });
        console.log(`  \u2714 Created component ${file}`);
        console.log("     Use it as a section: { component: '" + name + "', title: '…' } or inline: :::" + name + " title=\"…\"");
      } catch (err) {
        console.error(`  \u2716 ${err.message}`);
        process.exitCode = 1;
      }
      return;
    }
    console.error("  Usage: jprot g component <Name> [--palette section|cards|cta|stats] [--format js|md] | jprot g list");
    process.exitCode = 1;
    return;
  }

  // Anything that is not a known subcommand, a flag, or a positional port
  // number is a typo — do not silently start the dev server.
  const unknown = args[0];
  if (unknown && !unknown.startsWith("-") && !/^\d+$/.test(unknown)) {
    console.error(`  \u2716 unknown command "${unknown}"`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  const portFlagIdx = args.indexOf("--port");
  const portFlag = portFlagIdx >= 0 ? args[portFlagIdx + 1] : undefined;
  const portArg =
    Number(args.find((a) => /^\d+$/.test(a)) ?? portFlag ?? process.env.PORT ?? 4114);
  const host = process.env.HOST ?? "127.0.0.1";
  const prod = args.includes("--prod");
  const noWatch = args.includes("--no-watch") || process.env.NO_WATCH === "1" || prod;

  const port = Number.isFinite(portArg) && portArg > 0 ? portArg : 4114;
  const allowEmbed = args.includes("--allow-embed");
  const app = await createJprot({
    port,
    host,
    watch: !noWatch,
    prod,
    allowEmbed,
  });
  const actualPort = await app.listen(port);
  const url = originFor(host, actualPort);

  console.log("");
  console.log("  ╭──────────────────────────────╮");
  console.log("  │        JPROT — Portfolio     │");
  console.log("  ╰──────────────────────────────╯");
  console.log("");
  console.log(`   Running locally at: ${url}`);
  console.log(`   Production mode: ${prod ? "yes" : "no"}`);
  console.log(`   Watching for file changes: ${noWatch ? "disabled" : "yes"}`);
  console.log(`   Embedding in iframes: ${allowEmbed ? "allowed" : "blocked"}`);
  console.log(`   Press Ctrl+C to stop`);
  console.log("");
}

// Only runs when cli.js is invoked directly (also works through npm's
// bin symlinks, where import.meta.url resolves past the symlink).
function isMainModule() {
  const argv1 = process.argv[1]
  if (!argv1) return false
  try {
    return pathToFileURL(resolve(realpathSync(argv1))).href === import.meta.url
  } catch {
    return false
  }
}

if (isMainModule()) {
  await bootstrap();
}
