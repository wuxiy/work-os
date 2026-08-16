import { ArrowLeft, Copy, Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  const [doc, setDoc] = useState<ManualDocVo | null>(null)
  const [related, setRelated] = useState<ManualSearchHitVo[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fav, setFav] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const d = await ipc.manualDoc(sourceId, docId)
        setDoc(d)
        setFav(false)
        void ipc.favoritesList().then((list) => setFav(list.some((f) => f.kind === 'manual' && f.ref === docId)))
        void ipc.manualCategories(sourceId).then(setCategories)
        // 相关命令：同分类的其他命令
        void ipc.manualList(sourceId).then((all) =>
          setRelated(all.filter((x) => x.docId !== docId && (x.category === d.category || d.aliases.includes(x.docId))).slice(0, 10)),
        )
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [sourceId, docId])

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
      <aside className="w-44 shrink-0 overflow-auto border-r border-app-border bg-app-panel p-2">
        <button onClick={() => void ipc.navigateWorkbench('/manuals')} className="mb-2 flex items-center gap-1 text-[12px] text-app-fg-dim hover:text-app-fg">
          <ArrowLeft size={12} /> 返回手册中心
        </button>
        <p className="px-1 pb-1 text-[11px] font-medium text-app-fg-dim">分类</p>
        {categories.map((c) => (
          <div key={c} className={`rounded-app px-1.5 py-1 text-[12px] ${c === doc.category ? 'bg-app-panel2 font-medium text-app-fg' : 'text-app-fg-dim'}`}>
            {c}
          </div>
        ))}
        {related.length > 0 && (
          <>
            <p className="px-1 pb-1 pt-3 text-[11px] font-medium text-app-fg-dim">相关命令</p>
            {related.map((r) => (
              <button
                key={r.docId}
                onClick={() => void ipc.openManual(sourceId, r.docId)}
                className="block w-full rounded-app px-1.5 py-1 text-left font-mono text-[12px] text-app-fg-dim hover:bg-app-panel2 hover:text-app-fg"
              >
                {r.docId}
              </button>
            ))}
          </>
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
