// Verifies the auto-update feed-reading integration against the packaged app:
// serves a local feed (latest-mac.yml at the SAME version → "update not
// available"), and launches the packaged binary pointed at it. PASS if the
// updater reaches the feed and reports a status.
//
// Uses an isolated --user-data-dir so the single-instance lock and settings
// never collide with the real app or prior runs. Run: pnpm smoke:update
import { createServer } from 'node:http'
import { spawn, execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()

const appBin = join(root, 'release/mac/Work-OS.app/Contents/MacOS/Work-OS')
const srcYml = join(root, 'release/latest-mac.yml')
if (!existsSync(appBin) || !existsSync(srcYml)) {
  console.log('SMOKE-UPDATE: FAIL — packaged app / latest-mac.yml missing. Run "pnpm package:dir" first.')
  process.exit(1)
}

// Clear any orphaned instances from earlier runs.
try {
  execSync('pkill -9 -f "MacOS/Work-OS"', { stdio: 'ignore' })
} catch {
  /* none */
}
await new Promise((r) => setTimeout(r, 800))

// Isolated userData so the instance lock + settings don't collide.
const userData = join(tmpdir(), `work-os-smoke-${process.pid}`)
rmSync(userData, { recursive: true, force: true })
mkdirSync(userData, { recursive: true })

// Local feed (same version → not-available, so nothing is downloaded).
const feedDir = join(root, '.smoke-update-feed')
mkdirSync(feedDir, { recursive: true })
copyFileSync(srcYml, join(feedDir, 'latest-mac.yml'))

const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '')
  const file = join(feedDir, rel)
  if (!existsSync(file)) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const feedUrl = `http://127.0.0.1:${port}/`

// Seed the feed URL into the isolated settings file.
writeFileSync(join(userData, 'work-os-settings.json'), JSON.stringify({ updateFeedUrl: feedUrl }))

const child = spawn(appBin, [`--user-data-dir=${userData}`], {
  env: { ...process.env, WORKOS_UPDATER_DEBUG: '1' }
})
let out = ''
child.stdout.on('data', (d) => {
  out += d.toString()
})
child.stderr.on('data', (d) => {
  out += d.toString()
})

// Auto-check fires ~5s after launch; give it room, then force-kill (Electron
// ignores SIGTERM).
await new Promise((r) => setTimeout(r, 9000))
try {
  child.kill('SIGKILL')
} catch {
  /* noop */
}
server.close()
rmSync(userData, { recursive: true, force: true })

const relevant = out
  .split('\n')
  .filter((l) => /update|Update|latest-mac|feed|checking|Checking/i.test(l))
console.log('--- relevant log lines ---')
console.log(relevant.join('\n').trim() || '(none)')

const reachedFeed =
  /is not available|Update for version|A new version|update-not-available/i.test(out) ||
  /Update for version .* is not available/i.test(out)

console.log('SMOKE-UPDATE RESULT:', reachedFeed ? 'PASS' : 'FAIL')
if (!reachedFeed) process.exitCode = 1
