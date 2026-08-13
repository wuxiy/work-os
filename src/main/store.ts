import Store from 'electron-store'
import type { Theme } from '../shared/ipc/api'

interface SettingsSchema {
  hotkey: string
  theme: Theme
  disabledPlugins: string[]
  hideOnBlur: boolean
  registryUrl: string
  requireSignedRegistry: boolean
  trustedKeys: Record<string, string>
  updateFeedUrl: string
}

const defaults: SettingsSchema = {
  hotkey: process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space',
  theme: 'system',
  disabledPlugins: [],
  hideOnBlur: true,
  registryUrl: '',
  requireSignedRegistry: false,
  trustedKeys: {},
  updateFeedUrl: ''
}

// electron-store calls app.getPath() on construction, which throws before the
// app is ready. Lazily build it on first access so modules can import this
// proxy at the top level safely.
let _store: Store<SettingsSchema> | null = null
function store(): Store<SettingsSchema> {
  if (!_store) _store = new Store<SettingsSchema>({ defaults, name: 'work-os-settings' })
  return _store
}

export const settings = new Proxy({} as Store<SettingsSchema>, {
  get(_t, prop: string | symbol) {
    const s = store()
    const value = (s as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(s)
      : value
  }
})
