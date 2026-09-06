# Examples

Everything here is a drop-in sample. Copy the file you like into your project and reload — no build step, no restart.

## themes/

Copy any file into `theme/custom.css` to instantly restyle the site:

```bash
cp examples/themes/dark-mode.css theme/custom.css
```

- `dark-mode.css` — dark color scheme.
- `neon.css` — vivid accent + glow.
- `serif.css` — editorial typography.

## components/

Copy any file into `theme/components/` to replace the default component of the same name:

```bash
cp examples/components/Header.js theme/components/Header.js
```

A component named e.g. `Header.js` in `theme/components/` overrides the built-in one completely. See each file's header comments.

## config/

- `jprot.config.js` — a fuller sample config showing every option (hero, links, head, nav, markdown).

## Next steps

- Write your content in `content/` (Markdown files).
- Override the whole look via `theme/custom.css` CSS variables.
- Or write your own `theme/components/*.js` for full layout control.

See the main [README](../README.md) for details, or the in-repo docs pages:
[Customization](../content/customization.md) and [Configuration](../content/configuration.md).