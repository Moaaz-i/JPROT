// Running plugin hook handlers over already-rendered output.
//
// Split out of core/server.js because three separate consumers need it — the
// page renderer, the JSON endpoints and `jprot export` — and each was reaching
// into the server module for it.
//
// A throwing handler is reported and skipped everywhere: one bad plugin must not
// take the site down.
import { state } from "../foundation/state.js";

/**
 * Run the plugin `html:*` hooks over a rendered page.
 *
 * `html:head` and `html:body-end` are injection points, so a handler that
 * returns nothing still gets the default split applied — the hook is a
 * suggestion, not an obligation. `html:page` can replace the whole document.
 * A throwing handler is skipped with a warning: one bad plugin must not take
 * the page down.
 */
export async function applyHtmlHooks(html, page) {
  const hooks = state().hooks || {};
  let out = html;
  for (const handler of hooks["html:head"] || []) {
    try {
      const injected = await handler(out, page);
      if (typeof injected === "string" && injected !== out && injected.includes("</head>")) {
        out = injected;
      }
    } catch (e) {
      console.warn(`[jprot] plugin "html:head" hook failed: ${e.message}`);
    }
  }
  for (const handler of hooks["html:body-end"] || []) {
    try {
      const injected = await handler(out, page);
      if (typeof injected === "string" && injected !== out && injected.includes("</body>")) {
        out = injected;
      }
    } catch (e) {
      console.warn(`[jprot] plugin "html:body-end" hook failed: ${e.message}`);
    }
  }
  for (const handler of hooks["html:page"] || []) {
    try {
      const replaced = await handler(out, page);
      if (typeof replaced === "string") out = replaced;
    } catch (e) {
      console.warn(`[jprot] plugin "html:page" hook failed: ${e.message}`);
    }
  }
  return out;
}

/**
 * Run the plugin `endpoint:json` hooks over a JSON payload. Handlers may mutate
 * the object in place and return nothing; returning an object replaces it.
 */
export async function applyJsonHooks(data, path) {
  const handlers = state().hooks?.["endpoint:json"];
  if (!handlers || !handlers.length) return data;
  let out = data;
  for (const handler of handlers) {
    try {
      const replaced = await handler(out, path);
      if (replaced !== undefined) out = replaced;
    } catch (e) {
      console.warn(`[jprot] plugin "endpoint:json" hook failed: ${e.message}`);
    }
  }
  return out;
}
