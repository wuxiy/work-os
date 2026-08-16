import type { PluginCommand } from '@work-os/plugin-types'
import { createWorkos } from './client'
import type { WorkosApi } from './types'

export * from './types'
export { createWorkos, body } from './client'

/** 插件激活上下文（技术架构 §11） */
export interface PluginContext {
  /** 宿主注入的 Work-OS API（即 window.workos） */
  workos: WorkosApi
  /** 运行时注册命令（合并进 Command Bus 的内存索引；manifest commands 为持久来源） */
  commands: {
    register(cmd: PluginCommand): void
  }
}

export interface PluginDefinition {
  activate(ctx: PluginContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}

/** 模块级单例：等价于 window.workos（E3 检测点） */
export const workos: WorkosApi = createWorkos()

if (typeof window !== 'undefined' && !window.workos) {
  window.workos = workos
}

/** SDK 入口：注册插件并挂载 window.workos（验收 E3/E4） */
export function definePlugin(def: PluginDefinition): WorkosApi {
  if (typeof window !== 'undefined' && !window.workos) {
    window.workos = workos
  }
  const registered: PluginCommand[] = []
  void def.activate({
    workos,
    commands: {
      register(cmd) {
        registered.push(cmd)
        // 运行时命令上报宿主，合并进 Command Bus
        void workos.commands.execute('__runtime.registerCommands', [...registered]).catch(() => {
          // 宿主不支持时忽略（如浏览器 dev 模式）
        })
      },
    },
  })
  return workos
}
