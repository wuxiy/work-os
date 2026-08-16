/** 核心命令注册（Command Bus 的 core 侧，验收 D1/D2）。幂等：StrictMode 双挂载安全。 */
import { CommandRegistry, type Command } from '@work-os/command'
import { ipc } from './ipc'
import { store } from './store'

export const commandRegistry = new CommandRegistry()

const coreRegistered = new Set<string>()

function registerOnce(cmd: Command, handler?: (c: Command, ctx: { input?: string; payload?: unknown }) => unknown): void {
  if (coreRegistered.has(cmd.id)) return
  coreRegistered.add(cmd.id)
  commandRegistry.register(cmd, handler)
}

export function registerCoreCommands(): void {
  const wb = store
  registerOnce({ id: 'app.home', title: '前往首页', source: 'core', kind: 'core-action' }, () => wb.navigate('/home'))
  registerOnce({ id: 'app.developer', title: '前往开发者工具', keywords: ['tools', '工具'], source: 'core', kind: 'core-action' }, () => wb.navigate('/developer'))
  registerOnce({ id: 'app.manuals', title: '前往手册中心', keywords: ['manual', '手册'], source: 'core', kind: 'core-action' }, () => wb.navigate('/manuals'))
  registerOnce({ id: 'app.plugins', title: '前往插件管理', keywords: ['plugins', '插件'], source: 'core', kind: 'core-action' }, () => wb.navigate('/plugins'))
  registerOnce({ id: 'app.settings', title: '前往设置', keywords: ['settings', '设置'], source: 'core', kind: 'core-action' }, () => wb.navigate('/settings'))
  registerOnce({ id: 'theme.toggle', title: '切换深浅主题', keywords: ['theme', 'dark', 'light', '主题'], source: 'core', kind: 'core-action' }, async () => {
    const cur = await ipc.themeGet()
    await wb.setTheme(cur.resolved === 'dark' ? 'light' : 'dark')
  })
  registerOnce({ id: 'theme.system', title: '主题跟随系统', source: 'core', kind: 'core-action' }, () => wb.setTheme('system'))
}

/** 插件命令（来自已启用插件 manifest）合并进注册表 */
export function syncPluginCommands(): Promise<void> {
  return ipc.pluginCommands().then((list) => {
    for (const info of list) {
      try {
        commandRegistry.registerRuntime({
          id: info.command.id,
          title: info.command.title,
          keywords: info.command.keywords,
          source: info.pluginId,
          kind: 'open-plugin',
          target: info.pluginId,
          code: info.command.code ?? info.command.id,
          acceptsInput: true,
        })
      } catch {
        // 重复 id：manifest 校验已保证唯一，运行时冲突时后者跳过
      }
    }
  })
}
