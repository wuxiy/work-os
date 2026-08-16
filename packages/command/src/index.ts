import { fuzzyScore, type SearchResultItem } from '@work-os/shared'

/** 命令定义（技术架构 §6） */
export interface Command {
  id: string
  title: string
  keywords?: string[]
  /** 命令来源：core 或插件 id */
  source: 'core' | string
  /** 执行类型：宿主动作或打开插件面板 */
  kind: 'core-action' | 'open-plugin' | 'open-manual'
  /** open-plugin: 插件 id；open-manual: 文档 id */
  target?: string
  /** 进入插件时携带的 action code（与 manifest commands[].code 对应） */
  code?: string
  /** 该命令是否接受当前输入文本作为 payload（如 json.format 接受粘贴的 JSON） */
  acceptsInput?: boolean
}

export interface CommandContext {
  input?: string
  payload?: unknown
}

export type CommandHandler = (cmd: Command, ctx: CommandContext) => Promise<unknown> | unknown

/**
 * Command Bus —— 内存索引（技术架构 §27：Command Search → Memory Index）。
 * Launcher 只依赖本注册表与搜索，不依赖任何业务插件（验收 D2）。
 */
export class CommandRegistry {
  private commands = new Map<string, Command>()
  private handlers = new Map<string, CommandHandler>()

  register(cmd: Command, handler?: CommandHandler): void {
    if (this.commands.has(cmd.id)) {
      throw new Error(`命令 id 重复注册：${cmd.id}`)
    }
    this.commands.set(cmd.id, cmd)
    if (handler) this.handlers.set(cmd.id, handler)
  }

  /** 运行时更新（插件 SDK ctx.commands.register），允许覆盖同 id */
  registerRuntime(cmd: Command): void {
    this.commands.set(cmd.id, cmd)
  }

  unregisterBySource(source: string): void {
    for (const [id, c] of this.commands) {
      if (c.source === source) {
        this.commands.delete(id)
        this.handlers.delete(id)
      }
    }
  }

  get(id: string): Command | undefined {
    return this.commands.get(id)
  }

  list(): Command[] {
    return [...this.commands.values()]
  }

  async execute(id: string, ctx: CommandContext = {}): Promise<unknown> {
    const cmd = this.commands.get(id)
    if (!cmd) throw new Error(`命令不存在：${id}`)
    if (cmd.kind === 'core-action') {
      const h = this.handlers.get(id)
      if (!h) throw new Error(`命令未绑定处理器：${id}`)
      return h(cmd, ctx)
    }
    // open-plugin / open-manual 由宿主统一处理（Rust 侧 surface/manual open）
    return null
  }

  /** 关键词搜索，返回带分数的降序列表（验收 C1/N2） */
  search(query: string, limit = 20): Command[] {
    if (!query.trim()) return this.list()
    const scored: Array<{ c: Command; s: number }> = []
    for (const c of this.commands.values()) {
      let best = fuzzyScore(query, c.title)
      for (const k of c.keywords ?? []) {
        best = Math.max(best, fuzzyScore(query, k) - 10)
      }
      best = Math.max(best, fuzzyScore(query, c.id) - 30)
      if (best > 0) scored.push({ c, s: best })
    }
    scored.sort((a, b) => b.s - a.s)
    return scored.slice(0, limit).map((x) => x.c)
  }

  toSearchResults(list: Command[] = this.list()): SearchResultItem[] {
    return list.map((c) => ({
      group: c.source === 'core' ? 'command' : 'plugin',
      id: c.id,
      title: c.title,
      subtitle: c.source === 'core' ? '核心命令' : c.source,
      score: 0,
    }))
  }
}
