#!/usr/bin/env node
// `npm create jprot [dir]` — scaffold a JPROT site in under a minute.
//
// The scaffold engine lives in the `jprot` package (imported as
// `jprot/scaffold`). When this file runs from a checkout (create-jprot/
// sitting next to core/), it falls back to the local copy so the flow can be
// tested without publishing either package.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

async function pathExists(p) {
  try { await stat(p); return true } catch { return false }
}

async function loadScaffold() {
  try {
    return await import('jprot/scaffold')
  } catch {
    return await import('../core/scaffold.js')
  }
}

// The dependency spec written into the generated site's package.json comes
// from this package's own `dependencies.jprot`, so both stay in lockstep.
async function jprotSpec() {
  try {
    const own = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
    return own.dependencies?.jprot || 'latest'
  } catch {
    return 'latest'
  }
}

function run(cmd, args, cwd) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('error', () => done(false))
    child.on('exit', (code) => done(code === 0))
  })
}

async function main() {
  const args = process.argv.slice(2)
  const dir = args.find((a) => !a.startsWith('-')) || '.'
  const type = ['portfolio', 'docs', 'resume'].find((t) => args.includes('--' + t)) || 'portfolio'
  const noInstall = args.includes('--no-install')
  const root = resolve(process.cwd(), dir)

  if (await pathExists(join(root, 'jprot.config.js')) || await pathExists(join(root, 'content'))) {
    console.error(`  \u2716 ${dir} already contains a JPROT site.`)
    process.exitCode = 1
    return
  }

  await mkdir(root, { recursive: true })
  const { scaffoldSite } = await loadScaffold()
  await scaffoldSite({ root, type })

  const spec = await jprotSpec()
  await writeFile(join(root, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    scripts: {
      start: 'jprot',
      dev: 'jprot',
      lint: 'jprot lint',
      export: 'jprot export',
    },
    dependencies: { jprot: spec },
  }, null, 2) + '\n', 'utf8')

  console.log('')
  console.log(`  \u2714 JPROT site ready in ${dir === '.' ? 'the current folder' : dir}.`)
  if (!noInstall) {
    console.log('  … installing dependencies')
    const ok = await run('npm', ['install'], root)
    if (!ok) console.log('  \u2716 npm install failed — run it manually.')
  }
  console.log('')
  console.log('  Next:')
  if (dir !== '.') console.log(`    cd ${dir}`)
  if (noInstall) console.log('    npm install')
  console.log('    npm start')
  console.log('')
}

await main()