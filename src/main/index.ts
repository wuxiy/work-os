import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import { createMainWindow, getMainWindow, showMainWindow, toggleMainWindow } from './window/main-window'
import { createSettingsWindow } from './window/settings-window'
import { createTray } from './tray'
import { registerHotkey, unregisterAll as unregisterHotkey } from './hotkey'
import { registerApi } from './ipc'
import { registerPluginHandlers } from './plugin/handlers'
import { discoverAll, enabledSummaries, installPlugin, listRecords, setEnabled, uninstallPlugin } from './plugin/manager'
import {
  fetchRegistry,
  getRegistryUrl,
  installFromMarketplace,
  invalidateRegistryCache,
  setRegistryUrl
} from './plugin/marketplace'
import * as runner from './plugin/runner'
import { settings } from './store'
import { applyTheme, resolveIsDark } from './theme'
import {
  checkForUpdates,
  getFeedUrl as getUpdateFeedUrl,
  getStatus as getUpdateStatus,
  initAutoUpdater,
  onStatus,
  quitAndInstall,
  setFeedUrl as setUpdateFeedUrl
} from './updater'
import { getTriggerContext } from './context'
import { eventChannelFor, type MainApiImpl } from '../shared/ipc/api'
import type { CmdType } from '@wb/plugin-kit'

// --- single instance: a second launch focuses the existing one (skill ref 06) ---
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
  bootstrap()
}

function broadcastLauncher<E extends string>(event: E, payload?: unknown): void {
  getMainWindow()?.webContents.send(eventChannelFor(event), payload)
}

function buildApi(): MainApiImpl {
  return {
    listPlugins: () => enabledSummaries(),

    enablePlugin: (id, enabled) => {
      setEnabled(id, enabled)
      broadcastLauncher('plugins-changed')
    },

    installPlugin: async (dir) => {
      const summary = installPlugin(dir)
      broadcastLauncher('plugins-changed')
      return summary
    },

    installPluginDialog: async () => {
      const result = await dialog.showOpenDialog({
        title: 'Select a plugin folder',
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      const summary = installPlugin(result.filePaths[0])
      broadcastLauncher('plugins-changed')
      return summary
    },

    uninstallPlugin: (id) => {
      uninstallPlugin(id)
      broadcastLauncher('plugins-changed')
    },

    listMarketplace: async () => fetchRegistry(),

    installFromMarketplace: async (entryId) => {
      const summary = await installFromMarketplace(entryId)
      broadcastLauncher('plugins-changed')
      return summary
    },

    getRegistryUrl: () => getRegistryUrl(),
    setRegistryUrl: (url) => setRegistryUrl(url),

    getMarketplaceSecurity: () => ({
      requireSignedRegistry: Boolean(settings.get('requireSignedRegistry')),
      trustedKeys: { ...(settings.get('trustedKeys') as Record<string, string>) }
    }),
    setMarketplaceSecurity: (config) => {
      settings.set('requireSignedRegistry', config.requireSignedRegistry)
      settings.set('trustedKeys', { ...config.trustedKeys })
      invalidateRegistryCache() // refetch re-verifies against the new trust config
    },

    checkForUpdates: () => checkForUpdates(),
    getUpdateStatus: () => getUpdateStatus(),
    quitAndInstall: () => quitAndInstall(),
    getUpdateFeedUrl: () => getUpdateFeedUrl(),
    setUpdateFeedUrl: (url) => setUpdateFeedUrl(url),

    subInputTyping: (value) => {
      runner.forwardSubInput(value)
    },
    detachActivePlugin: () => {
      runner.detach()
    },

    getTriggerContext: () => getTriggerContext(),

    activatePlugin: async (pluginId, code, type, payload) => {
      const win = getMainWindow()
      if (!win) return
      runner.activate(win, pluginId, code, type as CmdType, payload)
    },

    exitPlugin: () => {
      const win = getMainWindow()
      if (!win) return
      runner.exit(win)
      broadcastLauncher('plugin-out')
    },

    getHotkey: () => settings.get('hotkey'),
    setHotkey: (accelerator) => {
      const ok = registerHotkey(accelerator, toggleMainWindow)
      if (ok) settings.set('hotkey', accelerator)
      return ok
    },

    getTheme: () => settings.get('theme'),
    setTheme: (theme) => {
      settings.set('theme', theme)
      const isDark = applyTheme()
      broadcastLauncher('theme-changed', { isDark })
      runner.sendToActive('wb:theme', isDark)
    },

    getPlatform: () => process.platform,
    isDarkColors: () => resolveIsDark(),
    showMainWindow: () => showMainWindow(),
    openSettings: () => {
      const parent = getMainWindow()
      if (parent) createSettingsWindow(parent)
    },
    quitApp: () => app.quit()
  }
}

// True once the user has asked to really quit (tray Quit / Cmd-Q). Without this,
// the main window's close→hide handler would also intercept the quit and leave a
// zombie hidden window behind.
let isQuitting = false

function bootstrap(): void {
  app.whenReady().then(() => {
    try {
      discoverAll()
      if (!app.isPackaged) {
        console.log(
          '[work-os] discovered plugins:',
          listRecords().map((r) => `${r.id}${r.enabled ? '' : ' (disabled)'}`).join(', ') || '(none)'
        )
      }
      applyTheme()

      const win = createMainWindow()
      // Closing the launcher hides it instead of quitting (tray keeps the app
      // alive) — unless we're actually quitting. Guard isDestroyed() because a
      // close event can fire during teardown after the window is gone.
      win.on('close', (e) => {
        if (win.isDestroyed()) return
        if (!isQuitting) {
          e.preventDefault()
          win.hide()
        }
      })

      createTray(win)
      const hotkeyOk = registerHotkey(settings.get('hotkey'), toggleMainWindow)
      if (!app.isPackaged) {
        const status = hotkeyOk ? 'registered' : 'FAILED'
        console.log(`[work-os] global hotkey ${settings.get('hotkey')}: ${status}`)
      }

    registerApi(buildApi())
    registerPluginHandlers()

    // Auto-update: broadcast status to the launcher, and (in a packaged app with
    // a configured feed) check a few seconds after launch.
    void initAutoUpdater()
    onStatus((s) => broadcastLauncher('update-status', s))
    if (app.isPackaged && getUpdateFeedUrl()) {
      setTimeout(() => void checkForUpdates(), 5000)
    }
    } catch (err) {
      console.error('[work-os] startup error:', err)
    }

    // Follow the OS theme when the user is on "system".
    nativeTheme.on('updated', () => {
      if (settings.get('theme') !== 'system') return
      const isDark = resolveIsDark()
      broadcastLauncher('theme-changed', { isDark })
      runner.sendToActive('wb:theme', isDark)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      else showMainWindow()
    })

    app.on('before-quit', () => {
      isQuitting = true
      unregisterHotkey()
    })
  })

  // Keep the process alive when windows close (tray-driven lifecycle).
  app.on('window-all-closed', () => {
    // Intentionally empty: the tray Quit item / Cmd-Q exits the app.
  })
}
