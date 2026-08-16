/** Launcher 统一搜索聚合（验收 C1–C5）
 *
 * Launcher 只依赖 Command Registry 与搜索 IPC，不直接依赖业务插件（验收 D2）。
 */
import { looksLikeJson } from '@work-os/shared'
import type { Command } from '@work-os/command'
import { ipc, type ManualSearchHitVo } from '../lib/ipc'

export interface LauncherItem {
  key: string
  group: 'command' | 'plugin' | 'manual' | 'recent' | 'favorite'
  title: string
  subtitle?: string
  badge?: string
  icon?: string
  command?: Command
  manual?: ManualSearchHitVo
  recent?: { kind: string; ref: string; title: string }
  favorite?: { kind: string; ref: string; title: string }
  /** 输入感知标记（粘贴 JSON 自动推荐） */
  context?: boolean
}

export interface LauncherModel {
  items: LauncherItem[]
  contextHint: string
}

export async function buildLauncherModel(
  query: string,
  registry: { search(q: string, limit?: number): Command[]; list(): Command[] },
): Promise<LauncherModel> {
  const q = query.trim()

  // 空输入：Recent + Favorite（C5）
  if (!q) {
    const [recent, favorites] = await Promise.all([ipc.recentList(undefined, 8), ipc.favoritesList()])
    const recentCommands = registry.list()
    return {
      contextHint: '',
      items: [
        ...favorites.slice(0, 5).map((f) => ({ key: `fav:${f.kind}:${f.ref}`, group: 'favorite' as const, title: f.title, subtitle: '收藏', favorite: f })),
        ...recent.map((r) => ({
          key: `rec:${r.kind}:${r.ref}`,
          group: 'recent' as const,
          title: r.title,
          subtitle: '最近使用',
          recent: r,
          command: recentCommands.find((c) => c.id === r.ref),
        })),
      ],
    }
  }

  const isJson = looksLikeJson(q)

  // 命令（core + 插件）
  const commands = isJson ? registry.list() : registry.search(q, 12)
  let items: LauncherItem[] = commands.map((c) => ({
    key: `cmd:${c.id}`,
    group: c.source === 'core' ? 'command' : 'plugin',
    title: c.title,
    subtitle: c.source === 'core' ? '核心命令' : `插件 · ${c.id}`,
    badge: c.id,
    command: c,
    context: isJson && c.acceptsInput,
  }))

  // 手册搜索（C4）
  try {
    const hits = await ipc.manualSearch(q, 6)
    for (const h of hits) {
      items.push({
        key: `man:${h.sourceId}:${h.docId}`,
        group: 'manual',
        title: h.title,
        subtitle: h.summary || h.category || '手册',
        badge: h.category,
        manual: h,
      })
    }
  } catch {
    // 手册未安装时静默
  }

  // 输入感知：粘贴 JSON → JSON 工具命令置顶推荐（C3）
  let contextHint = ''
  if (isJson) {
    items = items.filter((i) => i.command?.kind === 'open-plugin' && i.command.id.startsWith('json.'))
    for (const i of items) i.context = true
    contextHint = '检测到 JSON 输入，已推荐 JSON 工具（回车将把内容带入）'
  }

  return { items: items.slice(0, 24), contextHint }
}
