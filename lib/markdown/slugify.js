// Heading slug generation.
//
// `slugify` itself lives in lib/utils.js — the same module the theme components
// and `safeUrl` already share it with. This file used to hold a second copy of
// the function, with a comment claiming it was "shared with lib/utils.js" while
// being nothing of the kind: a mutation-testing pass over this repo's properties
// showed the two copies drifting silently, because every test imported one name
// and the other went unchecked.
//
// Re-exporting rather than copying is the fix. `test/unit/property.test.js`
// pins the two entry points to the same behaviour, so a future divergence is a
// failing test instead of a broken heading anchor on one code path only.
export { slugify } from "../utils.js";
// The import is not redundant with the re-export above: it is what puts `slugify`
// in scope for `uniqueSlug` below. Dropping it (an editor's "organize imports",
// or a formatter that sees the re-export and assumes the name is already bound)
// leaves `uniqueSlug` throwing a ReferenceError on every heading in the site.
import { slugify } from "../utils.js";

// Allocate a document-unique id for a heading: `intro`, `intro-2`, `intro-3`…
// `used` is the per-render counter map owned by the document state.
export function uniqueSlug(text, used) {
  let id = slugify(text);
  if (used[id] === undefined) used[id] = 0;
  used[id]++;
  if (used[id] > 1) id = `${id}-${used[id]}`;
  return id;
}
