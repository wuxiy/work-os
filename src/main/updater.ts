import { app } from 'electron'
import { appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { settings } from './store'
import type { AppUpdater, Logger, UpdateInfo } from 'electron-updater'

const DEBUG = !!process.env.WORKOS_UPDATER_DEBUG
const debugLog = join(tmpdir(), 'workos-updater.log')
function dbg(msg: string): void {
  if (!DEBUG) return
  try {
    appendFileSync(debugLog, `${new Date().toISOString()} ${msg}\n`)
  } catch {
    /* noop */
  }
}

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

let state: UpdateState = { status: 'idle' }
const listeners = new Set<(s: UpdateState) => void>()
let autoUpdater: AppUpdater | null = null
let initialized = false

function emit(next: UpdateState): void {
  state = next
  dbg(`emit status=${next.status}${next.version ? ' v' + next.version : ''}${next.message ? ' — ' + next.message : ''}`)
  for (const cb of listeners) cb(state)
}

export function getStatus(): UpdateState {
  return state
}

export function onStatus(cb: (s: UpdateState) => void): () => void {
  listeners.add(cb)
  cb(state)
  return () => listeners.delete(cb)
}

export function getFeedUrl(): string {
  return settings.get('updateFeedUrl')
}

export function setFeedUrl(url: string): void {
  settings.set('updateFeedUrl', url.trim())
  initialized = false // reconfigure against the new feed on next check
}

/**
 * Lazily load electron-updater. We use a dynamic import so a failure to load
 * the updater (or any of its transitive deps) can be caught and reported
 * instead of crashing the whole main process at startup.
 */
async function loadUpdater(): Promise<AppUpdater> {
  if (autoUpdater) return autoUpdater
  // electron-updater is CommonJS; under ESM dynamic import the named export
  // may land on `default` depending on the interop, so check both.
  const mod = (await import('electron-updater')) as {
    autoUpdater?: AppUpdater
    default?: { autoUpdater?: AppUpdater }
  }
  autoUpdater = mod.autoUpdater ?? mod.default?.autoUpdater ?? null
  if (!autoUpdater) throw new Error('electron-updater did not export autoUpdater')
  return autoUpdater
}

/** Wire up event handlers. Only meaningful in a packaged app. */
export async function initAutoUpdater(): Promise<void> {
  dbg(`initAutoUpdater called initialized=${initialized} isPackaged=${app.isPackaged}`)
  if (initialized || !app.isPackaged) return
  try {
    const updater = await loadUpdater()
    const url = getFeedUrl()
    dbg(`configure feedUrl=${url || '(empty)'}`)
    if (url) updater.setFeedURL({ provider: 'generic', url })
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    if (DEBUG) updater.logger = console as unknown as Logger

    updater.on('checking-for-update', () => { dbg('event: checking-for-update'); emit({ status: 'checking' }) })
    updater.on('update-available', (info: UpdateInfo) => { dbg(`event: update-available ${info.version}`); emit({ status: 'available', version: info.version }) })
    updater.on('update-not-available', () => { dbg('event: update-not-available'); emit({ status: 'not-available', version: app.getVersion() }) })
    updater.on('download-progress', () => { dbg('event: download-progress'); emit({ status: 'downloading' }) })
    updater.on('update-downloaded', (info: UpdateInfo) => { dbg(`event: update-downloaded ${info.version}`); emit({ status: 'downloaded', version: info.version }) })
    updater.on('error', (err: Error) => { dbg(`event: error ${err?.message ?? String(err)}`); emit({ status: 'error', message: err?.message ?? String(err) }) })
    initialized = true
  } catch (err) {
    dbg(`initAutoUpdater failed: ${err instanceof Error ? err.message : String(err)}`)
    emit({ status: 'error', message: `Updater init failed: ${err instanceof Error ? err.message : String(err)}` })
  }
}

export async function checkForUpdates(): Promise<UpdateState> {
  dbg(`checkForUpdates isPackaged=${app.isPackaged} feedUrl=${getFeedUrl() || '(empty)'}`)
  if (!app.isPackaged) {
    emit({ status: 'not-available', version: app.getVersion(), message: 'dev mode' })
    return state
  }
  await initAutoUpdater()
  if (!getFeedUrl()) {
    dbg('checkForUpdates: no feed url → error')
    emit({ status: 'error', message: 'No update feed URL set.' })
    return state
  }
  try {
    const updater = await loadUpdater()
    dbg('checkForUpdates: calling autoUpdater.checkForUpdates()')
    const result = await updater.checkForUpdates()
    dbg(`checkForUpdates: resolved, updateInfo=${result?.updateInfo?.version ?? 'none'}`)
  } catch (err) {
    dbg(`checkForUpdates: threw ${err instanceof Error ? err.message : String(err)}`)
    emit({ status: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return state
}

export async function quitAndInstall(): Promise<void> {
  try {
    const updater = await loadUpdater()
    updater.quitAndInstall(false, true)
  } catch {
    /* noop */
  }
}
