/** Workbench 全局状态：路由 + 主题 + 工具/手册数据（手写微型 store，避免库层玄学） */
import { useEffect, useState } from 'react'
import { ipc, type PluginListEntry } from './ipc'

export interface Route {
  path: string
  /** 进入插件时的动作与载荷 */
  enter?: { code?: string; payload?: unknown }
}

interface WorkbenchState {
  route: Route
  themeMode: 'system' | 'light' | 'dark'
  resolved: 'dark' | 'light'
  plugins: PluginListEntry[]
}

type Listener = (s: WorkbenchState) => void

let state: WorkbenchState = {
  route: { path: '/home' },
  themeMode: 'system',
  resolved: 'dark',
  plugins: [],
}

const listeners = new Set<Listener>()

function set(patch: Partial<WorkbenchState>): void {
  state = { ...state, ...patch }
  for (const l of [...listeners]) l(state)
}

export const store = {
  getState: (): WorkbenchState => state,
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  navigate(path: string, enter?: { code?: string; payload?: unknown }): void {
    set({ route: { path, enter } })
  },
  async loadPlugins(): Promise<void> {
    set({ plugins: await ipc.pluginList() })
  },
  async setTheme(mode: 'system' | 'light' | 'dark'): Promise<void> {
    await ipc.themeSet(mode)
    const t = await ipc.themeGet()
    set({ themeMode: mode, resolved: t.resolved })
    applyHtmlTheme(t.resolved)
  },
  applyResolved(resolved: 'dark' | 'light'): void {
    set({ resolved })
    applyHtmlTheme(resolved)
  },
  /** 启动时初始化（幂等） */
  initTheme(mode: string, resolved: 'dark' | 'light'): void {
    set({ themeMode: mode as 'system', resolved })
    applyHtmlTheme(resolved)
  },
}

/** 兼容旧 API：useWorkbench(...) 选择器 hook */
export function useWorkbench<T>(selector: (s: WorkbenchState) => T): T {
  const [v, setV] = useState<T>(() => selector(state))
  useEffect(() => store.subscribe((s) => setV(selector(s))), [selector])
  return v
}

export function useRoute(): Route {
  return useWorkbench((s) => s.route)
}

export function usePlugins(): PluginListEntry[] {
  return useWorkbench((s) => s.plugins)
}

export function useThemeMode(): { themeMode: 'system' | 'light' | 'dark'; resolved: 'dark' | 'light' } {
  return useWorkbench((s) => ({ themeMode: s.themeMode, resolved: s.resolved }))
}

export function applyHtmlTheme(resolved: 'dark' | 'light'): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}
