---
title: Basic configuration
description: Configure site identity, navigation, layouts, SEO, labels, and Markdown behavior.
order: 4
nav: Configure
---

All site-wide settings live in a single file at the project root:
**`jprot.config.js`** (or `jprot.config.json` if you prefer JSON).

## Minimum settings

```js
export default {
  title: 'My site',                // name shown in the brand and browser tab
  tagline: 'Designer & developer', // subtitle under the homepage headline
  description: 'A short sentence for search engines and link previews.',
  url: 'https://example.com',      // set before publishing
  author: 'Your Name',
  email: 'you@example.com',
}
```

> [!IMPORTANT]
> `url` drives the sitemap, RSS feed, and Open Graph link previews. It may be
> left empty during development; set your real address before publishing.

## A full example

```js
export default {
  // --- Site identity ---
  title: 'JPROT',
  tagline: 'A fully customizable site generator with no build step.',
  description: 'SEO description used in <meta name="description">.',
  lang: 'en',
  dir: 'ltr',
  url: 'https://jprot.dev',        // canonical base for sitemap/OG/RSS
  author: 'Jane Dev',
  email: 'hello@example.com',
  themeColor: '#4f46e5',

  // --- SEO / discovery enhancements ---
  ogImage: 'https://jprot.dev/img/og.png',  // explicit override; else auto SVG
  logo: '/img/logo.svg',                    // → Organization.logo + og:logo
  searchUrl: 'https://jprot.dev/search?q={search_term_string}',
  twitter: '@jprot',                        // → twitter:site
  ogLocale: 'en_US',                        // default: site.lang
  sameAs: ['https://github.com/jprot', 'https://x.com/jprot'],
  alternateLangs: [{ lang: 'ar', url: 'https://jprot.dev/ar/' }],

  // --- Homepage hero (used by the default Home component) ---
  hero: {
    title: 'JPROT',
    subtitle: 'Write Markdown. Customize everything.',
    avatar: '/img/avatar.png',
    links: [
      { label: 'Docs', url: '/getting-started' },
      { label: 'GitHub', url: 'https://github.com' },
    ],
  },

  // --- Sections ---
  projectsTitle: 'Selected Work',
  footerText: '© 2026 JPROT — Built with JPROT',

  // --- Content folders (defaults) ---
  projectsDir: 'projects',
  blogDir: 'blog',

  // --- Default layouts ---
  homeLayout: 'Home',
  defaultLayout: 'Page',

  // --- UI labels (all built-in text is overridable; for i18n) ---
  labels: {
    all: 'All',
    liveDemo: 'Live demo',
    source: 'Source',
    details: 'Details',
    noPosts: 'No posts yet.',
    searchPlaceholder: 'Search pages, posts, tags...',
    searchEmpty: 'No results',
    onThisPage: 'On this page',
    printResume: 'Download / Print',
    resumeExperience: 'Experience',
    resumeEducation: 'Education',
    resumeSkills: 'Skills',
    pageNotFound: 'Page not found',
    backToHome: 'Back to',
    home: 'Home',
    projects: 'Projects',
    blog: 'Blog',
  },

  // --- Homepage sections (composed from reusable components) ---
  sections: [
    {
      component: 'Stats',
      items: [
        { value: '15+', label: 'Projects shipped' },
      ],
    },
    {
      component: 'Skills',
      title: 'Skills',
      items: [
        { name: 'JavaScript', level: 90 },
        'Node.js', // plain strings default to level 80
      ],
    },
    {
      component: 'Experience',
      title: 'Experience',
      items: [
        { title: 'Senior Dev', company: 'Acme', period: '2022 — Now', description: 'What I did.' },
      ],
    },
    {
      component: 'Testimonials',
      title: 'Testimonials',
      items: [
        { text: 'Quote…', name: 'Sarah', role: 'Manager' },
      ],
    },
    {
      component: 'Contact',
      title: 'Contact',
      email: 'hello@example.com',
      social: [{ label: 'GitHub', url: 'https://github.com/you' }],
    },
    {
      component: 'Gallery',
      title: 'Gallery',
      items: [{ src: '/img/shot.png', alt: 'Screenshot' }],
    },
  ],

  // --- Extra tags injected into <head> ---
  head: `<link rel="icon" href="/favicon.ico">`,

  // --- Custom navigation (optional, overrides auto-generated nav) ---
  nav: [
    { label: 'Home', url: '/' },
    { label: 'About', url: '/about' },
  ],

  // --- Markdown parser options (all enabled by default) ---
  markdown: {
    inline: true,
    headings: true,
    lists: true,
    table: true,
    code: true,
    blockquote: true,
    hr: true,
    links: true,
    images: true,
    emphasis: true,
    footnotes: true,
    autolinks: true,
    taskLists: true,
  },
}
```

