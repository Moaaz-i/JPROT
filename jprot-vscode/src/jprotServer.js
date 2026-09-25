"use strict";

const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const path = require("path");

/**
 * Development-server lifecycle for the extension. The extension never bundles
 * JPROT: it drives the project's own install (or the repo checkout), keeping
 * this extension dependency-free and the runtime zero-dependency philosophy
 * intact. Everything here is testable without VSCode.
 */

/**
 * Find a free TCP port on 127.0.0.1 (the CLI would clamp `--port 0` to 4114,
 * so the extension reserves a port itself).
 * @returns {Promise<number>}
 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Locate the jprot CLI to run, in priority order:
 *   1. the project's own install: <workspace>/node_modules/jprot/core/cli.js
 *   2. the repository checkout:   <workspace>/core/cli.js
 * @param {string} workspace
 * @returns {string | null}
 */
function findCli(workspace) {
  const candidates = [
    path.join(workspace, "node_modules", "jprot", "core", "cli.js"),
    path.join(workspace, "core", "cli.js"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/**
 * Resolve the Content directory for a workspace. JPROT defaults to
 * <root>/content; the config may override it, so peek at jprot.config if parseable.
 * @param {string} workspace
 * @returns {string}
 */
function contentDirFor(workspace) {
  const configPath = path.join(workspace, "jprot.config.js");
  const configPathJson = path.join(workspace, "jprot.config.json");
  try {
    if (fs.existsSync(configPathJson)) {
      const cfg = JSON.parse(fs.readFileSync(configPathJson, "utf8"));
      if (typeof cfg.contentDir === "string") return path.resolve(workspace, cfg.contentDir);
    }
  } catch {
    /* unreadable config — fall back to the default */
  }
  void configPath; // ESM jprot.config.js is not safely requireable here
  return path.join(workspace, "content");
}

/**
 * Start the JPROT dev server for a workspace.
 * @param {object} options
 * @param {string} options.workspace project root (server cwd)
 * @param {number} options.port     reserved free port
 * @param {boolean} [options.prod]  production mode (forces --no-watch)
 * @param {(url: string) => void} [options.onReady] called once the banner appears
 * @param {(code: number | null) => void} [options.onExit]
 * @returns {{ child: import("child_process").ChildProcess, stop: () => void } | { error: string }}
 */
function startServer({ workspace, port, prod = false, onReady, onExit }) {
  const cli = findCli(workspace);
  if (!cli) {
    return {
      error:
        "jprot is not installed in this workspace. Install it with `npm install -D jprot`, or open a JPROT repository checkout.",
    };
  }
  const args = [cli, "--port", String(port)];
  if (prod) args.push("--prod"); // CLI forces --no-watch in prod already
  const child = spawn(process.execPath, args, {
    cwd: workspace,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buffer = "";
  let ready = false;
  const onData = (chunk) => {
    buffer += chunk.toString();
    if (!ready) {
      const match = buffer.match(/Running locally at: (https?:\/\/[^\s]+)/);
      if (match) {
        ready = true;
        onReady && onReady(match[1]);
      }
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", (code) => onExit && onExit(code));

  return {
    child,
    stop() {
      try {
        child.kill();
      } catch {
        /* already dead */
      }
    },
  };
}

module.exports = { findFreePort, findCli, contentDirFor, startServer };