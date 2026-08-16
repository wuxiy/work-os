import { ipc } from '../lib/ipc'
import { usePlugins, useWorkbench } from '../lib/store'

/** 开发者工具页：展示已启用 UI 插件（插件本体在 Plugin Surface 中运行） */
export function Developer() {
  const plugins = usePlugins()
  const tools = plugins.filter((p) => p.row.type === 'ui' && p.row.enabled)

  return (
    <div className="mx-auto max-w-4xl p-5">
      <h1 className="mb-4 text-[15px] font-semibold">开发者工具</h1>
      <div className="grid grid-cols-2 gap-3">
        {tools.map((t) => (
          <button
            key={t.row.id}
            onClick={() => void ipc.openTool(t.row.id)}
            className="rounded-app border border-app-border bg-app-panel p-4 text-left transition-colors hover:border-app-accent/60"
          >
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium">{t.row.name}</span>
              <span className="font-mono text-[11px] text-app-fg-dim">v{t.row.version}</span>
            </div>
            <p className="mt-1 text-[12px] text-app-fg-dim">{t.permissions.length > 0 ? `权限：${t.permissions.join('、')}` : '无需特殊权限'}</p>
          </button>
        ))}
      </div>
      {tools.length === 0 && <p className="text-[13px] text-app-fg-dim">没有已启用的工具插件。前往「插件」页安装或启用。</p>}
    </div>
  )
}
