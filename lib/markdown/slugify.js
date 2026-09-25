// Heading slug generation. Shared with core/utils.js so a page title, a section
// id and a heading anchor all produce the same shape.
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Allocate a document-unique id for a heading: `intro`, `intro-2`, `intro-3`…
// `used` is the per-render counter map owned by the document state.
export function uniqueSlug(text, used) {
  let id = slugify(text)
  if (used[id] === undefined) used[id] = 0
  used[id]++
  if (used[id] > 1) id = `${id}-${used[id]}`
  return id
}
