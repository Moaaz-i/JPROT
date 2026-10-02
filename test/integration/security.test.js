// Security regressions that are not theme-component escaping: the 404 page and
// the generated SVG endpoints interpolated `themeColor` without validating it,
// and the 500 handler returned the raw error message (which carries absolute
// filesystem paths) with none of the usual security headers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createJprot } from '../../core/server.js'
import { makeSite } from '../helpers/site.js'

// A value that breaks out of a <style> declaration and of a double-quoted XML
// attribute. `esc()` alone is not enough for the CSS case: `}` still ends the
// declaration and `/*` still opens a comment.
const HOSTILE_COLOR = 'red}</style><script>alert(1)</script>'
const HOSTILE_ATTR = 'red"/><script>alert(1)</script>'

async function serve(config, path) {
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\ndescription: Home.\n---\n\nHello.' },
    config,
  })
  const app = await createJprot({ root: site.root, watch: false })
  try {
    const base = `http://127.0.0.1:${await app.listen(0)}`
    const res = await fetch(base + path)
    return { res, body: await res.text() }
  } finally {
    app.server.close()
    await app.closeWatcher()
    await site.cleanup()
  }
}

test('a hostile themeColor cannot close the <style> block on the 404 page', async () => {
  const { res, body } = await serve({ title: 'T', themeColor: HOSTILE_COLOR }, '/definitely-missing')
  assert.equal(res.status, 404)
  assert.ok(!body.includes(HOSTILE_COLOR), 'the raw value must not appear')
  assert.ok(!body.includes('</style><script>'), 'the style block must not be escapable')
  // The stylesheet must still be well-formed and present.
  assert.match(body, /\.nf-code\s*\{[^}]*color:/)
})

test('a hostile themeColor cannot break out of the favicon SVG attribute', async () => {
  const { res, body } = await serve({ title: 'T', themeColor: HOSTILE_ATTR }, '/favicon.svg')
  assert.equal(res.status, 200)
  assert.ok(!body.includes(HOSTILE_ATTR), 'the raw value must not appear')
  assert.ok(!/<script/i.test(body), 'no script element may be injected into the SVG')
  // Still valid, single-root SVG.
  assert.match(body, /^<svg[^>]*>\s*<rect[^>]*\/>\s*<text[^>]*>[^<]*<\/text>\s*<\/svg>$/)
})

test('the favicon SVG is served with a Content-Security-Policy', async () => {
  // Navigating straight to an SVG URL renders it as a standalone document, so
  // without a CSP any injected <script> would execute.
  const { res } = await serve({ title: 'T' }, '/favicon.svg')
  assert.match(res.headers.get('content-security-policy') || '', /script-src/)
})

test('a hostile themeColor cannot leak into the OG image', async () => {
  const { res, body } = await serve({ title: 'T', ogColor: HOSTILE_ATTR, ogTextColor: HOSTILE_ATTR }, '/@jprot/og/preview.svg')
  assert.ok(!/<script/i.test(body), 'no script element may be injected into the OG image')
  assert.ok(!body.includes(HOSTILE_ATTR), 'the raw value must not appear')
})

test('a hostile themeColor in <meta name="theme-color"> is escaped', async () => {
  const { body } = await serve({ title: 'T', themeColor: '"><script>alert(1)</script>' }, '/')
  assert.ok(!body.includes('<script>alert(1)</script>'), 'no raw script tag may be emitted')
  const meta = /<meta name="theme-color" content="([^"]*)"/.exec(body)
  assert.ok(meta, 'the theme-color meta tag must still be present')
  assert.ok(!/>|</.test(meta[1]), 'the content value must not contain markup delimiters')
})

