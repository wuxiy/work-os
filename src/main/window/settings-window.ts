import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { __dirname } from '../paths'

let settingsWindow: BrowserWindow | null = null

/** Skill ref 06: settings live in a real native window, not an in-app modal. */
export function createSettingsWindow(parent: BrowserWindow): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return settingsWindow
  }
  settingsWindow = new BrowserWindow({
    width: 720,
    height: 560,
    title: 'Settings',
    parent,
    modal: false,
    resizable: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true
    }
  })

  // Same bundle, different hash route → the renderer renders the Settings view.
  if (!process.env.ELECTRON_RENDERER_URL) {
    settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'settings' })
  } else {
    settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/settings`)
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  return settingsWindow
}
