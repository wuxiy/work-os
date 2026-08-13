import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { __dirname } from '../paths'
import { settings } from '../store'
import { layout } from '../plugin/runner'

let mainWindow: BrowserWindow | null = null

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

function windowOptions(): Electron.BrowserWindowConstructorOptions {
  // Skill ref 06: real platform chrome, not a hand-painted div.
  //   mac  → hiddenInset keeps the traffic lights; vibrancy material shows through.
  //   win  → frameless with an acrylic backdrop; renderer paints its own controls.
  const platformChrome = isMac
    ? {
        titleBarStyle: 'hiddenInset' as const,
        vibrancy: 'under-window' as const,
        visualEffectState: 'active' as const
      }
    : {
        frame: false,
        ...(isWin ? { backgroundMaterial: 'acrylic' as const } : {})
      }

  return {
    width: 760,
    height: 520,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    ...platformChrome,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false
    }
  }
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow(windowOptions())

  // Open external links in the browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Skill ref 06: blur should dismiss a launcher (configurable).
  // Guard isDestroyed(): a blur can arrive during teardown, after which any
  // method call throws "Object has been destroyed".
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed() && settings.get('hideOnBlur') && mainWindow.isVisible()) {
      mainWindow.hide()
    }
  })

  // Keep the plugin view sized to the window. layout() itself re-checks isDestroyed.
  mainWindow.on('resize', () => layout())

  if (!process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  } else {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function showMainWindow(): void {
  const w = mainWindow
  if (!w) return
  if (!w.isVisible()) {
    w.center()
    w.show()
  }
  w.focus()
}

export function hideMainWindow(): void {
  mainWindow?.hide()
}

export function toggleMainWindow(): void {
  const w = mainWindow
  if (!w) return
  if (w.isVisible() && w.isFocused()) w.hide()
  else showMainWindow()
}
