import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  marketplaceRegistrySchema,
  pluginManifestSchema,
  type MarketplaceEntry
} from '@wb/plugin-kit'
import { userPluginsDir } from '../paths'
import { settings } from '../store'
import { discoverAll, getRecord, toSummary } from './manager'
import { verifyRegistrySignature } from './signing'

interface CachedRegistry {
  entries: MarketplaceEntry[]
  baseUrl: string
}
let cached: CachedRegistry | null = null

export function getRegistryUrl(): string {
  return settings.get('registryUrl')
}

export function setRegistryUrl(url: string): void {
  settings.set('registryUrl', url.trim())
  invalidateRegistryCache() // force a refetch against the new URL
}

/** Drop the cached registry so the next fetch re-verifies (e.g. after a trust change). */
export function invalidateRegistryCache(): void {
  cached = null
}

/** Fetch + validate the registry, cache it, return its entries. */
export async function fetchRegistry(): Promise<MarketplaceEntry[]> {
  const url = settings.get('registryUrl')
  if (!url) throw new Error('No marketplace registry URL set. Configure one in Settings.')

  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Registry request failed: ${res.status} ${res.statusText}`)
  const json = (await res.json()) as unknown
  const parsed = marketplaceRegistrySchema.parse(json)

  // Signature gate: if the registry is signed, always verify it; if the user
  // requires signatures, reject unsigned registries. The trust anchor is the
  // locally-pinned set of public keys, so a forged/tampered registry is refused.
  const trustedKeys = settings.get('trustedKeys') as Record<string, string>
  const requireSigned = settings.get('requireSignedRegistry') as boolean
  const signature = parsed.signature
  const keyId = parsed.keyId
  if (signature || requireSigned) {
    if (!signature || !keyId) {
      throw new Error('Registry is not signed, but a signature is required.')
    }
    const result = verifyRegistrySignature(parsed, signature, keyId, trustedKeys)
    if (!result.accepted) throw new Error(`Registry signature rejected: ${result.reason}`)
  }

  const baseUrl = url.includes('/') ? url.slice(0, url.lastIndexOf('/') + 1) : ''
  cached = { entries: parsed.plugins, baseUrl }
  return parsed.plugins
}

function resolveUrl(url: string, baseUrl: string): string {
  if (/^(https?|file|ftp):\/\//i.test(url)) return url
  return baseUrl + url
}

async function downloadZip(url: string, expectedSha256?: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (expectedSha256) {
    const hash = createHash('sha256').update(buf).digest('hex')
    if (hash !== expectedSha256.toLowerCase()) {
      throw new Error('Integrity check failed: sha256 mismatch')
    }
  }
  return buf
}

/** Install (or update) a plugin from a cached marketplace entry by id. */
export async function installFromMarketplace(entryId: string) {
  if (!cached) await fetchRegistry()
  const entry = cached?.entries.find((e) => e.id === entryId)
  if (!entry) throw new Error(`Marketplace entry not found: ${entryId}`)

  const zipBuf = await downloadZip(resolveUrl(entry.download, cached!.baseUrl), entry.sha256)
  const zip = new AdmZip(zipBuf)

  // Read the manifest straight out of the zip to get the stable install id and
  // to validate the package before touching the filesystem.
  const manifestEntry = zip
    .getEntries()
    .find((e) => !e.isDirectory && (e.entryName === 'plugin.json' || e.entryName.endsWith('/plugin.json')))
  if (!manifestEntry) throw new Error('Plugin package has no plugin.json')
  const manifest = pluginManifestSchema.parse(JSON.parse(manifestEntry.getData().toString('utf8')))
  const id = `${manifest.pluginName}@${manifest.version}`

  const target = join(userPluginsDir(), id)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })

  // Extract, stripping a single common top-level wrapper directory if present.
  const files = zip.getEntries().filter((e) => !e.isDirectory)
  const tops = new Set(files.map((e) => e.entryName.split('/')[0]))
  const hasWrapper = files.length > 0 && tops.size === 1 && files.every((e) => e.entryName.includes('/'))
  for (const entry2 of files) {
    const rel = hasWrapper ? entry2.entryName.slice(entry2.entryName.indexOf('/') + 1) : entry2.entryName
    if (!rel) continue
    const dest = join(target, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, entry2.getData())
  }

  discoverAll()
  const record = getRecord(id)
  if (!record) throw new Error('Package installed but could not be loaded (invalid plugin)')
  return toSummary(record)
}
