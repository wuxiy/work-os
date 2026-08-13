import { contextBridge, ipcRenderer } from 'electron'
import { channelFor, eventChannelFor, type MainApi } from '../shared/ipc/api'

// Method names of MainApi. Each becomes an invoke channel; the renderer's
// `window.api` is typed as MainApi, so adding a method here + to MainApi gives
// the renderer autocomplete with no hand-written glue (skill ref 04).
const API_METHODS: (keyof MainApi)[] = [
  'listPlugins',
  'enablePlugin',
  'installPlugin',
  'installPluginDialog',
  'uninstallPlugin',
  'listMarketplace',
  'installFromMarketplace',
  'getRegistryUrl',
  'setRegistryUrl',
  'getMarketplaceSecurity',
  'setMarketplaceSecurity',
  'checkForUpdates',
  'getUpdateStatus',
  'quitAndInstall',
  'getUpdateFeedUrl',
  'setUpdateFeedUrl',
  'subInputTyping',
  'detachActivePlugin',
  'getTriggerContext',
  'activatePlugin',
  'exitPlugin',
  'getHotkey',
  'setHotkey',
  'getTheme',
  'setTheme',
  'getPlatform',
  'isDarkColors',
  'showMainWindow',
  'openSettings',
  'quitApp'
]

const api = {} as Record<string, (...args: unknown[]) => Promise<unknown>>
for (const method of API_METHODS) {
  api[method] = (...args: unknown[]) => ipcRenderer.invoke(channelFor(method), ...args)
}

contextBridge.exposeInMainWorld('api', api)

contextBridge.exposeInMainWorld('apiOn', (event: string, cb: (...args: unknown[]) => void) => {
  const ch = eventChannelFor(event)
  const listener = (_e: unknown, ...args: unknown[]) => cb(...args)
  ipcRenderer.on(ch, listener)
  return () => ipcRenderer.removeListener(ch, listener)
})

// Sync platform so the renderer can paint the correct window chrome (mac
// traffic-light padding vs Windows custom controls) before any async IPC.
// Dark state is read via matchMedia — Electron mirrors nativeTheme to it.
contextBridge.exposeInMainWorld('host', { platform: process.platform })
