// The package version, read from package.json so there is exactly one place to
// bump it.
//
// It is part of the incremental-export cache key: upgrading JPROT can change
// the rendered output (a template fix, a new meta tag), so a build produced by
// an older version must never be reused as-is.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const JPROT_VERSION = require("../package.json").version;
