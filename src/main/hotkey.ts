import { globalShortcut } from 'electron'

let currentCallback: (() => void) | null = null

/** Register the global hotkey; returns false if the OS rejected the accelerator. */
export function registerHotkey(accelerator: string, onToggle: () => void): boolean {
  unregisterAll()
  currentCallback = onToggle
  return globalShortcut.register(accelerator, onToggle)
}

export function unregisterAll(): void {
  currentCallback = null
  globalShortcut.unregisterAll()
}
