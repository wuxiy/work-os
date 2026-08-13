import Store from 'electron-store'
import { pluginDbDir } from '../paths'

const cache = new Map<string, Store<Record<string, unknown>>>()

/**
 * Per-plugin persistent key/value store, namespaced by plugin id. Backs the
 * `workbench.db` API. Each plugin gets its own JSON file under userData.
 */
export function getPluginStore(pluginId: string): Store<Record<string, unknown>> {
  let s = cache.get(pluginId)
  if (!s) {
    s = new Store<Record<string, unknown>>({ name: pluginId, cwd: pluginDbDir() })
    cache.set(pluginId, s)
  }
  return s
}