// The 500 body used to be `"Server error: " + err.message`, which carries the
// absolute path of whatever file failed and the internal module name — a free
// map of the server's filesystem for anyone who can trigger a render error. It
// also went out through a bare `res.writeHead`, skipping every security header.
// Raw HTML in a Markdown body is passed through, not escaped — that is
// deliberate, and CSP is what makes it safe. `script-src` carries no
// `unsafe-inline`, so an injected `<script>` (without the per-response nonce)
// and an `onerror=` handler are both refused by the browser. If anyone ever
// relaxes that directive, every content file becomes a script-execution
// vector, so it is pinned here.
test('script-src has no unsafe-inline — CSP is what makes raw HTML safe', async () => {
  const site = await makeSite({
    content: { 'index.md': '---\ntitle: Home\ndescription: d.\n---\nHello.' },
  })
  const app = await createJprot({ root: site.root, watch: false })
  try {
    const base = `http://127.0.0.1:${await app.listen(0)}`
    const csp = (await fetch(base + '/')).headers.get('content-security-policy')
    assert.ok(csp, 'every document response must carry a CSP')

    const scriptSrc = /script-src ([^;]*)/.exec(csp)?.[1] || ''
    assert.match(scriptSrc, /'self'/)
    assert.match(scriptSrc, /'nonce-/, 'a per-response nonce must be allowed')
    assert.doesNotMatch(scriptSrc, /unsafe-inline/, 'unsafe-inline would make every content file executable')
    assert.doesNotMatch(scriptSrc, /unsafe-eval/)
  } finally {
    app.server.close()
    await app.closeWatcher()
    await site.cleanup()
  }
})

// The escape-based tests are the first line of defence. This one pins the
// second, so a future change to either is visible in a test name rather than in
// a security advisory.
test('raw HTML in Markdown is passed through, and the CSP is the boundary', async () => {
  const site = await makeSite({
    content: {
      'index.md': '---\ntitle: Home\ndescription: d.\n---\n<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n',
    },
  })
  const app = await createJprot({ root: site.root, watch: false })
  try {
    const base = `http://127.0.0.1:${await app.listen(0)}`
    const res = await fetch(base + '/')
    const body = await res.text()
    // It really is passed through. Pinning the behaviour stops anyone from
    // assuming escaping is what protects them — it is the CSP.
    assert.ok(body.includes('<script>alert(1)</script>'), 'raw HTML is passed through by design')
    assert.ok(body.includes('<img src=x onerror=alert(2)>'))
    assert.match(res.headers.get('content-security-policy') || '', /script-src [^;]*'nonce-/)
  } finally {
    app.server.close()
    await app.closeWatcher()
    await site.cleanup()
  }
})

test('a 500 response does not leak the error, and still has security headers', async () => {
  const site = await makeSite({
    content: {
      'index.md': '---\ntitle: Home\ndescription: d.\nsections:\n  - component: Boom\n---\n\nHi.',
    },
    theme: {
      'components/Boom.js': 'export default function Boom() { throw new Error("boom /Users/secret/.ssh/id_rsa") }\n',
    },
  })
  const app = await createJprot({ root: site.root, watch: false })
  try {
    const base = `http://127.0.0.1:${await app.listen(0)}`
    const res = await fetch(base + '/')
    const body = await res.text()
    assert.equal(res.status, 500)
    assert.doesNotMatch(body, /boom/, 'the error message must not reach the client')
    assert.doesNotMatch(body, /secret|\/Users\//, 'no filesystem path may reach the client')
    // The same header set as every other response.
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.ok(res.headers.get('content-security-policy'), 'a CSP must be sent even on 500')
  } finally {
    app.server.close()
    await app.closeWatcher()
    await site.cleanup()
  }
})

test('a valid themeColor still works everywhere', async () => {
  for (const [path, check] of [
    ['/', /content="#4f46e5"/],
    ['/favicon.svg', /fill="#4f46e5"/],
    ['/definitely-missing', /color: #4f46e5/],
  ]) {
    const { body } = await serve({ title: 'T', themeColor: '#4f46e5' }, path)
    assert.match(body, check, `themeColor must still be applied on ${path}`)
  }
})
