import { ArrowLeft, Copy, Heart } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Badge, Button, EmptyState, Spinner } from '@work-os/ui'
import { ipc, type ManualDocVo, type ManualSearchHitVo } from '../lib/ipc'

/**
 * 手册阅读器（产品架构 §7、技术架构 §28）
 * 安全：默认不渲染内联 HTML（react-markdown 无 rehype-raw）、URI 白名单、仅 Copy 无 Execute。
 */
export function ManualReader({ sourceId, docId }: { sourceId: string; docId: string }) {
  // 内部维护当前文档：点击侧栏命令即时切换，不依赖宿主 route 事件重挂载
  const [currentId, setCurrentId] = useState(docId)
  useEffect(() => setCurrentId(docId), [docId])
  const [doc, setDoc] = useState<ManualDocVo | null>(null)
  const [allDocs, setAllDocs] = useState<ManualSearchHitVo[]>([])
  const [openCat, setOpenCat] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fav, setFav] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // 快速切换命令时取消过期请求：防止旧响应覆盖新文档（侧栏高亮与正文错乱）
    let alive = true
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const d = await ipc.manualDoc(sourceId, currentId)
        if (!alive) return
        void ipc.debugLog(`manual doc loaded: ${currentId}`)
        setDoc(d)
        setFav(false)
        void ipc.favoritesList().then((list) => {
          if (alive) setFav(list.some((f) => f.kind === 'manual' && f.ref === currentId))
        })
      } catch (e) {
        if (alive) setError(String(e))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [sourceId, currentId])

  // 全量文档（分类树数据源）：挂载时取一次
  useEffect(() => {
    void ipc.manualList(sourceId).then(setAllDocs)
  }, [sourceId])

  // 当前命令所在分类自动展开
  useEffect(() => {
    if (doc?.category) setOpenCat(doc.category)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  const categories = useMemo(() => {
    const m = new Map<string, ManualSearchHitVo[]>()
    for (const d of allDocs) {
      const c = d.category || '其他'
      const list = m.get(c) ?? []
      list.push(d)
      m.set(c, list)
    }
    return [...m.entries()]
  }, [allDocs])

  const related = useMemo(
    () =>
      allDocs
        .filter((x) => x.docId !== currentId && (x.category === doc?.category || doc?.aliases.includes(x.docId)))
        .slice(0, 10),
    [allDocs, currentId, doc],
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-app-fg-dim">
        <Spinner /> 加载手册…
      </div>
    )
  }
  if (error || !doc) return <EmptyState title="手册文档不存在" hint={error} />

  const copyCommand = async () => {
    await navigator.clipboard.writeText(doc.title)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const toggleFav = async () => {
    const now = await ipc.favoriteToggle('manual', doc.id, doc.title)
    setFav(now)
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-44 shrink-0 flex-col overflow-hidden border-r border-app-border bg-app-panel">
        <div className="p-2 pb-1">
          <button onClick={() => void ipc.navigateWorkbench('/manuals')} className="flex items-center gap-1 text-[12px] text-app-fg-dim hover:text-app-fg">
            <ArrowLeft size={12} /> 返回手册中心
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {categories.map(([cat, list]) => {
            const expanded = openCat === cat
            const activeCat = doc?.category === cat
            return (
              <div key={cat} className="mb-0.5">
                <button
                  onClick={() => setOpenCat(expanded ? null : cat)}
                  className={`flex h-6 w-full items-center gap-1 rounded-app px-1.5 text-[12px] ${
                    activeCat ? 'font-medium text-app-fg' : 'text-app-fg-dim hover:text-app-fg'
                  }`}
                >
                  <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
                  {cat}
                  <span className="ml-auto text-[10px] opacity-60">{list.length}</span>
                </button>
                {expanded && (
                  <div className="mt-0.5 ml-3 border-l border-app-border pl-1">
                    {list.map((d) => (
                      <button
                        key={d.docId}
                        onClick={() => {
                          void ipc.debugLog(`manual tree → ${d.docId}`)
                          setCurrentId(d.docId)
                        }}
                        className={`block w-full rounded-[4px] px-1.5 py-[3px] text-left font-mono text-[12px] ${
                          d.docId === currentId ? 'bg-app-accent/15 text-app-accent' : 'text-app-fg-dim hover:bg-app-panel2 hover:text-app-fg'
                        }`}
                      >
                        {d.docId}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {related.length > 0 && (
          <div className="max-h-40 shrink-0 overflow-auto border-t border-app-border p-2">
            <p className="px-1 pb-1 text-[11px] font-medium text-app-fg-dim">相关命令</p>
            {related.map((r) => (
              <button
                key={r.docId}
                onClick={() => setCurrentId(r.docId)}
                className="block w-full rounded-app px-1.5 py-1 text-left font-mono text-[12px] text-app-fg-dim hover:bg-app-panel2 hover:text-app-fg"
              >
                {r.docId}
              </button>
            ))}
          </div>
        )}
      </aside>

      <article className="prose min-h-0 flex-1 overflow-auto p-6" data-selectable>
        <header className="mb-4 flex items-start gap-3">
          <div>
            <h1 className="font-mono text-[20px] font-semibold">{doc.title}</h1>
            {doc.summary && <p className="mt-1 text-[13px] text-app-fg-dim">{doc.summary}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {doc.category && <Badge tone="accent">{doc.category}</Badge>}
              {doc.aliases.map((a) => (
                <Badge key={a}>{a}</Badge>
              ))}
              {doc.tags.map((t) => (
                <Badge key={t}>#{t}</Badge>
              ))}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => void copyCommand()}>
              <Copy size={12} /> {copied ? '已复制' : '复制命令'}
            </Button>
            <Button variant={fav ? 'default' : 'outline'} size="sm" onClick={() => void toggleFav()}>
              <Heart size={12} /> {fav ? '已收藏' : '收藏'}
            </Button>
          </div>
        </header>
        <div className="manual-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            urlTransform={safeUrl}
            components={{
              pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              ),
            }}
          >
            {doc.content}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  )
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative">
      <button
        onClick={(e) => {
          const code = e.currentTarget.parentElement?.querySelector('code')
          if (code?.textContent) void navigator.clipboard.writeText(code.textContent)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }}
        className="absolute right-2 top-2 hidden rounded-[4px] border border-app-border bg-app-panel px-1.5 py-0.5 text-[11px] text-app-fg-dim group-hover:block"
      >
        {copied ? '已复制' : '复制'}
      </button>
      <pre className="overflow-auto rounded-app border border-app-border bg-app-panel2 p-3 font-mono text-[12.5px] leading-relaxed">{children}</pre>
    </div>
  )
}

/** URI 白名单（验收 L7：拦截 javascript: 等危险协议） */
function safeUrl(url: string, _key: string | null): string {
  if (/^(https?:|mailto:|#|\/)/i.test(url)) return url
  return '#'
}
