import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync
} from 'node:fs'
import { join } from 'node:path'
import {
  pluginManifestSchema,
  type Feature,
  type PluginRecord,
  type PluginSummary
} from '@wb/plugin-kit'
import { builtinPluginsDir, userPluginsDir } from '../paths'
import { settings } from '../store'

const records = new Map<string, PluginRecord>()

// Runtime overlay of dynamic features set via wb.setFeatures (session-only,
// not persisted). Takes precedence over the manifest's static features.
const dynamicFeatures = new Map<string, Feature[]>()

function ensureUserPluginsDir(): void {
  const dir = userPluginsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function loadOne(dir: string, builtin: boolean): PluginRecord | null {
  const manifestPath = join(dir, 'plugin.json')
  if (!existsSync(manifestPath)) return null

  let json: unknown
  try {
    json = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    console.warn(`[plugin] unreadable/invalid JSON manifest: ${manifestPath}`)
    return null
  }

  const parsed = pluginManifestSchema.safeParse(json)
  if (!parsed.success) {
    console.warn(`[plugin] manifest failed schema validation in ${dir}:\n${parsed.error.toString()}`)
    return null
  }
  const manifest = parsed.data

  const id = `${manifest.pluginName}@${manifest.version}`
  return {
    id,
    manifest,
    rootDir: dir,
    mainPath: join(dir, manifest.main ?? 'index.html'),
    logoPath: join(dir, manifest.logo),
    enabled: !settings.get('disabledPlugins').includes(id),
    builtin
  }
}

function discoverIn(parentDir: string, builtin: boolean): void {
  if (!existsSync(parentDir)) return
  let entries
  try {
    entries = readdirSync(parentDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const rec = loadOne(join(parentDir, entry.name), builtin)
    if (rec) records.set(rec.id, rec)
  }
}

/** Scan built-in + user plugin dirs and rebuild the in-memory registry. */
export function discoverAll(): void {
  records.clear()
  discoverIn(builtinPluginsDir(), true)
  ensureUserPluginsDir()
  discoverIn(userPluginsDir(), false)
}

export function listRecords(): PluginRecord[] {
  return [...records.values()]
}
export function getRecord(id: string): PluginRecord | undefined {
  return records.get(id)
}

function logoAsDataUrl(path: string): string {
  try {
    const buf = readFileSync(path)
    const ext = path.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
    return `data:image/${ext};base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}

export function toSummary(r: PluginRecord): PluginSummary {
  return {
    id: r.id,
    name: r.manifest.pluginName,
    version: r.manifest.version,
    description: r.manifest.description ?? '',
    logo: logoAsDataUrl(r.logoPath),
    features: dynamicFeatures.get(r.id) ?? r.manifest.features,
    builtin: r.builtin,
    enabled: r.enabled
  }
}

/** Enabled plugins only — what the launcher match engine should see. */
export function enabledSummaries(): PluginSummary[] {
  return listRecords()
    .filter((r) => r.enabled)
    .map(toSummary)
}

export function setEnabled(id: string, enabled: boolean): void {
  const r = records.get(id)
  if (!r) return
  r.enabled = enabled
  const disabled = new Set(settings.get('disabledPlugins'))
  if (enabled) disabled.delete(id)
  else disabled.add(id)
  settings.set('disabledPlugins', [...disabled])
}

/** Replace a plugin's feature list at runtime (dynamic features, session-only). */
export function setDynamicFeatures(pluginId: string, features: Feature[]): void {
  dynamicFeatures.set(pluginId, features)
}

/** Copy a plugin folder into userData/plugins/<id> and reload the registry. */
export function installPlugin(dir: string): PluginSummary {
  const probe = loadOne(dir, false)
  if (!probe) {
    throw new Error('Not a valid plugin: missing or schema-invalid plugin.json')
  }
  const target = join(userPluginsDir(), probe.id)
  rmSync(target, { recursive: true, force: true })
  cpSync(dir, target, { recursive: true })
  discoverAll()
  const rec = getRecord(probe.id)
  if (!rec) throw new Error('Install succeeded but plugin could not be loaded')
  return toSummary(rec)
}

export function uninstallPlugin(id: string): void {
  const r = records.get(id)
  if (!r) return
  if (r.builtin) throw new Error('Built-in plugins cannot be uninstalled')
  rmSync(join(userPluginsDir(), id), { recursive: true, force: true })
  const disabled = new Set(settings.get('disabledPlugins'))
  disabled.delete(id)
  settings.set('disabledPlugins', [...disabled])
  dynamicFeatures.delete(id)
  discoverAll()
}
