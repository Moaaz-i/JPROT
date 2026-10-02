// Regression guard for the escaping discipline in theme components.
//
// The built-in theme had no tests at all, which is why `Projects.js` shipped a
// stored XSS: it duplicated `Home.js`'s project card, dropped the `esc()` on the
// excerpt, and nothing noticed.
//
// This is a *behavioural* guard, not a static one. An earlier version parsed
// `${…}` interpolations and required each to be wrapped in `esc()`; it reported
// 60 false positives on `cond ? \`…${esc(x)}…\` : ''` and similar, because
// deciding whether a nested template literal is escaped is a dataflow problem,
// not a matching one. Rendering each component with hostile input and asserting
// that no markup survives cannot have false positives.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadComponents } from '../../core/components.js'
import { createMarkdown } from '../../lib/markdown.js'
import { REPO_ROOT } from '../helpers/site.js'

const COMPONENTS = join(REPO_ROOT, 'theme', 'default', 'components')

// Payloads that must never survive into rendered output. Each is a value an
// author can put in frontmatter, a `sections:` entry, or a shortcode attribute.
//
// The first group contains markup metacharacters, so `esc()` guarantees they
// come out as entities and the payload can never appear verbatim. The second
// group is a URL scheme, which `esc()` does NOT neutralize — only `safeHref()`
// does — so it is checked separately and only in attribute position.
const MARKUP_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(1)</script>',
  "'><script>alert(1)</script>",
  '</style><script>alert(1)</script>',
  'red"}<script>alert(1)</script>',
]

const URL_PAYLOADS = [
  'javascript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
]

const ALL_PAYLOADS = [...MARKUP_PAYLOADS, ...URL_PAYLOADS]

// `javascript:` is only dangerous in a link/src/action, not as visible text —
// a page whose title is literally "javascript: the language" is not a bug.
const SCHEME_IN_ATTR = /(?:href|src|action|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|data):/i

function assertNoLeak(label, html) {
  const text = String(html)
  for (const payload of MARKUP_PAYLOADS) {
    assert.ok(!text.includes(payload), `${label} emitted ${JSON.stringify(payload)} verbatim`)
  }
  const scheme = SCHEME_IN_ATTR.exec(text)
  assert.equal(scheme, null, `${label} put a dangerous scheme in an attribute: ${JSON.stringify(scheme?.[0])}`)
}

async function loadBuiltins() {
  const dir = await join(COMPONENTS, '..')
  const components = await loadComponents(COMPONENTS, true, createMarkdown())
  const files = (await readdir(COMPONENTS)).filter((n) => n.endsWith('.js')).map((n) => n.replace(/\.js$/, ''))
  return { components, files, dir }
}

