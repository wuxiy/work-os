import { BookOpen, Heart, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Card, EmptyState, Input } from '@work-os/ui'
import { ipc, type ManualSearchHitVo } from '../lib/ipc'

/** 手册中心（产品架构 §7）：只显示实际已安装的手册（不得有占位假数据） */
export function ManualHub() {
  const [sources, setSources] = useState<Array<[string, string, string, number]>>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ManualSearchHitVo[]>([])

  useEffect(() => {
    void ipc.manualSources().then(setSources)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      return
    }
    const t = setTimeout(() => {
      void ipc.manualSearch(query, 30).then(setHits)
    }, 120)
    return () => clearTimeout(t)
  }, [query])

  const grouped = useMemo(() => {
    const m = new Map<string, ManualSearchHitVo[]>()
    for (const h of hits) {
      const list = m.get(h.category || '其他') ?? []
      list.push(h)
      m.set(h.category || '其他', list)
    }
    return [...m.entries()]
  }, [hits])

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      <h1 className="text-[15px] font-semibold">手册中心</h1>

      {sources.length === 0 ? (
        <EmptyState title="尚未安装任何手册" hint="安装手册插件（如 linux-manual.workos-plugin）后即可离线搜索阅读" />
      ) : (
        <>
          <div className="space-y-2">
            {sources.map(([id, name, version, docs]) => (
              <Card key={id} className="flex items-center gap-3 p-3">
                <BookOpen size={16} className="text-app-fg-dim" />
                <div className="flex-1">
                  <span className="text-[13px] font-medium">{name}</span>
                  <span className="ml-2 font-mono text-[11px] text-app-fg-dim">v{version}</span>
                </div>
                <Badge>{docs} 篇</Badge>
              </Card>
            ))}
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-app-fg-dim" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索命令、别名或关键词（支持中文，离线可用）" className="pl-7" autoFocus />
          </div>

          {query.trim() !== '' &&
            grouped.map(([cat, list]) => (
              <section key={cat}>
                <p className="mb-1 text-[11px] font-medium text-app-fg-dim">{cat}</p>
                <Card className="divide-y divide-app-border">
                  {list.map((h) => (
                    <button
                      key={`${h.sourceId}:${h.docId}`}
                      onClick={() => void ipc.openManual(h.sourceId, h.docId)}
                      className="block w-full px-3 py-2 text-left hover:bg-app-panel2"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px]">{h.title}</span>
                        {h.summary && <span className="truncate text-[12px] text-app-fg-dim">{h.summary}</span>}
                      </div>
                    </button>
                  ))}
                </Card>
              </section>
            ))}
          {query.trim() !== '' && hits.length === 0 && <EmptyState title={`没有匹配「${query}」的手册`} />}
        </>
      )}
    </div>
  )
}
