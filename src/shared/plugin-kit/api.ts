import type { CmdType, Feature } from './manifest'

/**
 * The `window.workbench` surface every plugin talks to the host through.
 * One injected global, curated + permission-checked — plugins never get raw
 * Node/Electron access (a deliberate hardening over u-tools/rubick, which give
 * the preload full Node). Rendered in its own WebContentsView (see runner.ts).
 */
export interface PluginEnterPayload {
  code: string
  type: CmdType
  payload: unknown // the text / files / image that triggered the feature
}

export interface OpenDialogOptions {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  defaultPath?: string
  properties?: string[]
}

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

export interface WorkbenchApi {
  // --- lifecycle ---
  onPluginEnter(cb: (e: PluginEnterPayload) => void): void
  onPluginOut(cb: () => void): void
  onPluginDetach(cb: () => void): void

  // --- sub-input (a secondary search bar inside the host chrome) ---
  setSubInput(cb: ((value: string) => void) | null, placeholder?: string): void
  removeSubInput(): void
  setSubInputValue(value: string): void

  // --- layout ---
  setExpendHeight(height: number): void
  /** Pop the plugin out into its own detached window. */
  detachPlugin(): void

  // --- clipboard ---
  copyText(text: string): void

  // --- dialogs & paths ---
  showOpenDialog(options?: OpenDialogOptions): Promise<string[] | undefined>
  showSaveDialog(options?: SaveDialogOptions): Promise<string | undefined>
  getPath(name: 'home' | 'appData' | 'desktop' | 'documents' | 'downloads' | 'temp'): string

  // --- per-plugin key/value store (persisted, namespaced to this plugin) ---
  db: {
    get<T = unknown>(key: string): Promise<T | undefined>
    set<T = unknown>(key: string, value: T): Promise<void>
    remove(key: string): Promise<void>
  }

  // --- appearance ---
  isDarkColors(): boolean
  onThemeChange(cb: (isDark: boolean) => void): void

  // --- misc ---
  toast(text: string): void
  getPlatform(): NodeJS.Platform
  /** Replace the feature list at runtime (dynamic features). */
  setFeatures(features: Feature[]): void
}

declare global {
  interface Window {
    workbench: WorkbenchApi
  }
}
