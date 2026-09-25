import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findFreePort, findCli, contentDirFor, startServer } = require(
  "./jprotServer.js",
);

// This repository is itself a valid JPROT project (core/cli.js + content/),
// so the real dev server can be driven end-to-end without VSCode.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("findFreePort returns a usable free port", async () => {
  const port = await findFreePort();
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
});

test("findCli resolves the repository checkout CLI", () => {
  const cli = findCli(REPO_ROOT);
  assert.ok(cli, "expected the repo's core/cli.js to be found");
  assert.equal(cli, join(REPO_ROOT, "core", "cli.js"));
});

test("contentDirFor defaults to <workspace>/content for this repo", () => {
  assert.equal(contentDirFor(REPO_ROOT), join(REPO_ROOT, "content"));
});

test("startServer boots the real server, parses the URL and stops", async () => {
  const port = await findFreePort();
  let handle = null;
  const url = await new Promise((resolveP, reject) => {
    const result = startServer({
      workspace: REPO_ROOT,
      port,
      onReady: resolveP,
      onExit: () => {},
    });
    if ("error" in result) {
      reject(new Error(result.error));
      return;
    }
    handle = result;
  });
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await fetch(url + "/sitemap.xml")).status, 200);
    assert.equal((await fetch(url + "/")).status, 200);
    // the preview server is started with --allow-embed: framing must be
    // possible (no X-Frame-Options: DENY, frame-ancestors relaxed)
    const home = await fetch(url + "/");
    assert.equal(home.headers.get("x-frame-options"), null);
    const csp = home.headers.get("content-security-policy") || "";
    assert.match(csp, /frame-ancestors/);
    assert.doesNotMatch(csp, /frame-ancestors 'none'/);
  } finally {
    if (handle) handle.stop();
  }
});