import { BrowserWindow, WebContentsView } from 'electron'
import { getRecord } from './manager'
import { pluginPreloadPath } from '../paths'
import { getMainWindow } from '../window/main-window'
import { resolveIsDark } from '../theme'
import { eventChannelFor } from '../../shared/ipc/api'
import type { CmdType } from '@wb/plugin-kit'

// The host chrome (search bar) occupies the top strip; the plugin view fills
// the rest below it. Skill ref 03 §A.3: keep the host chrome height fixed and
// resize the *window* rather than fighting the WebView's own frame.
export const SEARCH_BAR_HEIGHT = 56
const DEFAULT_PLUGIN_HEIGHT = 480

interface EnterPayload {
  code: string
  type: CmdType
  payload: unknown
}
interface Active {
  pluginId: string
  view: WebContentsView
  win: BrowserWindow
  enter: EnterPayload
}

let active: Active | null = null
// webContents.id → pluginId, so workbench API handlers can attribute calls from
// both the in-launcher view and detached plugin windows.
const pluginIdByContentsId = new Map<number, string>()
// Detached plugin windows keyed by their webContents.id.
const detachedByContentsId = new Map<number, BrowserWindow>()

interface SubInputState {
  enabled: boolean
  placeholder?: string
  value?: string
}
let subInput: SubInputState = { enabled: false }

export function activePluginId(): string | null {
  return active?.pluginId ?? null
}

export function pluginIdForSender(sender: { id: number }): string | undefined {
  return pluginIdByContentsId.get(sender.id)
}

/** Send a message to the currently-active plugin view (e.g. theme changes). */
export function sendToActive(channel: string, payload?: unknown): void {
  active?.view.webContents.send(channel, payload)
}

function broadcastSubInput(): void {
  getMainWindow()?.webContents.send(eventChannelFor('sub-input'), { ...subInput })
}

/** Which window owns a given plugin webContents (in-launcher or detached). */
function windowForSender(sender: { id: number }): BrowserWindow | null {
  if (active && active.view.webContents.id === sender.id) return active.win
  return detachedByContentsId.get(sender.id) ?? null
}

/** Attach a plugin view to the window, load its entry, and resize the window. */
export function activate(
  win: BrowserWindow,
  pluginId: string,
  code: string,
  type: CmdType,
  payload: unknown,
  height?: number
): void {
  const record = getRecord(pluginId)
  if (!record) throw new Error(`Plugin not found: ${pluginId}`)

  if (active) exit(win)

  const view = new WebContentsView({
    webPreferences: {
      preload: pluginPreloadPath(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  pluginIdByContentsId.set(view.webContents.id, pluginId)
  win.contentView.addChildView(view)
  active = { pluginId, view, win, enter: { code, type, payload } }

  const targetHeight = height ?? record.manifest.pluginSetting?.height ?? DEFAULT_PLUGIN_HEIGHT
  const [width] = win.getContentSize()
  win.setContentSize(width, SEARCH_BAR_HEIGHT + targetHeight)
  layout()

  view.webContents.once('did-finish-load', () => {
    view.webContents.send('wb:enter', { code, type, payload })
    view.webContents.send('wb:theme', resolveIsDark())
  })

  subInput = { enabled: false }
  broadcastSubInput()
  view.webContents.loadFile(record.mainPath)
}

/** Resize a plugin's window to the height it requests (via setExpendHeight). */
export function setExpendHeight(sender: { id: number }, height: number): void {
  const target = windowForSender(sender)
  if (!target || target.isDestroyed()) return
  const isDetached = detachedByContentsId.has(sender.id)
  const [width] = target.getContentSize()
  const clamped = Math.max(120, Math.min(height, 1600))
  // Detached windows have no host chrome; the plugin owns the full window height.
  target.setContentSize(width, isDetached ? clamped : SEARCH_BAR_HEIGHT + clamped)
  if (!isDetached) layout()
}

/** Lay out the active plugin view to fill below the search bar. */
export function layout(): void {
  if (!active || active.win.isDestroyed()) return
  const [width, height] = active.win.getContentSize()
  active.view.setBounds({
    x: 0,
    y: SEARCH_BAR_HEIGHT,
    width,
    height: Math.max(0, height - SEARCH_BAR_HEIGHT)
  })
}

/** Remove the active plugin view and restore launcher window height. */
export function exit(win: BrowserWindow): void {
  if (!active) return
  const { view } = active
  try {
    view.webContents.send('wb:out')
  } catch {
    /* webContents may already be gone */
  }
  pluginIdByContentsId.delete(view.webContents.id)
  win.contentView.removeChildView(view)
  try {
    ;(view.webContents as unknown as { destroy?: () => void }).destroy?.()
  } catch {
    /* noop */
  }
  active = null
  subInput = { enabled: false }
  broadcastSubInput()

  const [width] = win.getContentSize()
  win.setContentSize(width, SEARCH_BAR_HEIGHT + 464)
}

// --- sub-input (host-rendered secondary input) ---

export function setSubInput(enabled: boolean, placeholder?: string): void {
  subInput = enabled ? { enabled: true, placeholder, value: '' } : { enabled: false }
  broadcastSubInput()
}

export function setSubInputValue(value: string): void {
  if (!subInput.enabled) return
  subInput.value = value
  broadcastSubInput()
}

/** Launcher → active plugin: the user typed in the sub-input box. */
export function forwardSubInput(value: string): void {
  sendToActive('wb:sub-input', value)
}

// --- detach (pop the active plugin into its own window) ---

export function detach(): void {
  if (!active) return
  const { pluginId, win, enter } = active
  const record = getRecord(pluginId)
  if (!record) return

  const detWin = new BrowserWindow({
    width: 760,
    height: record.manifest.pluginSetting?.height ?? DEFAULT_PLUGIN_HEIGHT,
    title: record.manifest.pluginName,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: pluginPreloadPath(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  // Capture the id now: by the time 'closed' fires, detWin and its webContents
  // are already destroyed, so touching detWin.webContents throws
  // "Object has been destroyed". Reference only the captured value below.
  const detContentsId = detWin.webContents.id
  pluginIdByContentsId.set(detContentsId, pluginId)
  detachedByContentsId.set(detContentsId, detWin)
  detWin.on('closed', () => {
    pluginIdByContentsId.delete(detContentsId)
    detachedByContentsId.delete(detContentsId)
  })

  detWin.webContents.once('did-finish-load', () => {
    detWin.webContents.send('wb:enter', { code: enter.code, type: enter.type, payload: enter.payload })
    detWin.webContents.send('wb:theme', resolveIsDark())
  })
  detWin.loadFile(record.mainPath)

  // Tear down the in-launcher view and return the launcher to its idle state.
  exit(win)
  getMainWindow()?.webContents.send(eventChannelFor('plugin-out'))
}