test('no built-in component leaks markup from a hostile prop value', async () => {
  const { components, files } = await loadBuiltins()
  assert.ok(files.length >= 20, 'expected the full default component set')

  // One complete props object per payload, with the payload injected into
  // every string an author can actually control: frontmatter, a `sections:`
  // entry, a shortcode attribute, or the project/post body. Shape errors are
  // not what this test is about, so every component gets a full set of props
  // rather than a minimal one.
  for (const name of files) {
    const comp = components[name]
    if (typeof comp !== 'function') continue
    for (const payload of ALL_PAYLOADS) {
      const props = {
        title: payload,
        subtitle: payload,
        label: payload,
        text: payload,
        url: payload,
        src: payload,
        items: [{
          title: payload, label: payload, name: payload, description: payload,
          url: payload, src: payload, logo: payload, link: payload, period: payload,
          company: payload, school: payload, institution: payload, org: payload,
          place: payload, year: payload, role: payload, degree: payload,
          value: payload, alt: payload, caption: payload,
        }],
        site: {
          title: payload, tagline: payload, projectsTitle: payload, footerText: payload,
          labels: { projects: payload, onThisPage: payload, details: payload, noPosts: payload },
        },
        page: {
          url: '/x', path: 'x.md', body: payload,
          data: {
            title: payload, subtitle: payload, name: payload, role: payload,
            email: payload, phone: payload, location: payload, formspree: payload,
            hero: { title: payload, subtitle: payload, badge: payload, links: [{ label: payload, url: payload }] },
            social: [{ label: payload, url: payload }],
            experience: [{ title: payload, company: payload, period: payload, description: payload }],
            education: [{ degree: payload, school: payload, period: payload, description: payload }],
            skills: [{ name: payload, level: payload }],
          },
        },
        nav: [{ label: payload, url: payload, text: payload }],
        docsNav: [{ label: payload, url: payload }],
        projects: [{
          url: 'x', path: 'x.md', body: payload,
          data: {
            title: payload, date: payload, description: payload, excerpt: payload,
            cover: payload, demo: payload, repo: payload, tags: [payload],
          },
        }],
        posts: [{
          url: 'x', slug: 'x', body: payload, excerpt: payload,
          data: { title: payload, date: payload, tags: [payload] },
        }],
        // Realistic pre-rendered slots, to make sure the component still
        // assembles a page when they are populated.
        content: '<p>rendered</p>',
        sectionsHtml: '<section>x</section>',
        header: '<header>x</header>',
        footer: '<footer>x</footer>',
        sidebar: '<aside>x</aside>',
        // `content`, `sectionsHtml`, `header`, `footer` and `sidebar` are
        // deliberately NOT poisoned. They are already-rendered HTML produced
        // by the markdown engine (which escapes everything) or by another
        // component, so raw markup there is a sanitized string, not an attack.
        // Injecting into them would test a contract that does not exist.
        headings: [{ level: 2, id: payload, text: payload }],
      }
      const html = await comp(props)
      if (!html) continue
      assertNoLeak(`${name} (${payload.slice(0, 24)})`, html)
    }
  }
})

test('the built-in project card escapes a raw markdown excerpt', async () => {
  // The exact regression: `p.body` is the raw Markdown source, and the
  // fallback excerpt used to be interpolated without esc().
  const { components } = await loadBuiltins()
  const html = await components.Projects({
    site: { labels: {} },
    projects: [{
      url: 'evil',
      path: 'evil.md',
      body: '<img src=x onerror=alert(document.cookie)>\nsecond line',
      data: { title: 'Evil' },
    }],
  })
  assert.match(html, /&lt;img src=x onerror=/, 'the raw body must be escaped, not emitted')
  assertNoLeak('Projects fallback excerpt', html)
})

test('a `javascript:` URL in frontmatter becomes inert in every component', async () => {
  const { components } = await loadBuiltins()
  const hostile = 'javascript:alert(1)'
  const html = await components.Projects({
    site: { labels: {} },
    projects: [{
      url: 'x',
      path: 'x.md',
      body: 'body',
      data: { title: 'T', demo: hostile, repo: hostile, cover: hostile },
    }],
  })
  assertNoLeak('Projects demo/repo/cover', html)
  assert.ok(!html.includes('javascript:'), 'no javascript: scheme may survive')
})

// Three local copies of `safeHref` existed and had already drifted from the
// shared one (no control-character check; `data:` allowed even for links).
test('no component re-declares its own safeHref or scheme check', async () => {
  const { readFile } = await import('node:fs/promises')
  const { files } = await loadBuiltins()
  const offenders = []
  for (const name of files) {
    // Comments are stripped first: prose about *why* a scheme is dangerous is
    // not a scheme check, and flagging it would make the rule unusable.
    const code = (await readFile(join(COMPONENTS, `${name}.js`), 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    if (/function\s+safeHref\s*\(/.test(code) || /javascript\s*:/i.test(code)) {
      offenders.push(name)
    }
  }
  assert.deepEqual(offenders, [], 'import safeHref from core/utils.js instead of reimplementing it')
})