## All options

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | string | — | Site name (shown in the brand and `<title>`) |
| `tagline` | string | — | Short site tagline |
| `description` | string | — | Meta description for SEO |
| `lang` | string | `'en'` | `<html lang>` attribute |
| `dir` | string | `'ltr'` | Text direction (`'ltr'` or `'rtl'`) |
| `url` | string | — | Canonical site URL (for sitemap, Open Graph, RSS, canonical tags) |
| `basePath` | string | — | Static export prefix for project sites, e.g. `/REPOSITORY` (folded into exported URLs and `manifest.json`) |
| `docs` | boolean | `false` | Enable docs navigation: breadcrumbs, sidebar reading order, previous/next links |
| `catalogUrl` | string | — | Base URL of the element catalog for `jprot add` / `jprot search` |
| `author` | string | — | Author name for JSON-LD `Person` |
| `avatar` | string | — | Site-wide avatar image path (served from `public/`); `hero.avatar` overrides it on the homepage |
| `email` | string | — | Contact email (mailto fallback in the `Contact` component) |
| `themeColor` | string | `#4f46e5` | PWA manifest + favicon + OG base color |
| `ogImage` | string | — | Explicit `og:image` URL (overrides the auto-generated SVG) |
| `ogColor` | string | `#4f46e5` | Background color of the auto-generated OG image |
| `ogTextColor` | string | `#ffffff` | Text color of the auto-generated OG image |
| `logo` | string | — | Logo path → JSON-LD `Organization.logo` + `og:logo` |
| `searchUrl` | string | — | Search endpoint → JSON-LD `SearchAction` (opt-in, e.g. `https://example.com/search?q={search_term_string}`) |
| `twitter` | string | — | Twitter handle (`@handle`) → `twitter:site` |
| `ogLocale` | string | `lang` | `og:locale` value |
| `sameAs` | string[] | — | Social profile URLs → JSON-LD `sameAs` |
| `alternateLangs` | array | — | `[{ lang, url }]` → `<link rel="alternate" hreflang>` bridges |
| `icon` | string | — | Icon path for the PWA manifest |
| `hero.title` | string | — | Homepage hero title |
| `hero.subtitle` | string | — | Homepage hero subtitle |
| `hero.badge` | string | — | Optional pill above the title (e.g. `'Available for new projects'`) |
| `hero.avatar` | string | — | Avatar image path (served from `public/`) |
| `hero.links` | array | — | List of `{ label, url }` hero buttons |
| `projectsTitle` | string | `'Projects'` | Homepage projects section heading |
| `projectsDir` | string | `'projects'` | Folder in `content/` holding project posts |
| `blogDir` | string | `'blog'` | Folder in `content/` holding blog posts |
| `homeLayout` | string | `'Home'` | Component used for the homepage layout |
| `defaultLayout` | string | `'Page'` | Component used for regular pages |
| `labels` | object | built-ins | Override every built-in UI string (for i18n) |
| `sections` | array | — | Homepage sections; each `{ component, ...props }` maps to a component |
| `sidebar` | boolean | `true` | Show the docs sidebar on regular pages |
| `showNav` | boolean | `true` | Show the nav links in the header (brand stays) |
| `themePicker` | boolean | `true` | Show the ◈ theme-variant cycle button in the header |
| `formspree` | string | — | Formspree endpoint; enables the AJAX contact form |
| `social` | array | — | Alternate social links read by the sample Footer |
| `footerText` | string | — | Footer text (overrides the default year) |
| `head` | string | — | Raw HTML injected into `<head>` |
| `nav` | array | auto | Overrides the automatic navigation |
| `markdown` | object | all on | Toggle individual Markdown features |
| `themes` | array | built-ins | Theme variants offered by the picker/cycle button |
| `lint` | object | — | `{ ignore: string[] }` — globs of Markdown files `jprot lint` skips |
| `plugins` | string[] | — | Plugin specifiers to run on every state build, e.g. `['./plugins/analytics.js']` (see [Plugins](customization.md#13-plugins)) |

## Validating your config

`jprot.d.ts` gives you autocomplete and type errors in the editor. `jprot check`
gives you the same validation in CI, with file and line:

```bash
jprot check          # exits 1 on any error
jprot check --strict # warnings count as errors too
```

```
✖ check: 1 error(s) in /path/jprot.config.js
  jprot.config.js:12  sections[0].component  no component named "Herro" — available: Hero, Skills
```

It validates the config against the schema **and** resolves the things a schema
cannot know: that every `sections[].component` names a component that actually
exists (including one added by a plugin), and that every entry in `plugins: [...]`
resolves, imports, and completes `setup()`.

Run it before `jprot lint`. `check` reads configuration; `lint` reads every
content file and resolves every link against the real site. A broken config
makes every other check meaningless.

## Plugins

`plugins` lists files to run before each state build. Each one exports a
`setup(jprot)` function:

```js
export default {
  plugins: [
    './plugins/analytics.js',   // a file in this project
    'jprot-plugin-rss',         // an installed package
  ],
}
```

A plugin may add components, serve its own routes, extend Markdown, and
subscribe to build/render hooks — and nothing else. A plugin that throws is
reported and skipped without taking the site down, but a plugin that is
half-applied is never possible: everything a plugin registers is committed only
after `setup()` returns.

`jprot check` runs every plugin's `setup()` and fails if any of them throws, so a
broken plugin is a red build rather than a blank page. Full guide in
[Plugins](customization.md#13-plugins).

## Silence the linter

`jprot lint` is **site-aware** — it reads your site through the same Content
Graph the server uses, so every check is resolved against pages that actually
exist rather than against a file listing. It checks frontmatter, internal links
and `#anchor` targets, image alt text, unreachable pages, duplicate heading
anchors, SEO metadata, navigation ordering, section components, and asset paths.

Two ways to opt a file out.

**1. Glob patterns in the config** — skip exact files or whole groups:

```js
export default {
  lint: {
    ignore: [
      'old-notes.md',     // that exact file
      'projects/legacy/*.md', // every file in one folder
      'archive/**',       // a whole folder tree, recursively
    ],
  },
}
```

Patterns are matched against the Markdown path relative to the project root
(`content/` is omitted, and the `.md` suffix is optional). `*` never crosses a
folder boundary; `**` matches across folders.

**2. Per-file frontmatter** — opt a single page out from the file itself:

```yaml
---
title: Redirected post
lint: false
---
```

Use these for content that is intentionally stale, machine-generated, or a
mirror of an external post — everything else stays covered by the checks.

## Labels: every built-in text is overridable

All visible UI strings come from `site.labels`. Leave a key out and the
built-in value is used — this is how you translate the UI or match your own
voice without touching a component:

```js
labels: {
  all: 'Toutes',
  details: 'Voir plus',
  searchPlaceholder: 'Rechercher...',
  onThisPage: 'Sur cette page',
  resumeExperience: 'Expérience',
}
```

### Complete key list

| Key | Default | Where it appears |
|---|---|---|
| `all` | `All` | Project/category filters |
| `liveDemo` | `Live demo` | Project card links |
| `source` | `Source` | Project card links |
| `details` | `Details` | Project pages |
| `noPosts` | `No posts yet.` | Empty blog listing |
| `searchPlaceholder` | `Search pages, posts, tags...` | Search input |
| `searchEmpty` | `No results` | Empty search results |
| `onThisPage` | `On this page` | Sidebar "On this page" heading |
| `printResume` | `Download / Print` | Resume layout button |
| `resumeExperience` | `Experience` | Resume layout heading |
| `resumeEducation` | `Education` | Resume layout heading |
| `resumeSkills` | `Skills` | Resume layout heading |
| `pageNotFound` | `Page not found` | 404 page title |
| `backToHome` | `Back to` | 404 page home link |
| `home` | `Home` | Home label |
| `projects` | `Projects` | Projects heading | 
| `blog` | `Blog` | Blog heading |

Any key you omit falls back to its built-in value; any extra key you add is
ignored (unknown keys never break the server).

## Custom 404 page

Drop a `content/404.md` file and JPROT serves it (with the full layout, header,
sidebar, theme) any time a URL does not resolve — while still returning the
correct `404` status:

```yaml
---
title: Not found
restyle: true
---
# Oops, lost?

Try the [homepage](/).
```

Without that file, a plain branded 404 is generated (labels `pageNotFound` and
`backToHome`).

## Sections: the portfolio builder

`site.sections` is an array of **section definitions**. Each one names a
component (built-in or your own override) and receives the rest of the object
as props:

```js
sections: [
  { component: 'Skills', title: 'Skills', items: [{ name: 'JS', level: 90 }] },
  { component: 'Contact', title: 'Contact', email: 'me@example.com' },
]
```

They render on the homepage **after** the hero, page content and projects
(their order = array order). Remove them all to keep a minimal page.

Built-in portfolio components:

| Component | Props | Renders |
|---|---|---|
| `Stats` | `items: [{ value, label }]` | Number strip |
| `Skills` | `items: ['Node'] \| [{ name, level }]` | Animated skill bars |
| `Experience` | `items: [{ title, company, period, description }]` | Timeline list |
| `Education` | `items: [{ title, school, period, description }]` | Timeline list |
| `Services` | `items: [{ icon, title, description, link }]` | Service cards |
| `Awards` | `items: [{ year, title, org, description }]` | Award list |
| `Clients` | `items: [{ name, url, logo }]` | Client/partner tiles |
| `Testimonials` | `items: [{ text, name, role }]` | Quote cards |
| `Gallery` | `items: [{ src, alt }]` | Image grid |
| `Contact` | `email`, `social: [{ label, url }]` | Contact bar |
| `CTA` | `title`, `text`, `label`, `url` | Call-to-action banner |

Any of these can be overridden by putting a component with the same name in
`theme/components/`.

You can also add sections to a *single page* from frontmatter — list them in the
page's YAML header (component props like `items` must then be written as YAML):

```yaml
---
title: About
sections:
  - component: Skills
    items:
      - name: JS
        level: 90
---
```

Their order follows the list. To move the whole area elsewhere (or remove it
from non-home pages), replace the `Home`/`Page` component — see
[Customization](customization.md#3-replace-a-component-full-layout-control).

## Using JSON instead of JS

JPROT also accepts a `jprot.config.json`:

```json
{
  "title": "JPROT",
  "tagline": "A fully customizable site generator.",
  "lang": "en"
}
```

The JS version is recommended because it allows dynamic values and a `head` template string.

## Startup hints (catches mistakes as you type)

When the server boots it double-checks two common mistakes and prints warnings
in the terminal instead of failing silently:

- A `sections[].component` that doesn't exist — with the list of components
  that *are* available:

  ```
  [jprot] section "NoSuchThing" (Hi) — no component named "NoSuchThing" found.
          Available: Awards, Blog, CTA, Clients, Contact, Education, Experience, ...
  ```

- A config key that looks like a typo — with a did-you-mean suggestion:

  ```
  [jprot] config key "titll" not recognized — did you mean "title"?
  ```

## Drafts & production

Set `draft: true` on any page while you're still writing it: it disappears from
the navigation, sitemap, search index, RSS feeds and static exports, and returns
`404` in production. The dev server keeps it reachable at its URL so you can
preview it. `jprot new post "Title" --draft` creates a draft for you.

Next: [Customize your site](customization.md).