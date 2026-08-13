import { contextBridge, ipcRenderer } from 'electron'

// Callbacks the plugin registers via window.workbench.onPluginEnter / etc.
let enterCb: ((e: { code: string; type: string; payload: unknown }) => void) | null = null
let outCb: (() => void) | null = null
let detachCb: (() => void) | null = null
let themeCb: ((isDark: boolean) => void) | null = null
let subInputCb: ((value: string) => void) | null = null

// If the host delivers 'wb:enter' before the plugin registers its handler
// (page scripts run after the preload), buffer and replay on registration.
let bufferedEnter: { code: string; type: string; payload: unknown } | null = null

ipcRenderer.on('wb:enter', (_e, payload: { code: string; type: string; payload: unknown }) => {
  if (enterCb) enterCb(payload)
  else bufferedEnter = payload
})
ipcRenderer.on('wb:out', () => outCb?.())
ipcRenderer.on('wb:detach', () => detachCb?.())
ipcRenderer.on('wb:theme', (_e, isDark: boolean) => themeCb?.(isDark))
ipcRenderer.on('wb:sub-input', (_e, value: string) => subInputCb?.(value))

const db = {
  get: (key: string) => ipcRenderer.invoke('wb:db-get', key),
  set: (key: string, value: unknown) => ipcRenderer.invoke('wb:db-set', key, value),
  remove: (key: string) => ipcRenderer.invoke('wb:db-remove', key)
}

contextBridge.exposeInMainWorld('workbench', {
  // --- lifecycle ---
  onPluginEnter(cb: (e: { code: string; type: string; payload: unknown }) => void) {
    enterCb = cb
    if (bufferedEnter) {
      const buffered = bufferedEnter
      bufferedEnter = null
      cb(buffered)
    }
  },
  onPluginOut(cb: () => void) {
    outCb = cb
  },
  onPluginDetach(cb: () => void) {
    detachCb = cb
  },

  // --- sub-input (a host-rendered secondary input; typing is forwarded here) ---
  setSubInput(cb: ((value: string) => void) | null, placeholder?: string) {
    subInputCb = cb
    ipcRenderer.send('wb:set-sub-input', placeholder)
  },
  removeSubInput() {
    subInputCb = null
    ipcRenderer.send('wb:remove-sub-input')
  },
  setSubInputValue(value: string) {
    ipcRenderer.send('wb:set-sub-input-value', value)
  },

  // --- layout ---
  setExpendHeight(height: number) {
    ipcRenderer.invoke('wb:set-expend-height', height)
  },
  detachPlugin() {
    ipcRenderer.send('wb:detach')
  },

  // --- clipboard ---
  copyText(text: string) {
    ipcRenderer.invoke('wb:copy-text', text)
  },

  // --- dialogs ---
  showOpenDialog(options?: unknown) {
    return ipcRenderer.invoke('wb:show-open-dialog', options)
  },
  showSaveDialog(options?: unknown) {
    return ipcRenderer.invoke('wb:show-save-dialog', options)
  },

  // --- paths (sync, cheap, called once) ---
  getPath(name: string) {
    return ipcRenderer.sendSync('wb:get-path', name)
  },

  // --- per-plugin KV ---
  db,

  // --- appearance ---
  isDarkColors() {
    return ipcRenderer.sendSync('wb:is-dark')
  },
  onThemeChange(cb: (isDark: boolean) => void) {
    themeCb = cb
  },

  // --- misc ---
  toast(text: string) {
    ipcRenderer.send('wb:toast', text)
  },
  getPlatform() {
    return ipcRenderer.sendSync('wb:get-platform')
  },
  setFeatures(features: unknown) {
    ipcRenderer.send('wb:set-features', features)
  }
})
