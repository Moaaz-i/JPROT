import { AsyncLocalStorage } from 'node:async_hooks'

// Per-instance (and per-request) state. Using AsyncLocalStorage keeps the
// state of N concurrent createJprot() instances isolated from one another —
// a module-level global would silently leak one instance's config into the
// other. AsyncLocalStorage propagates correctly across our async helpers.
const als = new AsyncLocalStorage()

// Fallback store, used ONLY when a helper is called outside a request context
// (the standalone programmatic API, `jprot export`'s post-run hooks). Within a
// request the AsyncLocalStorage store always takes precedence, and
// test/unit/state.test.js pins that guarantee.
//
// It is still one module-level slot, so two instances in the same process have
// no way to keep separate fallbacks: the last `createJprot()` wins for any
// unscoped read. That is fine for the CLI (one instance per process) and for
// the dev server (every request is scoped), but a host embedding several JPROT
// instances must route every call through its own request scope rather than
// calling the bare helpers concurrently.
let fallbackState = {}

export function state() {
  return als.getStore() || fallbackState
}

export function runScoped(store, fn) {
  return als.run(store, fn)
}

export function setFallbackState(store) {
  fallbackState = store
}

export const DEFAULT_LABELS = {
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
}
