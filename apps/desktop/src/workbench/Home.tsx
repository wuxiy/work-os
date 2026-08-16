import { Clock, Heart, PackageCheck, Play, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Card } from '@work-os/ui'
import { ipc } from '../lib/ipc'
import { store, usePlugins } from '../lib/store'

interface HomeData {
  tools: Array<{ id: string; name: string }>
  recent: Array<{ kind: string; ref: string; title: string; ts: number }>
  recentRequests: Array<{ id: number; method: string; url: string; status: number | null; timeMs: number | null }>
  recentManuals: Array<{ kind: string; ref: string; title: string; ts: number }>
  favorites: Array<{ kind: string; ref: string; title: string }>
}

/** 首页围绕「继续工作」组织（产品架构 §5） */
export function Home() {
  const navigate = store.navigate
  const plugins = usePlugins()
  const [data, setData] = useState<HomeData>({ tools: [], recent: [], recentRequests: [], recentManuals: [], favorites: [] })
  const [updateHint, setUpdateHint] = useState<string>('')

  const reload = () => {
    void (async () => {
      const [recent, favorites, recentRequests, recentManuals] = await Promise.all([
        ipc.recentList(undefined, 8),
        ipc.favoritesList(),
        ipc.httpRecent(6),
        ipc.recentList('manual', 6),
      ])
      const tools = plugins.filter((p) => p.row.type === 'ui' && p.row.enabled).map((p) => ({ id: p.row.id, name: p.row.name }))
      setData({ tools, recent, favorites, recentRequests, recentManuals })
    })()
  }

  useEffect(() => {
    reload()
    void checkUpdates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugins])

  async function checkUpdates() {
    try {
      const urls = await ipc.registryList()
      if (urls.length === 0) {
        setUpdateHint('未配置插件源')
        return
      }
      let updatable = 0
      for (const u of urls) {
        const doc = await ipc.registryFetch(u)
        for (const p of doc.plugins) {
          const installed = plugins.find((x) => x.row.id === p.id)
          if (!installed || installed.row.version !== p.version) updatable++
        }
      }
      setUpdateHint(updatable > 0 ? `${updatable} 个插件有新版本` : '插件均为最新')
    } catch {
      setUpdateHint('插件源不可达')
    }
  }

  const openTool = (id: string) => {
    void ipc.openTool(id)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-5">
      <section>
        <h2 className="mb-2 text-[12px] font-medium text-app-fg-dim">快速工具</h2>
        <div className="grid grid-cols-3 gap-2">
          {data.tools.map((t) => (
            <button
              key={t.id}
              onDoubleClick={() => openTool(t.id)}
              onClick={() => openTool(t.id)}
              className="flex h-9 items-center gap-2 rounded-app border border-app-border bg-app-panel px-3 text-[13px] transition-colors hover:border-app-accent/50"
            >
              <Play size={12} className="text-app-fg-dim" />
              {t.name}
            </button>
          ))}
          {data.tools.length === 0 && <p className="col-span-3 text-[12px] text-app-fg-dim">暂无已启用的工具插件</p>}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-app-fg-dim">
            <Clock size={12} /> 最近使用
          </h2>
          <Card className="divide-y divide-app-border">
            {data.recent.map((r) => (
              <RecentRow key={`${r.kind}:${r.ref}`} title={r.title} kind={r.kind} onClick={() => activate(r.kind, r.ref, r.title, navigate, openTool)} />
            ))}
            {data.recent.length === 0 && <p className="p-3 text-[12px] text-app-fg-dim">暂无记录</p>}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-app-fg-dim">
            <Heart size={12} /> 收藏
          </h2>
          <Card className="divide-y divide-app-border">
            {data.favorites.map((f) => (
              <RecentRow key={`${f.kind}:${f.ref}`} title={f.title} kind={f.kind} onClick={() => activate(f.kind, f.ref, f.title, navigate, openTool)} />
            ))}
            {data.favorites.length === 0 && <p className="p-3 text-[12px] text-app-fg-dim">在手册或命令上点击收藏</p>}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-app-fg-dim">最近请求</h2>
          <Card className="divide-y divide-app-border">
            {data.recentRequests.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                <Badge tone={r.status && r.status < 400 ? 'success' : 'danger'}>{r.method}</Badge>
                <span className="truncate text-app-fg-dim">{r.url}</span>
                {r.timeMs != null && <span className="ml-auto shrink-0 font-mono text-[11px] text-app-fg-dim">{r.timeMs}ms</span>}
              </div>
            ))}
            {data.recentRequests.length === 0 && <p className="p-3 text-[12px] text-app-fg-dim">用 API Client 发送第一个请求</p>}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-app-fg-dim">最近手册</h2>
          <Card className="divide-y divide-app-border">
            {data.recentManuals.map((m) => (
              <button key={m.ref} onClick={() => void ipc.openManual(latestSource(), m.ref)} className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-app-panel2">
                {m.title}
              </button>
            ))}
            {data.recentManuals.length === 0 && <p className="p-3 text-[12px] text-app-fg-dim">从手册中心开始阅读</p>}
          </Card>
        </section>
      </div>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-app-fg-dim">
          <PackageCheck size={12} /> 插件更新
        </h2>
        <Card className="flex items-center gap-2 p-3 text-[12px] text-app-fg-dim">
          <RefreshCw size={12} />
          {updateHint || '检查中…'}
        </Card>
      </section>
    </div>
  )
}

function latestSource(): string {
  return 'dev.workos.manual.linux'
}

function RecentRow({ title, kind, onClick }: { title: string; kind: string; onClick: () => void }) {
  const kindLabel: Record<string, string> = { command: '命令', tool: '工具', manual: '手册', request: '请求', url: 'URL' }
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-app-panel2">
      <span className="truncate">{title}</span>
      <span className="ml-auto shrink-0 text-[11px] text-app-fg-dim">{kindLabel[kind] ?? kind}</span>
    </button>
  )
}

function activate(
  kind: string,
  ref: string,
  _title: string,
  navigate: (path: string) => void,
  openTool: (id: string) => void,
) {
  if (kind === 'tool') openTool(ref)
  else if (kind === 'manual') void ipc.openManual(latestSource(), ref)
  else if (kind === 'command') void ipc.recordCommand(ref)
  else navigate('/home')
}
