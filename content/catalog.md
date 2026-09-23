---
title: Catalog elements
description: How to install ready-made components into your site with jprot add.
order: 7
nav: Catalog elements
---

JPROT ships a small, opinionated core of components. For everything else there
is the **element catalog** — a library of ready-made, self-contained components
(hero sections, cards, forms, testimonial grids, CTAs, and more) that you pull
into your site on demand.

An element is a single JavaScript file. Your site treats it exactly like a
built-in component: drop it in, use it. No rebuild, no config.

## Installing an element

From your **site folder**, run:

```bash
jprot add SplitHero
```

That downloads `SplitHero` into `theme/components/SplitHero.js`. Your site
picks it up automatically on the next page load.

```
✔ Installed SplitHero → theme/components/SplitHero.js
```

Run the same command again and jprot reports it's already installed:
`✖ already installed: theme/components/SplitHero.js`.

## Using the element

### As a homepage section

Add it to the `sections:` list in `jprot.config.js`:

```js
export default {
  title: 'My site',
  sections: [
    { component: 'SplitHero', title: 'SplitHero' },
  ],
}
```

### Inside any page

On its own line in any Markdown file:

```markdown
:::SplitHero title="Ship faster" subtitle="A reusable block for every campaign."
:::
```

Each element's page in the catalog shows the props it accepts and a live
example you can copy.

## Finding elements

- **`jprot search`** — list the whole catalog.
- **`jprot search hero`** — filter by any word. Matching runs across the
  element name, its category, tags, and description.

## Where does jprot look for the catalog?

The catalog URL comes from one of these places, in order:

1. The `--from <url>` flag:

   ```bash
   jprot add SplitHero --from https://moaaz-i.github.io/jprot-catalog
   ```

2. `catalogUrl` in your site config — set it once and plain `jprot add`
   just works:

   ```js
   export default {
     catalogUrl: 'https://moaaz-i.github.io/jprot-catalog',
   }
   ```

3. If neither is set, jprot prints a clear error telling you what to configure.

A freshly scaffolded site already ships with `catalogUrl` pointing at the JPROT
Catalog, so `jprot add <Name>` needs no source at all on a new project.

If no URL is available, jprot prints what to set instead of guessing.

## Removing an element

An element is only a file — delete it and it's gone:

```bash
rm theme/components/SplitHero.js
```

## What the catalog is

The catalog is itself a JPROT site. It publishes two plain static things that
any static host can serve:

| File | Purpose |
|---|---|
| `/catalog/catalog.json` | the element index jprot reads |
| `/catalog/elements/<Name>.js` | the downloadable component source |

So a catalog is not locked to one host: GitHub Pages, Netlify, Vercel, or a
local folder all work. That's what makes `jprot add <Name> --from <url>`
portable — point jprot at any published catalog.

Keeping an element out of JPROT core keeps the framework lean; adding it takes
one command. See [Extending JPROT](customization.md) for building your own
components, and [CLI reference](cli-reference.md) for the full command list.
