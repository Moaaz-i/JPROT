# JPROT for Visual Studio Code

Modern editor tooling for **JPROT** — the zero-build portfolio site generator. This
extension brings a live side-by-side preview, JPROT-specific Markdown highlighting
and snippets straight into your editor, while staying true to JPROT's philosophy:
**no build step, no bundled runtime, no dependencies**.

It never re-implements JPROT. It drives *your project's own* jprot server
(`node_modules/jprot/core/cli.js`, or the repository checkout), so the preview is
byte-for-byte what your visitors see — SSR, hot reload, SPA navigation, search,
themes — all of it.

## Features

### 🔴 Live side-by-side preview

The **JPROT** activity-bar panel embeds your site's dev server in a frame:

- follows the Markdown file you're editing (`blog/post.md` ⇄ `/blog/post`)
- **re-renders on save** — save, look, ship
- status-bar entry with the running URL, one click to open your browser
- dev mode by default (drafts visible); flip to production via the
  `jprotVscode.prod` setting

### 🎨 JPROT Markdown highlighting

A scoped TextMate grammar makes the pieces that are *JPROT* stand out:

- `---` YAML **frontmatter** with its jprot keys (`title`, `date`, `tags`,
  `image`, `draft`, `hidden`, `order`, `nav`, …)
- `:::Component` **shortcodes** — open, self-closing and close fences, with their
  `key="value"` attributes
- `[value]` placeholders in Markdown components

Markdown itself keeps its native theme highlighting — the grammar injects on top.

### ⚡ Snippets

Type `jprot-` to insert ready-made blocks:

| Prefix | What you get |
| --- | --- |
| `jprot-page` | standard page frontmatter |
| `jprot-post` | blog post (date, tags, image, …) |
| `jprot-project` | portfolio project entry |
| `jprot-resume` | printable resume entry |
| `jprot-draft` / `jprot-hidden` | pre-privatized pages |
| `jprot-shortcode` | a `:::Component` block |
| `jprot-md-component` | a Markdown component with `[value]` body |

In `jprot.config.js` (`javascript` files): `jprot-config`, `jprot-section`,
`jprot-nav`.

### 🧭 Commands

- **JPROT: Start dev server** — boots the project's jprot server on a free port
- **JPROT: Stop dev server**
- **JPROT: Open current page in browser**
- **JPROT: Refresh preview**

The editor title bar and the preview view toolbar put the most useful ones one
click away.

## Getting started

1. Open the folder of a JPROT project (any folder with a `content/` directory
   and `jprot.config.js`). No project yet?

   ```bash
   npm create jprot@latest
   ```

2. Open the **JPROT** activity-bar panel (or run **JPROT: Start dev server**).
3. Open a Markdown file from `content/` — the preview follows it.

The dev server starts automatically on workspace open by default
(`jprotVscode.autoStart`).

## Requirements

- **Visual Studio Code** ≥ 1.85
- **jprot** installed in the workspace (`npm install -D jprot`) — the extension
  locates it in `node_modules/`; opening the JPROT repository itself also works
  (it falls back to `core/cli.js`).
- Node.js ≥ 18 (whatever you use for jprot)

## Security note

JPROT locks down framing by default (`X-Frame-Options: DENY` +
`frame-ancestors 'none'` + `Cross-Origin-Resource-Policy: same-origin`), so the
preview lets the site be embedded **only** while you preview: the panel boots
your project's dev server with the explicit `--allow-embed` flag, which relaxes
those three framing headers and keeps every other security header intact.
Production/export output is never affected, and ordinary `jprot` runs remain
fully locked down unless you pass the flag yourself.

## Extension settings

| Setting | Default | Description |
| --- | --- | --- |
| `jprotVscode.autoStart` | `true` | Start the server when the workspace opens |
| `jprotVscode.prod` | `false` | Serve in production mode (drafts hidden, immutable caching) |
| `jprotVscode.autoRefresh` | `true` | Re-render the preview on save / editor switch |

## Development

The extension is dependency-free CommonJS on purpose — there is **no build step
for the extension either**:

```bash
npm test                # node --test (unit + real-server integration tests)
npm install             # installs @vscode/vsce (dev-only)
npm run package         # produces jprot-vscode-0.1.0.vsix
```

To try it locally: open this `jprot-vscode/` folder in VSCode, press `F5`
(Run Extension), then open a JPROT project in the Extension Development Host.

## Publishing

`npm run publish` (via `@vscode/vsce`) publishes to the Marketplace under the
`moaaz-i` publisher; the same package can be published to Open VSX. Set your
`VSCE_PAT` before running. This is intentionally outside the npm CI — the
extension lives on the Marketplace, not on npm.

## License

MIT — see [LICENSE](LICENSE).