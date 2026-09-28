"use strict";

// JPROT for VS Code is a grammar and snippet extension: it has no runtime
// behaviour, so there is nothing to run. The file stays (with `main` in
// package.json) because a handful of VS Code versions warn about an extension
// with no activation entry point. It does nothing.
//
// Historical note, recorded so it is not rediscovered as a mystery: 0.1.0
// shipped a live side-by-side preview whose server was spawned with
// `process.execPath` and no `ELECTRON_RUN_AS_NODE=1`. Inside VS Code
// `process.execPath` is the Code/Electron binary, so the extension launched
// the Editor with the CLI path as an argument instead of a Node child — the
// preview could never work. It was removed in 0.2.0 rather than half-fixed.

module.exports.activate = () => {};
module.exports.deactivate = () => {};