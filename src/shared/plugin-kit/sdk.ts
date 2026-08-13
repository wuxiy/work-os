import type { WorkbenchApi } from './api'

/**
 * Typed client over the host-injected `workbench` global. Plugins import `wb`
 * and call it directly:
 *
 *   import { wb } from '@wb/plugin-kit'
 *   wb.onPluginEnter((e) => { ... })
 *
 * Uses globalThis (not the DOM-typed `window`) so the module type-checks in any
 * context; at runtime the preload injects `window.workbench`, and
 * `globalThis === window` in the renderer.
 */
function raw(): WorkbenchApi {
  const api = (globalThis as unknown as { workbench?: WorkbenchApi }).workbench
  if (!api) {
    throw new Error(
      '@wb/plugin-kit: window.workbench is not available. ' +
        'This code must run inside a Work-OS plugin view.'
    )
  }
  return api
}

export const wb: WorkbenchApi = new Proxy({} as WorkbenchApi, {
  get(_target, prop: string | symbol) {
    const api = raw()
    const value = (api as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(api)
      : value
  }
})

export type { WorkbenchApi, PluginEnterPayload } from './api'
