import { Braces, BookOpen, House, Package, Search, Settings as SettingsIcon, Terminal } from 'lucide-react'
import type { ReactNode } from 'react'
import { store, useRoute } from '../lib/store'

const NAV = [
  { path: '/home', title: '首页', icon: House },
  { path: '/developer', title: '开发者工具', icon: Terminal },
  { path: '/manuals', title: '手册', icon: BookOpen },
  { path: '/plugins', title: '插件', icon: Package },
  { path: '/settings', title: '设置', icon: SettingsIcon },
]

export function Layout({ children }: { children: ReactNode }) {
  const route = useRoute().path
  const navigate = store.navigate
  const parent = route.startsWith('/t/') ? '/developer' : route.startsWith('/manuals/') ? '/manuals' : route

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="flex w-48 shrink-0 flex-col border-r border-app-border bg-app-panel">
        <div className="flex h-10 items-center gap-2 px-3">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-[5px] text-[10px] font-bold text-white"
            style={{ background: 'linear-gradient(180deg, #4A7DFF 0%, #6D5DF6 100%)' }}
          >
            W
          </span>
          <span className="text-[13px] font-semibold">Work-OS</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => (
            <button
              key={n.path}
              onClick={() => navigate(n.path)}
              className={`flex h-7 w-full items-center gap-2 rounded-app px-2 text-[13px] transition-colors ${
                parent === n.path ? 'bg-app-panel2 font-medium text-app-fg' : 'text-app-fg-dim hover:bg-app-panel2/60 hover:text-app-fg'
              }`}
            >
              <n.icon size={14} />
              {n.title}
            </button>
          ))}
        </nav>
        <div className="border-t border-app-border p-2 text-[11px] text-app-fg-dim">
          <div className="flex items-center gap-1.5">
            <Search size={11} />
            <span>快速启动</span>
            <span className="ml-auto font-mono">⌥Space</span>
          </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-app-border bg-app-panel px-3 text-[12px] text-app-fg-dim">
          <Braces size={12} />
          <span className="truncate">{titleOf(route)}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-app-bg">{children}</div>
      </main>
    </div>
  )
}

function titleOf(route: string): string {
  if (route.startsWith('/t/')) return `工具 · ${route.slice('/t/'.length).split('.').pop()}`
  if (route.startsWith('/manuals/')) return '手册阅读'
  const found = NAV.find((n) => n.path === route)
  return found?.title ?? 'Work-OS'
}
