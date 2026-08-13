import { useEffect, useState } from 'react'
import type { MarketplaceEntry, PluginSummary } from '@wb/plugin-kit'
import type { MarketplaceSecurity } from '../../../shared/ipc/api'

type InstallState = Record<string, 'idle' | 'installing' | 'done' | 'error'>

function parseSemver(v: string): number[] {
  return v.split('.').map((p) => parseInt(p.replace(/\D/g, ''), 10) || 0)
}
function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

export default function Marketplace() {
  const [registryUrl, setRegistryUrl] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [entries, setEntries] = useState<MarketplaceEntry[]>([])
  const [installed, setInstalled] = useState<PluginSummary[]>([])
  const [states, setStates] = useState<InstallState>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [security, setSecurity] = useState<MarketplaceSecurity>({
    requireSignedRegistry: false,
    trustedKeys: {}
  })
  const [keyId, setKeyId] = useState('')
  const [pubkey, setPubkey] = useState('')

  useEffect(() => {
    void window.api.getRegistryUrl().then((url: string) => {
      setRegistryUrl(url)
      setUrlDraft(url)
    })
    void window.api.getMarketplaceSecurity().then(setSecurity)
    void refreshInstalled()
  }, [])

  async function refreshInstalled() {
    setInstalled(await window.api.listPlugins())
  }

  async function load() {
    setError('')
    setLoading(true)
    try {
      setEntries(await window.api.listMarketplace())
      await refreshInstalled()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  async function saveUrl() {
    await window.api.setRegistryUrl(urlDraft.trim())
    setRegistryUrl(urlDraft.trim())
  }

  async function saveSecurity(next: MarketplaceSecurity) {
    await window.api.setMarketplaceSecurity(next)
    setSecurity(next)
  }

  function addTrustedKey() {
    const id = keyId.trim()
    const key = pubkey.trim()
    if (!id || !key) return
    void saveSecurity({ ...security, trustedKeys: { ...security.trustedKeys, [id]: key } })
    setKeyId('')
    setPubkey('')
  }

  function removeTrustedKey(id: string) {
    const next = { ...security.trustedKeys }
    delete next[id]
    void saveSecurity({ ...security, trustedKeys: next })
  }

  function installedVersion(name: string): string | undefined {
    return installed.find((p) => p.name === name)?.version
  }

  async function install(entry: MarketplaceEntry) {
    setStates((s) => ({ ...s, [entry.id]: 'installing' }))
    try {
      await window.api.installFromMarketplace(entry.id)
      await refreshInstalled()
      setStates((s) => ({ ...s, [entry.id]: 'done' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStates((s) => ({ ...s, [entry.id]: 'error' }))
    }
  }

  const trustedIds = Object.keys(security.trustedKeys)

  return (
    <>
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Marketplace</h2>
        <div className="mb-3 flex items-center gap-2">
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            spellCheck={false}
            placeholder="https://example.com/registry.json"
            className="selectable min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-600"
          />
          <button
            onClick={saveUrl}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-zinc-600 dark:hover:bg-white/10"
          >
            Save
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>

        {!registryUrl && (
          <p className="mb-3 text-xs text-zinc-400">
            Paste a registry URL (a JSON file listing plugins), save, then Load. Run
            <code className="mx-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800">pnpm build:marketplace</code>
            to generate one from your plugins.
          </p>
        )}
        {error && <p className="mb-3 break-all text-xs text-red-500">{error}</p>}

        <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {entries.map((entry) => {
            const have = installedVersion(entry.name)
            const newer = have ? compareVersions(entry.version, have) > 0 : false
            const st = states[entry.id]
            return (
              <li key={entry.id} className="flex items-center gap-3 py-3">
                {entry.logo ? (
                  <img src={entry.logo} alt="" className="h-8 w-8 rounded-md" draggable={false} />
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded-md bg-zinc-200 text-sm dark:bg-zinc-700">
                    {entry.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {entry.name} <span className="text-xs text-zinc-400">v{entry.version}</span>
                  </div>
                  <div className="truncate text-xs text-zinc-400">{entry.description}</div>
                </div>
                {have && !newer ? (
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    Installed
                  </span>
                ) : (
                  <button
                    onClick={() => install(entry)}
                    disabled={st === 'installing'}
                    className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {st === 'installing' ? '…' : newer ? 'Update' : 'Install'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">Signature Trust</h2>
        <p className="mb-3 text-xs text-zinc-400">
          Registries may be Ed25519-signed by their operator. Pin the operator's public
          key here; signed registries are always verified, and you can require signatures.
          Generate a keypair with
          <code className="mx-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800">pnpm keygen</code>.
        </p>

        <label className="mb-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={security.requireSignedRegistry}
            onChange={(e) => void saveSecurity({ ...security, requireSignedRegistry: e.target.checked })}
          />
          Require signed registry (reject unsigned)
        </label>

        <ul className="mb-3 divide-y divide-zinc-200 dark:divide-zinc-700">
          {trustedIds.length === 0 && (
            <li className="py-2 text-xs text-zinc-400">No trusted keys pinned.</li>
          )}
          {trustedIds.map((id) => (
            <li key={id} className="flex items-center gap-2 py-2">
              <span className="shrink-0 text-xs font-medium">{id}</span>
              <code className="min-w-0 flex-1 truncate rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] dark:bg-zinc-800">
                {security.trustedKeys[id]}
              </code>
              <button
                onClick={() => removeTrustedKey(id)}
                className="text-xs text-red-500 hover:underline"
              >
                remove
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <input
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            placeholder="key id"
            spellCheck={false}
            className="selectable w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-600"
          />
          <input
            value={pubkey}
            onChange={(e) => setPubkey(e.target.value)}
            placeholder="base64 SPKI public key"
            spellCheck={false}
            className="selectable min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 font-mono text-[11px] dark:border-zinc-600"
          />
          <button
            onClick={addTrustedKey}
            disabled={!keyId.trim() || !pubkey.trim()}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-white/10"
          >
            Add
          </button>
        </div>
      </section>
    </>
  )
}
