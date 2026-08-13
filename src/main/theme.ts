import { nativeTheme } from 'electron'
import { settings } from './store'

/** Resolve the effective dark/light state from the user's theme preference. */
export function resolveIsDark(): boolean {
  const theme = settings.get('theme')
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return nativeTheme.shouldUseDarkColors
}

/**
 * Apply the theme preference to nativeTheme so vibrancy/acrylic + the WebView
 * `prefers-color-scheme` both follow it. Returns the effective dark state.
 */
export function applyTheme(): boolean {
  const theme = settings.get('theme')
  nativeTheme.themeSource = theme
  return resolveIsDark()
}
