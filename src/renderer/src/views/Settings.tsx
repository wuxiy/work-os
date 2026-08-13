import { useEffect, useRef, useState } from 'react'
import type { PluginSummary } from '@wb/plugin-kit'
import type { Theme } from '../../../shared/ipc/api'
import Marketplace from '../components/Marketplace'
import Updates from '../components/Updates'

type Tab = 'general' | 'marketplace' | 'updates'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('general')
  const [hotkey, setHotkey] = useState('…')
  const [theme, setTheme] = useState<Theme>('system')
  const [plugins, setPlugins] = useState<PluginSummary[]>([])
  const [hotkeyError, setHotkeyError] = useState('')
  const [installMsg, setInstallMsg] = useState('')
  const hotkeyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.api.getHotkey().then(setHotkey)
    void window.api.getTheme().then(setTheme)
    void refreshPlugins()
    const off = window.apiOn('plugins-changed', () => void refreshPlugins())
    return off
  }, [])

  async function refreshPlugins() {
    setPlugins(await window.api.listPlugins())
  }

  async function captureHotkey() {
    setHotkeyError('')
    const input = hotkeyRef.current
    if (!input) return
    input.value = 'Press a key combo…'
    input.focus()
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault()
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
      const parts: string[] = []
      if (e.metaKey) parts.push('Command')
      if (e.ctrlKey) parts.push('Control')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      let key = e.key === ' ' ? 'Space' : e.key
      parts.push(key.length === 1 ? key.toUpperCase() : key)
      const accel = parts.join('+')
      input.removeEventListener('keydown', onKey)
      input.value = accel
      const ok = await window.api.setHotkey(accel)
      if (ok) setHotkey(accel)
      else setHotkeyError('That shortcut is unavailable.')
    }
    input.addEventListener('keydown', onKey)
  }

  async function changeTheme(t: Theme) {
    await window.api.setTheme(t)
    setTheme(t)
  }

  async function installFromFolder() {
    setInstallMsg('')
    try {
      const summary = await window.api.installPluginDialog()
      if (summary) {
        setInstallMsg(`Installed ${summary.name} v${summary.version}.`)
        await refreshPlugins()
      }
    } catch (err) {
      setInstallMsg(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-8 text-zinc-800 dark:text-zinc-100">
      <div className="mb-6 flex gap-1 border-b border-zinc-200 pb-px dark:border-zinc-700">
        {(['general', 'marketplace', 'updates'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${
              tab === t
                ? 'border-blue-500 text-blue-600 dark:text-blue-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'general' ? (
        <>
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-medium text-zinc-500">Global Hotkey</h2>
            <div className="flex items-center gap-2">
              <input
                ref={hotkeyRef}
                readOnly
                value={hotkey}
                className="w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-600"
              />
              <button
                onClick={captureHotkey}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Change
              </button>
            </div>
            {hotkeyError && <p className="mt-1 text-xs text-red-500">{hotkeyError}</p>}
          </section>

          <section className="mb-8">
            <h2 className="mb-2 text-sm font-medium text-zinc-500">Theme</h2>
            <div className="flex gap-2">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => changeTheme(t)}
                  className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                    theme === t
                      ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                      : 'border-zinc-300 dark:border-zinc-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-500">Installed Plugins</h2>
              <button
                onClick={installFromFolder}
                className="rounded-md border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-600"
              >
                Install from folder…
              </button>
            </div>
            {installMsg && <p className="mb-2 text-xs text-zinc-500">{installMsg}</p>}
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {plugins.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  {p.logo ? (
                    <img src={p.logo} alt="" className="h-8 w-8 rounded-md" draggable={false} />
                  ) : (
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-zinc-200 text-sm dark:bg-zinc-700">
                      {p.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p.name} <span className="text-xs text-zinc-400">v{p.version}</span>
                    </div>
                    <div className="truncate text-xs text-zinc-400">{p.description}</div>
                  </div>
                  {p.builtin && (
                    <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-700">
                      built-in
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : tab === 'marketplace' ? (
        <Marketplace />
      ) : (
        <Updates />
      )}
    </div>
  )
}
