/**
 * JPROT — TypeScript definitions
 * Zero-build portfolio site generator.
 *
 * Import types for full editor autocomplete in `jprot.config.js`:
 *
 *   /** @type {import('jprot').JprotConfig} *\/
 *   export default { title: 'Jane', hero: {...} }
 *
 * Or as a TS config file: `jprot.config.ts` (rename + type the export).
 */

/* ============================================================
   Site configuration (jprot.config.js)
   ============================================================ */

export interface JprotConfig {
  /** Site title, used in the brand, <title> and meta tags. */
  title?: string
  /** Short one-liner shown under the hero title. */
  tagline?: string
  /** SEO description used in meta and Open Graph. */
  description?: string
  /** Canonical site URL, e.g. https://yoursite.com (used in sitemap/feed/OG). */
  url?: string
  /** HTML lang attribute. Default 'en'. */
  lang?: string
  /** Text direction: 'ltr' | 'rtl'. Default 'ltr'. */
  dir?: string
  /** Author name, used in JSON-LD structured data. */
  author?: string
  /** Avatar image path for the hero. */
  avatar?: string
  /** Contact email, powers the mailto fallback in the Contact section. */
  email?: string
  /** PWA theme color and auto-generated favicon/OG base color. */
  themeColor?: string
  /** Explicit OG:image URL (overrides the auto-generated SVG). */
  ogImage?: string
  /** Logo path, referenced in JSON-LD and og:logo. */
  logo?: string
  /** Search endpoint template for the site's JSON-LD SearchAction (e.g. 'https://example.com/search?q={search_term_string}'). */
  searchUrl?: string
  /** Twitter handle (@handle) for twitter:site meta. */
  twitter?: string
  /** og:locale value, defaults to `lang`. */
  ogLocale?: string
  /** Social profile URLs → JSON-LD `sameAs` + Person schema. */
  sameAs?: string[]
  /** Extra page language mirrors: { lang: 'ar', url: 'https://example.com/ar/' } → hreflang links. */
  alternateLangs?: { lang: string; url: string }[]
  /** Base color for the auto-generated OG image. Default '#4f46e5'. */
  ogColor?: string
  /** Text color for the auto-generated OG image. Default '#ffffff'. */
  ogTextColor?: string
  /** Icon path for the PWA manifest. */
  icon?: string
  /** Raw HTML injected into <head> (analytics, fonts, etc). */
  head?: string
  /** Footer text; defaults to '© <year> <title>'. */
  footerText?: string
  /** Directory (under content/) holding blog posts. Default 'blog'. */
  blogDir?: string
  /** Directory (under content/) holding projects. Default 'projects'. */
  projectsDir?: string
  /** Layout component used for standalone pages. Default 'Page'. */
  defaultLayout?: string
  /** Layout component used for the homepage. Default 'Home'. */
  homeLayout?: string
  /** Show the sidebar toggle? Default true. */
  sidebar?: boolean
  /** Show nav links in the header? Default true. */
  showNav?: boolean
  /** Show the theme-variant cycle button in the header? Default true. */
  themePicker?: boolean
  /** Title for the projects section (defaults to the `projects` label). */
  projectsTitle?: string
  /** Formspree endpoint; enables the AJAX contact form. */
  formspree?: string
  /** Alternate social links, read by the sample Footer. */
  social?: { name?: string; label?: string; url: string }[]
  /** Override the automatic navigation list. */
  nav?: NavItem[]
  /** Hero block rendered on the homepage. */
  hero?: HeroConfig
  /** Site-wide sections rendered on the homepage in order. */
  sections?: SectionConfig[]
  /** Override any built-in UI string (i18n / branding). */
  labels?: Record<string, string>
  /** Theme variants to offer the theme picker / cycle button. */
  themes?: ThemeConfig[]
  /** Toggle individual Markdown features. */
  markdown?: MarkdownConfig
}

export interface NavItem {
  label: string
  url: string
  /** Optional path used for active-link highlighting. */
  path?: string
}

export interface HeroLink {
  label: string
  url: string
}

export interface HeroConfig {
  title?: string
  subtitle?: string
  avatar?: string
  links?: HeroLink[]
}

export interface SectionConfig {
  /** Name of a component to render (e.g. 'Contact', 'Skills', 'Awards'). */
  component: string
  title?: string
  subtitle?: string
  [key: string]: unknown
}

export interface ThemeConfig {
  id: string
  label?: string
  /** Swatch color for the ThemePicker indicator. */
  swatch?: string
  color?: string
}

export interface MarkdownConfig {
  tables?: boolean
  footnotes?: boolean
  highlight?: boolean
  autolinks?: boolean
  tags?: boolean
}

/* ============================================================
   Content frontmatter
   ============================================================ */

export interface PageFrontmatter {
  title?: string
  layout?: string
  description?: string
  subtitle?: string
  excerpt?: string
  tags?: string[]
  date?: string
  /** Freeze the modified date in sitemap lastmod (else git/mtime). */
  lastmod?: string
  /** Override the canonical URL (any absolute URL wins over site.url + path). */
  canonical?: string
  /** Top-of-page image → og:image / twitter:image / sitemap image. */
  image?: string
  /** Draft: hidden from sitemap/search/RSS/nav; 404 in production/export; dev preview only. */
  draft?: boolean
  /** Hide the page from search engines (robots noindex,nofollow). */
  noindex?: boolean
  order?: number
  nav?: string
  hidden?: boolean
  sidebar?: boolean
  cover?: string
  demo?: string
  repo?: string
  formspree?: string
  email?: string
  author?: string
  hero?: HeroConfig
  sections?: SectionConfig[]
  [key: string]: unknown
}

