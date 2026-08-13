import type { PluginSummary, MarketplaceEntry } from '@wb/plugin-kit'

/**
 * The main↔launcher contract. One shared interface; both sides type-check
 * against it (skill ref 04). Renderer calls `window.api.<method>(...)`, which
 * the app preload proxies to `ipcRenderer.invoke('<scope>:<method>', ...args)`.
 */
export const IPC_SCOPE = 'work-os'

export type Theme = 'system' | 'light' | 'dark'

/** Marketplace signing trust configuration (pinned locally in settings). */
export interface MarketplaceSecurity {
  requireSignedRegistry: boolean
  trustedKeys: Record<string, string> // keyId → base64 SPKI Ed25519 public key
}

/** Auto-update status surfaced to the renderer. */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  version?: string
  message?: string
}

/** Live trigger context used to match img/files/window cmds (u-tools-style). */
export interface TriggerContext {
  hasImage: boolean
  image?: string // data URL, only present so it can be passed as the enter payload
  files: string[]
  window?: { app: string; title?: string }
}

export interface MainApi {
  // plugins
  listPlugins(): Promise<PluginSummary[]>
  enablePlugin(id: string, enabled: boolean): Promise<void>
  installPlugin(dir: string): Promise<PluginSummary>
  installPluginDialog(): Promise<PluginSummary | null>
  uninstallPlugin(id: string): Promise<void>

  // marketplace (remote registry)
  listMarketplace(): Promise<MarketplaceEntry[]>
  installFromMarketplace(entryId: string): Promise<PluginSummary>
  getRegistryUrl(): Promise<string>
  setRegistryUrl(url: string): Promise<void>
  getMarketplaceSecurity(): Promise<MarketplaceSecurity>
  setMarketplaceSecurity(config: MarketplaceSecurity): Promise<void>

  // auto-update
  checkForUpdates(): Promise<UpdateState>
  getUpdateStatus(): Promise<UpdateState>
  quitAndInstall(): Promise<void>
  getUpdateFeedUrl(): Promise<string>
  setUpdateFeedUrl(url: string): Promise<void>

  // plugin sub-input (host-rendered secondary input; typing is forwarded to the active plugin)
  subInputTyping(value: string): Promise<void>
  detachActivePlugin(): Promise<void>

  // live trigger context (clipboard image/files + frontmost window)
  getTriggerContext(): Promise<TriggerContext>
  activatePlugin(pluginId: string, code: string, type: string, payload: unknown): Promise<void>
  exitPlugin(): Promise<void>
  // settings
  getHotkey(): Promise<string>
  setHotkey(accelerator: string): Promise<boolean>
  getTheme(): Promise<Theme>
  setTheme(theme: Theme): Promise<void>
  // host
  getPlatform(): Promise<NodeJS.Platform>
  isDarkColors(): Promise<boolean>
  showMainWindow(): Promise<void>
  openSettings(): Promise<void>
  quitApp(): Promise<void>
}

/** A handler implementation map; main registers one of these. */
export type MainApiImpl = {
  [K in keyof MainApi]: (
    ...args: Parameters<MainApi[K]>
  ) => Awaited<ReturnType<MainApi[K]>> | Promise<Awaited<ReturnType<MainApi[K]>>>
}

/**
 * One-way broadcasts (main → renderer). Kept as a distinct surface from
 * MainApi — skill ref 04: request/response and events must not share a schema.
 */
export interface MainEvents {
  'plugin-out': void
  'theme-changed': { isDark: boolean }
  'plugins-changed': void
  'update-status': UpdateState
  'sub-input': { enabled: boolean; placeholder?: string; value?: string }
}

export const channelFor = (method: string): string => `${IPC_SCOPE}:${method}`
export const eventChannelFor = (name: string): string => `${IPC_SCOPE}:event:${name}`
