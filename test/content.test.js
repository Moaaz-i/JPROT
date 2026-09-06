import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveContent, listMarkdown, listProjects, buildNavigation } from '../core/content.js'
import { setFallbackState, runScoped } from '../core/state.js'

let dir

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'jprot-content-'))
  mkdirSync(join(dir, 'projects'), { recursive: true })
  mkdirSync(join(dir, 'blog'), { recursive: true })
  writeFileSync(join(dir, 'index.md'), '---\ntitle: Home\n---\nhi')
  writeFileSync(join(dir, 'about.md'), '---\ntitle: About\n---\nabout')
  writeFileSync(join(dir, 'projects', 'proj.md'), '---\ntitle: Proj\norder: 1\n---\nbody')
})

test('resolveContent resolves bare, .md, index and README', async () => {
  assert.equal((await resolveContent(dir, '/about'))?.endsWith('about.md'), true)
  assert.equal((await resolveContent(dir, '/about.md'))?.endsWith('about.md'), true)
  assert.equal(await resolveContent(dir, '/'), null)
})

test('resolveContent rejects path traversal', async () => {
  assert.equal(await resolveContent(dir, '/../etc/passwd'), null)
  assert.equal(await resolveContent(dir, '/%2e%2e/etc/passwd'), null)
})

test('listMarkdown walks nested dirs', async () => {
  const files = (await listMarkdown(dir)).map((f) => f.slice(dir.length + 1))
  assert.ok(files.includes('index.md'))
  assert.ok(files.includes('projects/proj.md'))
})

test('listProjects reads config and sorts by order', async () => {
  setFallbackState({ site: { projectsDir: 'projects' } })
  const projects = await runScoped({ site: { projectsDir: 'projects' } }, () => listProjects(dir))
  assert.equal(projects.length, 1)
  assert.equal(projects[0].data.title, 'Proj')
})

test('buildNavigation includes top-level pages, omits hidden', async () => {
  writeFileSync(join(dir, 'hidden.md'), '---\ntitle: Secret\nhidden: true\n---\nx')
  const nav = await runScoped({}, () => buildNavigation(dir))
  const labels = nav.map((n) => n.label)
  assert.ok(labels.includes('About'))
  assert.ok(!labels.includes('Secret'))
})

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})
