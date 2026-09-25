import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, sep } from 'node:path'
import { createChangeClassifier } from '../../core/watch.js'
import { makeSite } from '../helpers/site.js'

const ROOT = join(sep, 'site')
const at = (...parts) => join(ROOT, ...parts)

const classify = createChangeClassifier({
  projectRoot: ROOT,
  contentDir: at('content'),
  userThemeDir: at('theme'),
  publicDir: at('public'),
  configFiles: [at('jprot.config.js'), at('jprot.config.json')],
})

test('a config edit is the only kind that busts the module cache', () => {
  assert.equal(classify(at('jprot.config.js')).kind, 'config')
  assert.equal(classify(at('jprot.config.json')).kind, 'config')
  assert.equal(classify(at('jprot.config.js')).bust, true)
  assert.equal(classify(at('jprot.config.js')).rebuild, 'all')
})

test('content edits rebuild the graph without busting the cache', () => {
  const change = classify(at('content', 'blog', 'hello.md'))
  assert.equal(change.kind, 'content')
  assert.equal(change.bust, false)
  assert.equal(change.rebuild, 'graph')
  assert.equal(change.rel, 'content/blog/hello.md')
  // A content-adjacent image is content too, not a public asset.
  assert.equal(classify(at('content', 'img', 'a.png')).kind, 'content')
})

test('theme edits rebuild components and CSS', () => {
  const change = classify(at('theme', 'main.js'))
  assert.equal(change.kind, 'component')
  assert.equal(change.bust, true)
  assert.equal(change.rebuild, 'theme')
  assert.equal(classify(at('theme', 'styles.css')).kind, 'component')
  assert.equal(classify(at('theme', 'components', 'Hero.js')).kind, 'component')
  // A theme elsewhere in a monorepo still counts.
  assert.equal(classify(at('examples', 'docs', 'theme', 'main.js')).kind, 'component')
})

test('public/ edits need no rebuild at all', () => {
  const change = classify(at('public', 'covers', 'a.png'))
  assert.equal(change.kind, 'asset')
  assert.equal(change.bust, false)
  assert.equal(change.rebuild, 'none')
})

test('build output, dependencies and VCS metadata are ignored', () => {
  // `jprot export` writing into dist/ must not trigger a reload, or previewing
  // a build reloads the dev server in a loop.
  assert.equal(classify(at('dist', 'index.html')).kind, 'ignored')
  assert.equal(classify(at('node_modules', 'jprot', 'core', 'server.js')).kind, 'ignored')
  assert.equal(classify(at('.git', 'index')).kind, 'ignored')
  assert.equal(classify(at('coverage', 'index.html')).kind, 'ignored')
  assert.equal(classify(at('.next', 'build')).kind, 'ignored')
  assert.equal(classify(at('content', 'node_modules', 'x.md')).kind, 'ignored')
  // Anything else outside the watched roots, too.
  assert.equal(classify(at('README.md')).kind, 'ignored')
  assert.equal(classify(ROOT).kind, 'ignored')
})

test('the classifier needs no project on disk to answer', async () => {
  const site = await makeSite({ content: { 'index.md': '---\ntitle: A\ndescription: b\n---\n' } })
  const classifyReal = createChangeClassifier({
    projectRoot: site.root,
    contentDir: join(site.root, 'content'),
    userThemeDir: join(site.root, 'theme'),
    publicDir: join(site.root, 'public'),
    configFiles: [join(site.root, 'jprot.config.js')],
  })
  const actual = classifyReal(join(site.root, 'content', 'index.md'))
  await site.cleanup()
  assert.equal(actual.kind, 'content')
  assert.equal(actual.rel, 'content/index.md')
})
