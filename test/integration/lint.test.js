import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runLint, analyzeSite } from '../../core/lint.js'
import { captureLogs, makeSite, page } from '../helpers/site.js'

const BROKEN_MD = page({
  title: 'Broken',
  description: 'A page with a broken link.',
  body: 'This links to [nothing](/does-not-exist).',
})
const OK_MD = page({ title: 'Home', description: 'The homepage.', body: 'Home page.' })

// `runLint` prints its report; capture it and hand back the exit code.
async function lint(root) {
  const { value, logs } = await captureLogs(() => runLint({ root }))
  return { code: value, logs: logs.join('\n'), lines: logs }
}

test('lint flags a broken internal link', async () => {
  const site = await makeSite({ content: { 'index.md': OK_MD, 'broken.md': BROKEN_MD } })
  const { code, logs } = await lint(site.root)
  await site.cleanup()
  assert.equal(code, 1)
  assert.ok(logs.includes('broken.md') && logs.includes('broken internal link'))
})

test('lint.ignore with an exact filename skips the file', async () => {
  const site = await makeSite({
    content: { 'index.md': OK_MD, 'broken.md': BROKEN_MD },
    config: { lint: { ignore: ['broken.md'] } },
  })
  const { code, logs } = await lint(site.root)
  await site.cleanup()
  assert.equal(code, 0, logs)
})

test('lint.ignore with a glob skips matching files only', async () => {
  const site = await makeSite({
    content: { 'ok.md': OK_MD, 'drafts/stale.md': BROKEN_MD, 'live.md': BROKEN_MD },
    config: { lint: { ignore: ['drafts/*'] } },
  })
  const { code, lines } = await lint(site.root)
  await site.cleanup()
  assert.equal(code, 1)
  assert.ok(!lines.some((l) => l.includes('drafts/stale.md')), lines.join('\n'))
  assert.ok(lines.some((l) => l.includes('live.md')))
})

test('frontmatter lint: false opts the page out of checks', async () => {
  const site = await makeSite({
    content: {
      'index.md': OK_MD,
      'broken.md': '---\ntitle: Broken\ndescription: Stale.\nlint: false\n---\n\n[x](/does-not-exist).\n',
    },
  })
  const { code, logs } = await lint(site.root)
  await site.cleanup()
  assert.equal(code, 0, logs)
})

test('a clean project reports OK', async () => {
  const site = await makeSite({
    content: { 'index.md': OK_MD, 'about.md': page({ title: 'About', description: 'About the site.', body: 'See [home](/).' }) },
  })
  const { code, lines } = await lint(site.root)
  await site.cleanup()
  assert.equal(code, 0)
  assert.ok(lines.some((l) => l.includes('OK')), lines.join('\n'))
})

/* ---------------- the categories the analyzer added ---------------- */

test('flags an unknown shortcode and a component prop typo', async () => {
  const site = await makeSite({
    content: {
      'index.md': page({
        title: 'Home',
        description: 'Home.',
        body: ':::NoSuchComponent\nx\n:::\n\n:::Banner lable="typo" title="Hi"\n:::',
      }),
    },
    // A declared component contract: `lable` is not in the schema, so the
    // analyzer can tell a typo from an intentional pass-through.
    theme: {
      'components/Banner.js': [
        'export default {',
        "  name: 'Banner',",
        "  props: { title: { type: 'string', required: true }, tone: 'string' },",
        '  render({ title, tone }) { return `<div class="${tone || \'plain\'}">${title || \'\'}</div>` },',
        '}',
      ].join('\n'),
    },
  })
  const report = await analyzeSite({ root: site.root })
  await site.cleanup()
  const components = report.issues.filter((i) => i.type === 'components')
  assert.ok(components.some((i) => i.msg.includes('unknown component :::NoSuchComponent')), JSON.stringify(components))
  assert.ok(components.some((i) => i.msg.includes('lable')), JSON.stringify(components))
  assert.equal(report.code, 1)
})

test('flags a nav entry and a site.nav entry that point nowhere', async () => {
  const site = await makeSite({
    content: {
      'index.md': OK_MD,
      'a-page.md': page({ title: 'A page', description: 'x', extra: 'nav: A page\n' }),
    },
    config: { nav: [{ label: 'Ghost', url: '/nowhere' }] },
  })
  const report = await analyzeSite({ root: site.root })
  await site.cleanup()
  const nav = report.issues.filter((i) => i.type === 'nav')
  assert.ok(nav.some((i) => i.msg.includes('site.nav target does not exist: /nowhere')), JSON.stringify(nav))
})

