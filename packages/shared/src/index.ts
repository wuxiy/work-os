/** 全局共享的轻量类型与工具（不依赖 React / Tauri，可被任意包引用） */

export type ThemeMode = 'system' | 'light' | 'dark'

export interface RecentItem {
  kind: 'command' | 'tool' | 'manual' | 'request' | 'url'
  ref: string
  title: string
  ts: number
}

export interface FavoriteItem {
  kind: 'command' | 'tool' | 'manual'
  ref: string
  title: string
}

export interface SearchResultItem {
  /** 分组：命令 / 插件 / 手册 / 最近 / 收藏 */
  group: 'command' | 'plugin' | 'manual' | 'recent' | 'favorite'
  id: string
  title: string
  subtitle?: string
  icon?: string
  score?: number
}

/** 供 Launcher 输入感知使用的 JSON 检测 */
export function looksLikeJson(input: string): boolean {
  const s = input.trim()
  if (s.length < 2) return false
  return (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))
}

/** 简单模糊匹配打分（子序列匹配，用于 recent/favorite 过滤） */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - t.length
  const idx = t.indexOf(q)
  if (idx >= 0) return 600 - idx - t.length * 0.1
  // 子序列
  let ti = 0
  let hit = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return -1
    ti = found + 1
    hit++
  }
  return 200 + hit * 2 - t.length * 0.1
}
