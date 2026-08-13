import { app } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Built-in plugins ship inside the app. In dev they are the *built* bundles
 * under out/plugins (produced by scripts/build-plugins.ts — the source under
 * plugins/ won't load over file:// because its index.html references the Vite
 * dev server). In a packaged app they live under resources/plugins.
 */
export function builtinPluginsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'plugins')
    : join(__dirname, '../../out/plugins')
}

/** User-installed plugins live in per-user app data, so they survive updates. */
export function userPluginsDir(): string {
  return join(app.getPath('userData'), 'plugins')
}

/** Per-plugin persistent KV store (the `workbench.db` backing). */
export function pluginDbDir(): string {
  return join(app.getPath('userData'), 'plugin-db')
}

/**
 * Absolute path to the built plugin preload (out/preload/plugin.js). Resolves
 * relative to the main bundle location, so it works in dev and packaged builds.
 */
export function pluginPreloadPath(): string {
  return join(__dirname, '../preload/plugin.cjs')
}