test('reports an orphan page as info, not an error', async () => {
  // The compact navbar lists every top-level page, so only a *nested* page can
  // be an orphan. `guide/deep.md` is not in the navbar and nothing links to it.
  const site = await makeSite({
    content: {
      'index.md': page({ title: 'Home', description: 'Home.', body: 'See [about](about.md).' }),
      'about.md': page({ title: 'About', description: 'About.' }),
      'guide/index.md': page({ title: 'Guide', description: 'Guide.' }),
      'guide/deep.md': page({ title: 'Deep', description: 'Unlinked.' }),
    },
  })
  const report = await analyzeSite({ root: site.root })
  await site.cleanup()
  const orphan = report.issues.find((i) => i.type === 'nav' && i.msg.includes('orphan'))
  assert.ok(orphan, JSON.stringify(report.issues))
  assert.equal(orphan.file, 'guide/deep.md')
  assert.equal(orphan.level, 'info')
  // info never fails the command
  assert.equal(report.code, 0)
})

test('flags a duplicate route and a duplicate heading anchor', async () => {
  const site = await makeSite({
    content: {
      'index.md': OK_MD,
      'about.md': page({ title: 'About', description: 'About.' }),
      'about/index.md': page({ title: 'About again', description: 'Duplicate.', body: '# Intro\n\n## Intro\n' }),
    },
  })
  const report = await analyzeSite({ root: site.root })
  await site.cleanup()
  const routes = report.issues.filter((i) => i.type === 'routes')
  assert.ok(routes.some((i) => i.msg.includes('duplicate route')), JSON.stringify(report.issues))
  const anchors = report.issues.filter((i) => i.type === 'anchors')
  assert.ok(anchors.some((i) => i.msg.includes('duplicate heading id')), JSON.stringify(report.issues))
})

test('flags an invalid date and missing frontmatter', async () => {
  const site = await makeSite({
    content: {
      'index.md': OK_MD,
      'bad.md': '---\ndate: not-a-date\n---\n\nBody.\n',
    },
  })
  const report = await analyzeSite({ root: site.root })
  await site.cleanup()
  const fm = report.issues.filter((i) => i.type === 'frontmatter')
  assert.ok(fm.some((i) => i.msg.includes('invalid `date`')), JSON.stringify(fm))
  assert.ok(fm.some((i) => i.msg.includes('missing `title`')), JSON.stringify(fm))
  assert.equal(report.code, 1)
})

test('flags a missing asset and an image without alt text', async () => {
  const site = await makeSite({
    content: {
      'index.md': page({
        title: 'Home',
        description: 'Home.',
        body: '![](/nope.png)\n\n![](real.png)\n\n<img src="/x.png">',
      }),
    },
    public: { 'real.png': 'x' },
  })
  const report = await analyzeSite({ root: site.root })
  await site.cleanup()
  const alt = report.issues.filter((i) => i.type === 'alt')
  assert.ok(alt.some((i) => i.msg.includes('image missing alt text')), JSON.stringify(alt))
  assert.ok(alt.some((i) => i.msg.includes('<img> missing alt attribute')), JSON.stringify(alt))
  const assets = report.issues.filter((i) => i.type === 'assets')
  assert.ok(assets.some((i) => i.msg.includes('missing asset → /nope.png')), JSON.stringify(assets))
})

test('a section naming a component that does not exist is an error', async () => {
  const site = await makeSite({
    content: { 'index.md': OK_MD },
    config: { sections: [{ component: 'NotARealComponent' }] },
  })
  const report = await analyzeSite({ root: site.root })
  await site.cleanup()
  const issues = report.issues.filter((i) => i.type === 'components')
  assert.ok(issues.some((i) => i.msg.includes('NotARealComponent')), JSON.stringify(issues))
  assert.equal(report.code, 1)
})

test('a custom 404 page is noted but not an error', async () => {
  const site = await makeSite({
    content: { 'index.md': OK_MD, '404.md': page({ title: 'Nope', description: 'Missing.' }) },
  })
  const report = await analyzeSite({ root: site.root })
  await site.cleanup()
  const seo = report.issues.filter((i) => i.type === 'seo')
  assert.equal(seo.length, 1)
  assert.equal(seo[0].level, 'info')
  assert.equal(report.code, 0)
})
