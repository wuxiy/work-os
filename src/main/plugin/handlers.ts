import { app, clipboard, dialog, ipcMain, Notification } from 'electron'
import { featureArraySchema } from '@wb/plugin-kit'
import { getPluginStore } from './db'
import { setDynamicFeatures } from './manager'
import { detach, pluginIdForSender, setExpendHeight, setSubInput, setSubInputValue } from './runner'
import { getMainWindow } from '../window/main-window'
import { eventChannelFor } from '../../shared/ipc/api'
import { resolveIsDark } from '../theme'

const PATH_MAP: Record<string, string> = {
  home: 'home',
  appData: 'appData',
  desktop: 'desktop',
  documents: 'documents',
  downloads: 'downloads',
  temp: 'temp'
}

/** Register every `wb:*` channel that backs the `window.workbench` surface. */
export function registerPluginHandlers(): void {
  // --- per-plugin KV store ---
  ipcMain.handle('wb:db-get', (e, key: string) => {
    const id = pluginIdForSender(e.sender)
    return id ? getPluginStore(id).get(key) : undefined
  })
  ipcMain.handle('wb:db-set', (e, key: string, value: unknown) => {
    const id = pluginIdForSender(e.sender)
    if (id) getPluginStore(id).set(key, value)
  })
  ipcMain.handle('wb:db-remove', (e, key: string) => {
    const id = pluginIdForSender(e.sender)
    if (id) getPluginStore(id).delete(key)
  })

  // --- clipboard ---
  ipcMain.handle('wb:copy-text', (_e, text: string) => {
    clipboard.writeText(String(text))
  })

  // --- layout ---
  ipcMain.handle('wb:set-expend-height', (e, height: number) => {
    setExpendHeight(e.sender, height)
  })

  // --- sub-input (host-rendered secondary input) ---
  ipcMain.on('wb:set-sub-input', (_e, placeholder?: string) => setSubInput(true, placeholder))
  ipcMain.on('wb:remove-sub-input', () => setSubInput(false))
  ipcMain.on('wb:set-sub-input-value', (_e, value: string) => setSubInputValue(value))

  // --- detach (pop the active plugin into its own window) ---
  ipcMain.on('wb:detach', () => detach())

  // --- dynamic features (plugin replaces its feature list at runtime) ---
  ipcMain.on('wb:set-features', (e, features: unknown) => {
    const id = pluginIdForSender(e.sender)
    if (!id) return
    const parsed = featureArraySchema.safeParse(features)
    if (!parsed.success) return // ignore malformed payloads
    setDynamicFeatures(id, parsed.data)
    getMainWindow()?.webContents.send(eventChannelFor('plugins-changed'))
  })

  // --- dialogs ---
  ipcMain.handle('wb:show-open-dialog', async (_e, options?: unknown) => {
    const result = await dialog.showOpenDialog((options as object) ?? {})
    return result.canceled ? undefined : result.filePaths
  })
  ipcMain.handle('wb:show-save-dialog', async (_e, options?: unknown) => {
    const result = await dialog.showSaveDialog((options as object) ?? {})
    return result.canceled ? undefined : result.filePath
  })

  // --- toast → OS notification center (skill ref 06) ---
  ipcMain.on('wb:toast', (_e, text: string) => {
    if (Notification.isSupported()) {
      new Notification({ title: app.getName(), body: String(text) }).show()
    }
  })

  // --- synchronous helpers (cheap, called once at plugin init) ---
  ipcMain.on('wb:get-path', (e, name: string) => {
    const key = (PATH_MAP[name] ?? 'temp') as Parameters<typeof app.getPath>[0]
    e.returnValue = app.getPath(key)
  })
  ipcMain.on('wb:get-platform', (e) => {
    e.returnValue = process.platform
  })
  ipcMain.on('wb:is-dark', (e) => {
    e.returnValue = resolveIsDark()
  })
}
