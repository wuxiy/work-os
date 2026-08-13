import { ipcMain } from 'electron'
import { channelFor, type MainApiImpl } from '../../shared/ipc/api'

/**
 * Register a MainApi implementation: each method name becomes an
 * `ipcMain.handle('<scope>:<method>')`. The app preload proxies calls to the
 * same channel names, so adding a method is: add it to MainApi, implement it
 * here — the renderer gets autocomplete for free (skill ref 04).
 */
export function registerApi(impl: MainApiImpl): void {
  for (const [name, handler] of Object.entries(impl)) {
    ipcMain.handle(channelFor(name), (_e, ...args) =>
      (handler as (...a: unknown[]) => unknown)(...args)
    )
  }
}
