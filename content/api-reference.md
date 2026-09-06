---
title: API reference
description: Use JPROT programmatically from Node.js and TypeScript.
order: 8
nav: API reference
---

# API reference

JPROT exposes the same core operations used by the CLI. The package is
dependency-free and supports Node.js 18 or newer.

```js
import { createJprot, exportSite, runLint } from 'jprot'

const app = await createJprot({
  root: process.cwd(),
  port: 3000,
  watch: true,
})

await app.listen(3000)
```

## Main functions

| Function | Result |
|---|---|
| `createJprot(options)` | Creates a server app with `listen`, `reload`, and `closeWatcher` |
| `renderPage(options)` | Renders a page with the active theme components |
| `exportSite(options)` | Exports a production site and returns its output directory |
| `runLint(options)` | Runs content checks and returns `0` or `1` |
| `scaffoldSite(options)` | Creates a starter project |
| `scaffoldNew(options)` | Creates a post, page, project, or resume |
| `scaffoldComponent(options)` | Creates a component override |

Full parameter and return types are available in
[`jprot.d.ts`](https://github.com/Moaaz-i/JPROT/blob/main/jprot.d.ts). Add this
JSDoc comment to a config file for editor completion:

```js
/** @type {import('jprot').JprotConfig} */
export default {
  title: 'My site',
}
```

For component props and extension examples, see
[Customize your site](customization.md).
