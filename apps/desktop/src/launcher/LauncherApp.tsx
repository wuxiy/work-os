import { listen } from '@tauri-apps/api/event'
import { CornerDownLeft, BookOpen, Clock, Command as CommandIcon, Heart, Puzzle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ipc } from '../lib/ipc'
import { commandRegistry, registerCoreCommands } from '../lib/commands'
import { syncPluginCommands } from '../lib/commands'
import { applyHtmlTheme } from '../lib/store'
import { buildLauncherModel, type LauncherModel } from './model'

const GROUP_LABEL: Record<string, string> = {
  command: '命令',
  plugin: '插件',
  manual: '手册',
  recent: '最近',
  favorite: '收藏',
}

export function LauncherApp() {
  const [query, setQuery] = useState('')
  const [model, setModel] = useState<LauncherModel>({ items: [], contextHint: '' })
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // document 级 ESC：无论输入框是否聚焦都能关闭（B1）
    const onDocKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void ipc.launcherHide()
      }
    }
    document.addEventListener('keydown', onDocKey)
    return () => document.removeEventListener('keydown', onDocKey)
  }, [])

  useEffect(() => {
    void ipc.launcherReady()
    void ipc.debugLog('launcher mounted')
    registerCoreCommands()
    void syncPluginCommands()
    void ipc.themeGet().then((t) => applyHtmlTheme(t.resolved))
    void listen('workos://launcher-shown', () => {
      void ipc.launcherReady() // 每次 warm show 埋点（N1）
      // WKWebView 置顶后焦点就绪有时延：多轮重试聚焦输入框
      for (const d of [0, 50, 120, 250, 500, 900, 1500, 2500]) {
        setTimeout(() => inputRef.current?.focus(), d)
      }
      void syncPluginCommands()
    })
    void listen<string>('workos://theme', (e) => applyHtmlTheme(e.payload as 'dark' | 'light'))
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      void buildLauncherModel(query, commandRegistry).then((m) => {
        if (!cancelled) {
          setModel(m)
          setActive(0)
          void ipc.debugLog(`input="${query}" items=${m.items.length}${m.contextHint ? ' [context]' : ''}`)
        }
      })
    }, 60)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const perfMark = useMemo(() => performance.now(), [query])

  useEffect(() => {
    // Command Search 埋点（N2）：记录输入到结果渲染耗时
    queueMicrotask(() => {
      const ms = performance.now() - perfMark
      if (query.trim() && ms >= 0) console.info(`[perf] command_search_frontend ${ms.toFixed(1)}ms`)
    })
  }, [model, perfMark, query])

  const execute = (index: number) => {
    const item = model.items[index]
    void ipc.debugLog(`execute idx=${index} key=${item?.key ?? 'none'}`)
    if (!item) return
    void (async () => {
      try {
        if (item.manual) {
          await ipc.recordCommand(`manual.open.${item.manual.docId}`, undefined, item.manual.title)
          await ipc.openManual(item.manual.sourceId, item.manual.docId)
        } else if (item.command) {
          const c = item.command
          if (c.kind === 'core-action') {
            await commandRegistry.execute(c.id, { input: query })
            await ipc.recordCommand(c.id, query, c.title)
          } else {
            const payload = c.acceptsInput && query.trim() && query.trim() !== c.title ? query : undefined
            await ipc.recordCommand(c.id, payload, c.title)
            await ipc.openTool(c.target ?? '', c.code ?? c.id, payload)
          }
        } else if (item.recent) {
          const r = item.recent
          if (r.kind === 'manual') await ipc.openManual('dev.workos.manual.linux', r.ref)
          else if (r.kind === 'tool') await ipc.openTool(r.ref)
          else await ipc.recordCommand(r.ref)
        } else if (item.favorite) {
          const f = item.favorite
          if (f.kind === 'manual') await ipc.openManual('dev.workos.manual.linux', f.ref)
          else if (f.kind === 'tool') await ipc.openTool(f.ref)
        }
      } finally {
        await ipc.launcherHide().catch(() => {})
        setQuery('')
      }
    })()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, model.items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      execute(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      void ipc.launcherHide()
    }
  }

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app-bg shadow-2xl" onMouseDown={() => inputRef.current?.focus()}>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-app-border px-4">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[11px] font-bold text-white"
          style={{ background: 'linear-gradient(180deg, #4A7DFF 0%, #6D5DF6 100%)' }}
        >
          W
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="搜索命令、工具、手册…（⌥Space 唤起）"
          className="h-full flex-1 bg-transparent text-[16px] outline-none placeholder:text-app-fg-dim"
          autoFocus
          spellCheck={false}
        />
        <span className="font-mono text-[11px] text-app-fg-dim">{model.items.length} 项</span>
      </div>

      {model.contextHint && (
        <div className="shrink-0 border-b border-app-border bg-app-accent/10 px-4 py-1.5 text-[12px] text-app-accent">{model.contextHint}</div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-auto p-1.5">
        {model.items.map((item, i) => (
          <button
            key={item.key}
            onMouseEnter={() => setActive(i)}
            onClick={() => execute(i)}
            className={`flex w-full items-center gap-3 rounded-app px-3 py-2 text-left ${i === active ? 'bg-app-accent text-app-accent-fg' : 'hover:bg-app-panel2'}`}
          >
            <GroupIcon group={item.group} active={i === active} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className={`truncate text-[14px] ${item.group === 'manual' ? 'font-mono' : ''}`}>{item.title}</span>
                {item.context && (
                  <span className={`rounded-[4px] px-1 text-[10px] ${i === active ? 'bg-white/20' : 'bg-app-accent/15 text-app-accent'}`}>输入感知</span>
                )}
              </span>
              {item.subtitle && <span className={`block truncate text-[11px] ${i === active ? 'text-white/70' : 'text-app-fg-dim'}`}>{item.subtitle}</span>}
            </span>
            {item.badge && <span className={`shrink-0 font-mono text-[11px] ${i === active ? 'text-white/70' : 'text-app-fg-dim'}`}>{item.badge}</span>}
            {i === active && <CornerDownLeft size={12} className="shrink-0 opacity-70" />}
          </button>
        ))}
        {model.items.length === 0 && (
          <p className="px-4 py-6 text-center text-[13px] text-app-fg-dim">没有匹配结果</p>
        )}
      </div>
    </div>
  )
}

function GroupIcon({ group, active }: { group: string; active: boolean }) {
  const cls = active ? 'text-white/80' : 'text-app-fg-dim'
  const label = GROUP_LABEL[group] ?? group
  switch (group) {
    case 'manual':
      return <BookOpen size={15} className={cls} aria-label={label} />
    case 'plugin':
      return <Puzzle size={15} className={cls} aria-label={label} />
    case 'recent':
      return <Clock size={15} className={cls} aria-label={label} />
    case 'favorite':
      return <Heart size={15} className={cls} aria-label={label} />
    default:
      return <CommandIcon size={15} className={cls} aria-label={label} />
  }
}
