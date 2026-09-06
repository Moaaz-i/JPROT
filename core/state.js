import { AsyncLocalStorage } from 'node:async_hooks'

// Per-instance (and per-request) state. Using AsyncLocalStorage keeps the
// state of N concurrent createJprot() instances isolated from one another —
// a module-level global would silently leak one instance's config into the
// other. AsyncLocalStorage propagates correctly across our async helpers.
const als = new AsyncLocalStorage()

// Fallback store used when renderPage()/helpers are called outside of a
// request context (e.g. the standalone programmatic API). Within a request,
// the AsyncLocalStorage store always takes precedence.
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
