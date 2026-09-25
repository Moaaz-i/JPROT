import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { contentPathToUrl } = require("./urls.js");

const CONTENT = "/site/content";

test("contentPathToUrl maps files to clean page URLs", () => {
  assert.equal(contentPathToUrl(CONTENT, join(CONTENT, "index.md")), "/");
  assert.equal(
    contentPathToUrl(CONTENT, join(CONTENT, "blog", "post.md")),
    "/blog/post",
  );
  assert.equal(
    contentPathToUrl(CONTENT, join(CONTENT, "getting-started", "index.md")),
    "/getting-started",
  );
  assert.equal(
    contentPathToUrl(CONTENT, join(CONTENT, "projects", "deep", "nested.md")),
    "/projects/deep/nested",
  );
});

test("contentPathToUrl excludes the 404 page and non-markdown", () => {
  assert.equal(contentPathToUrl(CONTENT, join(CONTENT, "404.md")), null);
  assert.equal(contentPathToUrl(CONTENT, join(CONTENT, "robots.txt")), null);
  assert.equal(contentPathToUrl(CONTENT, "/elsewhere/x.md"), null);
  assert.equal(contentPathToUrl(CONTENT, "/elsewhere/index.md"), null);
});

test("contentPathToUrl handles Windows separators", () => {
  assert.equal(
    contentPathToUrl("C:\\site\\content", "C:\\site\\content\\blog\\post.md"),
    "/blog/post",
  );
});