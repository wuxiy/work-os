// Packages every built plugin (out/plugins/*) into a zip and emits a registry
// JSON so the repo (or any static host) can serve as its own marketplace.
// Run: pnpm build:marketplace   (builds plugins first, then this)
import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const builtPlugins = join(root, 'out', 'plugins')
const market = join(root, 'marketplace')
const zipDir = join(market, 'plugins')

if (!existsSync(builtPlugins)) {
  console.error('[build-marketplace] out/plugins not found — run "pnpm build:plugins" first.')
  process.exit(1)
}
mkdirSync(zipDir, { recursive: true })

const names = readdirSync(builtPlugins, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const entries = []
for (const name of names) {
  const dir = join(builtPlugins, name)
  const manifest = JSON.parse(readFileSync(join(dir, 'plugin.json'), 'utf8'))
  const version = manifest.version
  const zipName = `${name}-${version}.zip`
  const zipPath = join(zipDir, zipName)

  const zip = new AdmZip()
  zip.addLocalFolder(dir) // files at zip root (no wrapper) → clean extraction
  zip.writeZip(zipPath)

  const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex')

  const logoSrc = join(dir, manifest.logo || 'logo.png')
  const hasLogo = existsSync(logoSrc)
  if (hasLogo) copyFileSync(logoSrc, join(zipDir, `${name}.png`))

  entries.push({
    id: name,
    name: manifest.pluginName,
    version,
    description: manifest.description || '',
    author: manifest.author || '',
    homepage: manifest.homepage || '',
    logo: hasLogo ? `plugins/${name}.png` : undefined,
    download: `plugins/${zipName}`,
    sha256
  })
  console.log(`[build-marketplace] packaged ${name}@${version} → marketplace/${zipName}`)
}

const registry = {
  name: 'Work-OS Marketplace',
  updated: new Date().toISOString(),
  plugins: entries
}
writeFileSync(join(market, 'registry.json'), JSON.stringify(registry, null, 2))
console.log(`[build-marketplace] wrote ${entries.length} entries → marketplace/registry.json`)
