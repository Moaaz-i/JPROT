import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('CLI exposes help and package version without starting a server', async () => {
  const help = await exec(process.execPath, ['core/cli.js', '--help'], { cwd: root })
  assert.match(help.stdout, /JPROT - Portfolio site generator/)
  const version = await exec(process.execPath, ['core/cli.js', '--version'], { cwd: root })
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/)
})
