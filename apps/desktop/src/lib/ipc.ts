/** 宿主前端 → Rust 的类型化 IPC 封装 */
import { invoke } from '@tauri-apps/api/core'

export interface PluginRowVo {
  id: string
  name: string
  version: string
  type: 'ui' | 'manual' | 'system'
  apiVersion: number
  source: string
  sourcePath: string | null
  enabled: boolean
  installedAt: number
}

export interface PluginListEntry {
  row: PluginRowVo
  permissions: string[]
}

export interface PluginCommandVo {
  pluginId: string
  pluginName: string
  command: { id: string; title: string; keywords: string[]; code?: string }
}

export interface ManualSearchHitVo {
  sourceId: string
  docId: string
  title: string
  summary: string
  category: string
}

export interface ManualDocVo {
  sourceId: string
  id: string
  title: string
  aliases: string[]
  summary: string
  category: string
  tags: string[]
  content: string
}

export const ipc = {
  getAppInfo: () => invoke<{ name: string; version: string }>('get_app_info'),
  debugLog: (msg: string) => invoke('debug_log', { msg }),
  debugStats: () => invoke<Record<string, unknown>>('debug_stats'),
  launcherReady: () => invoke('launcher_ready'),
  launcherHide: () => invoke('launcher_hide'),
  recordCommand: (id: string, input?: string, title?: string) => invoke('record_command', { id, input, title }),
  recentList: (kind?: string, limit = 20) => invoke<Array<{ kind: string; ref: string; title: string; ts: number }>>('recent_list', { kind, limit }),
  favoritesList: () => invoke<Array<{ kind: string; ref: string; title: string }>>('favorites_list'),
  favoriteToggle: (kind: string, ref: string, title: string) => invoke<boolean>('favorite_toggle', { kind, reference: ref, title }),
  themeGet: () => invoke<{ mode: string; resolved: 'dark' | 'light' }>('theme_get'),
  themeSet: (mode: string) => invoke('theme_set', { mode }),
  settingGet: (key: string) => invoke<string | null>('setting_get', { key }),
  settingSet: (key: string, value: string) => invoke('setting_set', { key, value }),
  pluginList: () => invoke<PluginListEntry[]>('plugin_list'),
  pluginCommands: () => invoke<PluginCommandVo[]>('plugin_commands'),
  pluginSetEnabled: (id: string, enabled: boolean) => invoke('plugin_set_enabled', { id, enabled }),
  pluginUninstall: (id: string) => invoke('plugin_uninstall', { id }),
  pluginPickAndValidate: () => invoke<StagedPlugin>('plugin_pick_and_validate'),
  pluginInstallConfirmed: (stagedPath: string, permissions: string[]) => invoke<{ id: string; version: string }>('plugin_install_confirmed', { stagedPath, permissions }),
  pluginInstallRegistry: (registryUrl: string, pluginId: string) => invoke<StagedPlugin>('plugin_install_registry', { registryUrl, pluginId }),
  pluginInstallDev: () => invoke<{ id: string; version: string; path: string }>('plugin_install_dev'),
  registryList: () => invoke<string[]>('registry_list'),
  registrySave: (urls: string[]) => invoke('registry_save', { urls }),
  registryFetch: (url: string) => invoke<RegistryDoc>('registry_fetch', { url }),
  manualSources: () => invoke<Array<[string, string, string, number]>>('manual_sources'),
  manualSearch: (query: string, limit = 20) => invoke<ManualSearchHitVo[]>('manual_search', { query, limit }),
  manualDoc: (sourceId: string, docId: string) => invoke<ManualDocVo>('manual_doc', { sourceId, docId }),
  manualList: (sourceId: string) => invoke<ManualSearchHitVo[]>('manual_list', { sourceId }),
  manualCategories: (sourceId: string) => invoke<string[]>('manual_categories', { sourceId }),
  httpRecent: (limit = 10) => invoke<Array<{ id: number; method: string; url: string; status: number | null; timeMs: number | null; ts: number }>>('http_recent', { limit }),
  openTool: (pluginId: string, code?: string, payload?: unknown) => invoke('open_tool', { pluginId, code, payload }),
  openManual: (sourceId: string, docId: string) => invoke('open_manual', { sourceId, docId }),
  navigateWorkbench: (route: string) => invoke('navigate_workbench', { route }),
  surfaceOpen: (pluginId: string, rect: SurfaceRect, enter?: unknown) => invoke('surface_open', { pluginId, rect, enter }),
  surfaceUpdateRect: (pluginId: string, rect: SurfaceRect) => invoke('surface_update_rect', { pluginId, rect }),
  surfaceHide: (pluginId: string) => invoke('surface_hide', { pluginId }),
  updaterCheck: (feedUrl: string) => invoke<{ available: boolean; version?: string; notes?: string }>('updater_check', { feedUrl }),
  updaterSetPubkey: (pubkey: string) => invoke('updater_set_pubkey', { pubkey }),
}

export interface SurfaceRect {
  x: number
  y: number
  w: number
  h: number
}

export interface StagedPlugin {
  stagedPath: string
  manifest: {
    id: string
    name: string
    version: string
    type: string
    apiVersion: string
    permissions?: string[]
    commands?: Array<{ id: string; title: string }>
  }
  sha256: string
  size: number
  isNew: boolean
}

export interface RegistryDoc {
  name: string
  updated: string
  plugins: Array<{
    id: string
    name: string
    version: string
    type: string
    download: string
    sha256: string
    description?: string
  }>
}
