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
  /** Static export prefix for project sites such as GitHub Pages `/repository`. */
  basePath?: string
  /** Enable documentation navigation, breadcrumbs, and previous/next links. */
  docs?: boolean
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
  /** `jprot lint` tuning: `ignore` is an array of Markdown globs to skip. */
  lint?: { ignore?: string[] }
  /**
   * Plugins to run on every state build, in order. Each specifier is a
   * project-relative path (`./plugins/analytics.js`), an installed package
   * name, an absolute path, or a `file:` URL.
   */
  plugins?: string[]
}

export interface FrontmatterDiagnostic {
  line: number
  message: string
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
  inline?: boolean
  headings?: boolean
  lists?: boolean
  code?: boolean
  blockquote?: boolean
  hr?: boolean
  links?: boolean
  images?: boolean
  table?: boolean
  emphasis?: boolean
  footnotes?: boolean
  autolinks?: boolean
  /** Render GitHub-style task lists `[x]` / `[ ]` as checkboxes. Default true. */
  taskLists?: boolean
}

export function parseFrontmatter(source: string): {
  data: PageFrontmatter
  body: string
  diagnostics: FrontmatterDiagnostic[]
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
  /** Opt this page out of `jprot lint` checks (or use `lint.ignore` in the config). */
  lint?: false
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
   The Content Graph
   ============================================================ */

/** What a page is, as derived from where its file lives. */
export type PageKind = 'home' | 'page' | 'post' | 'project' | 'notfound'

export interface GraphLink {
  kind: 'link' | 'image'
  text: string
  target: string
}

export interface GraphHeading {
  level: number
  text: string
  /** The anchor the renderer emits, including any `-2` disambiguation. */
  id: string
  /** The slug before disambiguation — two headings sharing a `base` collide. */
  base: string
}

export interface GraphEntry {
  /** Path relative to `content/`, e.g. `docs/intro.md`. */
  rel: string
  src: string
  slug: string
  /** The URL the site serves, e.g. `/docs/intro`. */
  url: string
  dirUrl: string
  navUrl: string
  docsUrl: string
  kind: PageKind
  data: PageFrontmatter
  body: string
  title: string
  excerpt: string
  order: number
  hidden: boolean
  draft: boolean
  links: GraphLink[]
  headings: GraphHeading[]
}

export interface NavLink {
  label: string
  url: string
  order: number
  /** Content-relative path, so lint can match `lint.ignore` globs. */
  rel: string
}

export interface SearchRecord {
  title: string
  url: string
  excerpt: string
  tags: string[]
  date: string
  image: string
  body: string
  raw: string
  frontmatter: string
}

/**
 * The single parsed index of the whole site. Routing, the search index, the
 * sitemap, the feed, `jprot lint` and `jprot export` all read this — which is
 * why they can never disagree about what pages exist.
 */
export interface ContentGraph {
  contentDir: string
  blogDir: string
  projectsDir: string
  /** Every file, including hidden and draft pages. */
  entries: GraphEntry[]
  /** Visible pages (home + page). */
  pages: GraphEntry[]
  /** Visible blog posts, newest first. */
  posts: GraphEntry[]
  /** Visible projects, by `order`. */
  projects: GraphEntry[]
  /** Every URL the site answers on. */
  routes: { url: string; file: string; kind: PageKind; entry: GraphEntry }[]
  navigation: NavLink[]
  /** Sidebar reading order; empty unless `docs` is enabled. */
  docsNavigation: NavLink[]
  searchIndex: SearchRecord[]
  /** Internal page → pages it links to. */
  outgoing: Map<string, Set<string>>
  /** Internal page → pages that link to it. */
  backlinks: Map<string, Set<string>>
  /**
   * Pages that nothing links to and no nav lists.
   *
   * `scope` narrows both sides of the question: a page is only an orphan if it
   * is in scope, and only links coming *from* in-scope pages count.
   */
  orphans(scope?: Set<GraphEntry> | GraphEntry[]): GraphEntry[]
  /** The entry a URL maps to, or null. */
  lookup(url: string): GraphEntry | null
  /** The entry a file path maps to, or null. */
  entryFor(file: string): GraphEntry | null
  byUrl: Map<string, GraphEntry>
  byRel: Map<string, GraphEntry>
}

export interface ContentGraphOptions {
  contentDir: string
  blogDir?: string
  projectsDir?: string
  docs?: boolean
  /** Pre-walked file list; supplied by the cache to avoid a second walk. */
  files?: { file: string; mtimeMs: number; size: number }[]
}

/** Parse the whole content tree into a graph. */
export function loadContentGraph(options: ContentGraphOptions): Promise<ContentGraph>

/**
 * The cached graph for these options, rebuilt only when the file set, mtimes,
 * or sizes have changed. Two JPROT instances over the same folders share it.
 */
export function getContentGraph(options: ContentGraphOptions): Promise<ContentGraph>

/** Drop the cached graph for these options (or all of them). */
export function invalidateContentGraph(options?: Partial<ContentGraphOptions>): void

/**
 * Resolve a link written inside `entry` against the **served** URL — the same
 * base the browser and the server's 301s use, so `../x.md` from `/docs/intro`
 * lands on `/x.md`. Returns null for external and non-page targets.
 */
export function resolveInternalTarget(entry: GraphEntry, target: string): string | null

/* ============================================================
   Plugin API
   ============================================================ */

/** Every event a plugin may subscribe to, with the arguments its handler gets. */
export interface JprotHooks {
  /** A full state build is starting. `state` is mutable. */
  'state:build': [state: Record<string, unknown>]
  /** After plugins have added their components, before the theme registry wins. */
  'components:load': [components: Record<string, unknown>]
  /** A rendered page, before it is written to the response. Returns the html. */
  'html:page': [html: string, page: PageData]
  /** Inject markup into `<head>`. Returns the html. */
  'html:head': [html: string, page: PageData]
  /** Inject markup before `</body>`. Returns the html. */
  'html:body-end': [html: string, page: PageData]
  /** Add keys to a JSON response (search.json, manifest.json). Returns the data. */
  'endpoint:json': [data: unknown, path: string]
  /** Any state build, before rendering. */
  build: []
  /** A static export finished writing to `dest`. */
  export: [dest: string]
}

export type JprotHook = keyof JprotHooks

/** The argument tuple a given hook's handler receives. */
export type JprotHookArgs<K extends JprotHook> = JprotHooks[K]

/**
 * The object handed to every `setup(jprot)` call. Everything a plugin can do is
 * a method here, which is what keeps the surface small enough to promise across
 * a major version.
 */
export interface JprotPluginApi {
  /** The loaded site config, for reading the plugin's own options. */
  config: JprotConfig

  /**
   * Register a component under `name`. Registered components are applied after
   * the theme's own, so a plugin can intentionally override a built-in by
   * reusing its name. Usable as a `:::Name` shortcode, a `sections[].component`,
   * and a `layout:`.
   *
   * Throws if `name` is empty or the component is not renderable.
   */
  addComponent(
    name: string,
    component: ComponentFn | { name?: string; props?: PropSchema; render: ComponentFn },
  ): unknown

  /**
   * Serve a response at `path` ahead of the content router. Matched exactly, so
   * a plugin can never shadow a content page by accident.
   *
   * Throws if `path` is not a string starting with `/`, or the handler is not a
   * function. Returns the normalized path.
   */
  addRoute(path: string, handler: (req: unknown, res: unknown) => unknown): string

  /**
   * Add Markdown support. `defaults` patches the feature flags
   * (`{ footnotes: false }`); `extensions` are extra renderers with the same
   * signature as JPROT's own.
   */
  extendMarkdown(extension: {
    defaults?: Partial<MarkdownConfig>
    extensions?: Array<(source: string) => string>
  }): JprotPluginApi

  /**
   * Subscribe to one of {@link JprotHook}. `html:*` and `endpoint:json`
   * handlers return the replacement value; the rest are fire-and-forget.
   *
   * Throws immediately on an unknown hook name.
   */
  on<K extends JprotHook>(name: K, handler: (...args: JprotHookArgs<K>) => unknown): unknown
}

/** A component's render function. */
export type ComponentFn = (props: ComponentProps) => string

/**
 * A component's declared props: a type name, or `{ type, required }`.
 * Type names are `string`, `number`, `boolean`, `array`, `object`, `any`, or
 * any `typeof` result. `string` is permissive — a number or boolean is
 * accepted and stringified. Used by `jprot lint` to flag a section key a
 * component ignores and a required prop that was never supplied.
 */
export type PropSchema = Record<string, string | { type?: string; required?: boolean }>

/**
 * A plugin is a single file exporting `setup(jprot)` — either directly, or as
 * the `setup` of a default-exported object.
 */
export type JprotPlugin =
  | ((api: JprotPluginApi) => void | Promise<void>)
  | { name?: string; setup: (api: JprotPluginApi) => void | Promise<void> }

/** What a plugin registered during a successful `setup()`. */
export interface JprotPluginReport {
  name: string
  file: string
  /** `null` when it loaded, otherwise the reason it did not. */
  error: string | null
  components?: string[]
  routes?: string[]
  hooks?: JprotHook[]
}

/** A plugin as {@link loadPlugins} sees it, before `setup()` has run. */
export interface LoadedPlugin extends JprotPluginReport {
  href: string | null
  /** The imported module's default export, when it could be read. */
  plugin?: JprotPlugin | null
  /** The `setup` function itself; null when the module had none. */
  setup?: ((api: JprotPluginApi) => unknown) | null
}

export interface JprotPluginRegistry {
  hooks: Partial<Record<JprotHook, Function[]>>
  routes: { path: string; handler: Function; plugin: string }[]
  components: { name: string; component: unknown; plugin: string }[]
  markdown: { defaults: Partial<MarkdownConfig>; extensions: Function[] }
}

/**
 * Every hook a plugin may subscribe to, with its arguments and what it does.
 * The same table backs the docs, this file, and the error message for a typo.
 */
export const HOOKS: Record<JprotHook, { args: string[]; returns: string; description: string }>

/** Resolve a plugin specifier to an importable href. */
export function resolvePlugin(
  spec: string,
  projectRoot: string,
): Promise<{ href: string | null; file: string; name: string; missing?: boolean }>

/**
 * Import every configured plugin **without running `setup()`** — what
 * `jprot check` uses to verify each one resolves and exports a setup function.
 */
export function loadPlugins(
  projectRoot: string,
  config: JprotConfig,
  options?: { bust?: boolean },
): Promise<LoadedPlugin[]>

/**
 * Run every configured plugin's `setup()`, collecting hooks, components and
 * routes into shared registries.
 *
 * A plugin that throws is reported and skipped, the rest still load, and nothing
 * it had staged is committed. `quiet` suppresses the console warnings — the
 * returned records carry the same detail, so callers can render it themselves.
 */
export function runPlugins(options: {
  projectRoot: string
  config: JprotConfig
  /** An existing registry to extend (hot reload). */
  registry?: JprotPluginRegistry
  /** Re-import plugin modules from disk, bypassing the ESM cache. */
  bust?: boolean
  quiet?: boolean
}): Promise<{ registry: JprotPluginRegistry; plugins: JprotPluginReport[] }>

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
  /** Allow embedding the site in an iframe (relaxes X-Frame-Options / frame-ancestors). Off by default; used by editor live previews. */
  allowEmbed?: boolean
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
   Validation (jprot check / jprot lint)
   ============================================================ */

/** A configuration problem, positioned at `file` + `line`. */
export interface ConfigIssue {
  level: 'error' | 'warning'
  /** Dotted path of the offending value, e.g. `sections[0].component`. */
  path: string
  message: string
  file: string
  line: number
}

export interface CheckReport {
  /** `true` when there are no errors (and, under `strict`, no warnings). */
  ok: boolean
  errors: ConfigIssue[]
  warnings: ConfigIssue[]
  /** Every `sections[]` entry, with whether its component exists. */
  sections: { index: number; name: string; exists: boolean }[]
  /** Every configured plugin, and what it registered or why it failed. */
  plugins: JprotPluginReport[]
  config: JprotConfig
  /** The config file that was loaded. */
  file: string
}

/**
 * Validate a project's configuration without printing anything.
 * Resolves cross-references the schema cannot know: that each
 * `sections[].component` exists (including plugin-provided ones), and that every
 * declared plugin loads and completes `setup()`.
 */
export function checkConfig(options?: {
  root?: string
  config?: JprotConfig
  /** Treat warnings as errors. */
  strict?: boolean
}): Promise<CheckReport>

/** CLI entry point for `jprot check`: prints the report, returns the exit code. */
export function runCheck(options?: { root?: string; strict?: boolean }): Promise<number>

/** One finding from `jprot lint`. */
export interface LintIssue {
  level: 'error' | 'warning' | 'info'
  /** Path of the offending file, relative to the project root. */
  file: string
  type: string
  msg: string
}

export interface LintReport {
  /** `0` clean, `1` when an error-level issue was found. */
  code: number
  issues: LintIssue[]
  counts: Record<string, number>
  graph: unknown
  fileCount: number
}

/**
 * Analyze the site without printing. `jprot lint` is `runLint`, which prints the
 * same report and returns its exit code.
 */
export function analyzeSite(options?: { root?: string }): Promise<LintReport>

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
export function writeSnippets(root: string): Promise<void>

export interface JprotApp {
  server: import('node:http').Server
  port: number
  host: string
  contentDir: string
  publicDir: string
  projectRoot: string
  /** Rebuild the in-memory site state (hot reload). */
  reload: () => Promise<void>
  closeWatcher: () => void
  listen: (port?: number) => Promise<number>
}

export function resolveRelativeUrl(url: string, pagePath?: string): string

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
  /** The slug before `-2` disambiguation, when it differs from `id`. */
  base?: string
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
