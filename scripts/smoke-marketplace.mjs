// Verifies the marketplace install mechanics against the real generated
// artifacts: serve marketplace/ over HTTP, fetch the registry, download a zip,
// verify its sha256, extract with adm-zip, and validate the plugin manifest +
// layout. Pure Node — exercises the same steps src/main/plugin/marketplace.ts
// performs. Run: node scripts/smoke-marketplace.mjs
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const market = join(root, 'marketplace')
const assert = (cond, msg) => {
  if (!cond) throw new Error('assertion failed: ' + msg)
}

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '').split('?')[0])
  const file = url === '/' || url === '' ? join(market, 'registry.json') : join(market, url)
  if (!existsSync(file)) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.end(readFileSync(file))
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const base = `http://127.0.0.1:${port}/`
const tmp = join(root, '.smoke-marketplace-tmp')

try {
  // 1. fetch registry
  const reg = await (await fetch(base + 'registry.json')).json()
  assert(Array.isArray(reg.plugins) && reg.plugins.length === 3, `registry has 3 plugins (got ${reg?.plugins?.length})`)
  console.log('SMOKE-MARKET registry fetched:', reg.plugins.length, 'entries')

  for (const entry of reg.plugins) {
    // 2. download + sha256 integrity
    const buf = Buffer.from(await (await fetch(base + entry.download)).arrayBuffer())
    const sha = createHash('sha256').update(buf).digest('hex')
    assert(sha === entry.sha256, `${entry.id}: sha256 matches`)

    // 3. extract (no-wrapper layout) into <tmp>/<name>@<version>
    const zip = new AdmZip(buf)
    const manifestEntry = zip
      .getEntries()
      .find((e) => !e.isDirectory && (e.entryName === 'plugin.json' || e.entryName.endsWith('/plugin.json')))
    assert(manifestEntry, `${entry.id}: zip contains plugin.json`)
    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'))
    assert(manifest.pluginName && manifest.version && Array.isArray(manifest.features), `${entry.id}: manifest valid`)
    const id = `${manifest.pluginName}@${manifest.version}`
    const target = join(tmp, id)
    mkdirSync(target, { recursive: true })
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue
      const dest = join(target, e.entryName)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, e.getData())
    }
    assert(existsSync(join(target, 'index.html')), `${entry.id}: index.html extracted`)
    assert(existsSync(join(target, 'plugin.json')), `${entry.id}: plugin.json extracted`)
    console.log(`SMOKE-MARKET installed ${id}`)
  }

  console.log('SMOKE-MARKETPLACE RESULT: PASS')
} catch (err) {
  console.log('SMOKE-MARKETPLACE RESULT: FAIL -', err.message)
  process.exitCode = 1
} finally {
  server.close()
  rmSync(tmp, { recursive: true, force: true })
}
