# JPROT for Visual Studio Code

Markdown tooling for **JPROT** — the zero-build portfolio site generator. This
extension brings JPROT-specific Markdown highlighting and snippets into your
editor. It never re-implements JPROT and ships **no runtime code**: nothing to
start, nothing to configure, nothing to break.

## Features

### 🎨 JPROT Markdown highlighting

A scoped TextMate grammar (injected into the built-in Markdown scope,
`text.html.markdown`) makes the pieces that are *JPROT* stand out:

- `---` YAML frontmatter, embedded as YAML so keys, strings and booleans colour
  like YAML
- `:::Component` shortcode blocks
- `[value]` placeholders in templates and posts

### ✂️ Snippets

Runnable in Markdown and JavaScript files where it matters:

| Prefix | Inserts |
| --- | --- |
| `jprot-page` | Page frontmatter (`title`, `nav`, `order`, …) |
| `jprot-post` | Blog post frontmatter (with `date`, `draft`) |
| `jprot-project` | Project frontmatter |
| `jprot-resume` | Resume frontmatter |
| `jprot-draft` | Hide a page as a draft (`draft: true`) |
| `jprot-hidden` | Remove from navigation (`hidden: true`) |
| `jprot-shortcode` | A `:::Component` block |
| `jprot-md-component` | An inline component reference |
| `jprot-config` | A `jprot.config.js` skeleton |
| `jprot-section` | A portfolio section entry |
| `jprot-nav` | Navigation settings in `jprot.config.js` |

## Getting started

1. Install from the Marketplace, or build and install the VSIX from this
   folder:

   ```bash
   npm run package            # produces jprot-vscode-<version>.vsix
   code --install-extension jprot-vscode-*.vsix
   ```

2. Open any JPROT project — highlighting applies to Markdown files and
   `jprot.config.js`, and the snippets are one `jprot-…` tab away.

## Requirements

- **Visual Studio Code** ≥ 1.85

## Release history

See [CHANGELOG.md](CHANGELOG.md). Up to 0.1.0 this extension shipped a live
preview panel; it could not work inside VS Code and was removed in 0.2.0 — the
changelog records why.

## Development

```bash
npm test        # parses the grammar and snippets — the whole product
npm run package # build the VSIX
```