/* ============================================================
   Component props
   ============================================================ */

/** Props passed to every component function. */
export interface ComponentProps {
  site: JprotConfig
  page?: PageData
  nav?: NavItem[]
  content?: string
  projects?: ProjectData[]
  posts?: PostData[]
  sectionsHtml?: string
  /** Rendered Markdown of a `:::Name … :::` shortcode body (nested). */
  children?: string
  [key: string]: unknown
}

/* ============================================================
   Programmatic API
   ============================================================ */

export interface JprotOptions {
  /** Project root (defaults to process.cwd()). */
  root?: string
  /** Port to listen on (default 4114). */
  port?: number
  /** Host to bind (default 127.0.0.1). */
  host?: string
  /** Enable file watcher (default true). */
  watch?: boolean
  /** Production mode: immutable asset caching, drafts hidden. */
  prod?: boolean
  /** Inline config object or loader function. */
  config?: Record<string, unknown> | (() => Promise<Record<string, unknown>>)
  /** Content directory (defaults to <root>/content). */
  contentDir?: string
  /** Public/static assets directory (defaults to <root>/public). */
  publicDir?: string
}

export function exportSite(options?: { root?: string; outDir?: string }): Promise<string>

export function runLint(options?: { root?: string }): Promise<number>

/* ============================================================
   Scaffolding API (also exposed as the `jprot` CLI commands)
   ============================================================ */

/** Site types offered by `jprot init`. */
export type SiteType = 'portfolio' | 'docs' | 'resume'

/**
 * Scaffold a brand-new site into `root` (defaults to process.cwd()).
 * Writes jprot.config.js, the content/ skeleton, theme/custom.css and
 * editor snippets. Never overwrites existing files.
 * CLI: `jprot init [--portfolio | --docs | --resume]`.
 */
export function scaffoldSite(options?: { root?: string; type?: SiteType }): Promise<string>

/** Content kinds accepted by `jprot new`. */
export type NewKind = 'post' | 'blog' | 'page' | 'project' | 'resume'

/**
 * Add a new content file with auto-generated slug + date frontmatter.
 * Rejects and throws when the target file already exists.
 * CLI: `jprot new <post|page|project> "Title" [--draft] [--template <name>]`.
 */
export function scaffoldNew(options?: {
  root?: string
  kind?: NewKind
  title?: string
  draft?: boolean
  /** Use templates/<name>.md as the body template ({{title}}, {{slug}}, {{date}}). */
  template?: string
}): Promise<string>

/** Palettes available to `jprot g component`. */
export interface ComponentPalette {
  id: string
  desc: string
}

export function componentPaletteList(): ComponentPalette[]

/**
 * Scaffold a self-contained theme component into theme/components/<Name>.js.
 * The component is immediately usable both as a homepage `section` and as a
 * `:::Name` Markdown shortcode.
 * CLI: `jprot g component <Name> [--palette section|cards|cta|stats]`.
 */
export function scaffoldComponent(options?: {
  root?: string
  palette?: string
  name?: string
}): Promise<string>

/**
 * Render author-provided `templates/<name>.md` with {{title}}, {{slug}},
 * {{date}} substitution for `jprot new --template <name>`.
 */
export function renderUserTemplate(options?: {
  root?: string
  projectRoot?: string
  template?: string
  vars?: Record<string, string>
}): Promise<string>

/**
 * Suggest a likely-correct key for a typo (Levenshtein ≤ 2) — the same
 * helper the server uses to print "did you mean…?" startup hints.
 */
export function suggestConfigKey(key: string): string | undefined

/**
 * Write editor snippet bundles (.vscode/jprot.code-snippets +
 * snippets/jprot.snippets). Called by `jprot init`.
 */
export function writeSnippets(root?: string): Promise<void>

export interface JprotApp {
  server: import('node:http').Server
  port: number
  host: string
  contentDir: string
  publicDir: string
  projectRoot: string
  /** Rebuild the in-memory site state (hot reload). */
  reload: () => void
  closeWatcher: () => void
  listen: (port?: number) => Promise<number>
}

export function createJprot(options?: JprotOptions): Promise<JprotApp>

export function renderPage(options: {
  page: PageData
  content: string
  projects: ProjectData[]
  site: JprotConfig
  nav: NavItem[]
  layout: string
  posts?: PostData[]
  home?: boolean
}): Promise<string>

export interface PageData {
  data: PageFrontmatter
  body: string
  path: string
  slug: string
  url: string
  src?: string
  headings?: HeadingData[]
}

export interface HeadingData {
  level: number
  text: string
  id: string
}

export interface ProjectData {
  data: PageFrontmatter
  body: string
  src: string
  slug: string
  url: string
}

export interface PostData extends ProjectData {
  excerpt: string
}
