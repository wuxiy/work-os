import { useEffect, useMemo, useState } from 'react'
import { workos } from '@work-os/plugin-sdk'

const SAMPLE = `{"name":"work-os","version":"0.4","tags":["launcher","plugin"],"meta":{"local":true,"count":2}}`

type TabId = 'format' | 'validate' | 'escape' | 'path' | 'diff' | 'yaml' | 'ts'

const TABS: Array<{ id: TabId; title: string }> = [
  { id: 'format', title: '格式化 / 压缩' },
  { id: 'validate', title: '校验' },
  { id: 'escape', title: '转义 / 反转义' },
  { id: 'path', title: 'JSONPath' },
  { id: 'diff', title: 'Diff' },
  { id: 'yaml', title: 'YAML' },
  { id: 'ts', title: 'TypeScript' },
]

export function App() {
  const [tab, setTab] = useState<TabId>('format')
  const [input, setInput] = useState(SAMPLE)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [pathQuery, setPathQuery] = useState('$.meta.count')
  const [indent, setIndent] = useState(2)
  const [diffRight, setDiffRight] = useState(SAMPLE.replace('"0.4"', '"0.5"'))
  const [copied, setCopied] = useState(false)

  // 进入事件：Launcher 携带的 JSON 与动作（如 json.format）
  useEffect(() => {
    const onEnter = (e: Event): void => {
      const detail = (e as CustomEvent<{ code: string; payload?: unknown }>).detail
      if (detail?.payload && typeof detail.payload === 'string') setInput(detail.payload)
      if (detail?.code?.startsWith('json.')) {
        const t = TABS.find((x) => detail.code.startsWith(x.id === 'format' ? 'json.format' : `json.${x.id === 'ts' ? 'toTypescript' : x.id}`))
        if (t) setTab(t.id)
      }
    }
    window.addEventListener('workos-enter', onEnter)
    return () => window.removeEventListener('workos-enter', onEnter)
  }, [])

  const run = (which: TabId): void => {
    setError('')
    setCopied(false)
    try {
      switch (which) {
        case 'format':
          setOutput(JSON.stringify(JSON.parse(input), null, indent))
          break
        case 'validate': {
          // 见下方校验面板
          break
        }
        case 'escape':
          setOutput(JSON.stringify(input).slice(1, -1))
          break
        case 'path': {
          // 延迟导入避免主包膨胀
          void import('./features').then((f) => {
            try {
              const hits = f.jsonPath(JSON.parse(input), pathQuery)
              setOutput(hits.length ? hits.map((h) => JSON.stringify(h, null, 2)).join('\n---\n') : '（无匹配）')
            } catch (e2) {
              setError(String(e2))
            }
          })
          return
        }
        case 'diff':
          void import('./features').then((f) => {
            const diffs = f.diffJson(JSON.parse(input), JSON.parse(diffRight))
            setOutput(diffs.length ? diffs.map((d) => `${mark(d.type)} ${d.path}\n  - ${JSON.stringify(d.left)}\n  + ${JSON.stringify(d.right)}`).join('\n') : '两个 JSON 完全一致')
          })
          return
        case 'yaml':
          void import('./features').then((f) => setOutput(f.jsonToYaml(input)))
          return
        case 'ts':
          void import('./features').then((f) => setOutput(f.jsonToTypescript('Root', input)))
          return
      }
    } catch (e) {
      setError(String(e))
    }
  }

  const validateResult = useMemo(() => {
    if (tab !== 'validate') return null
    try {
      JSON.parse(input)
      return { ok: true }
    } catch (e) {
      // 计算行列
      const msg = e instanceof SyntaxError ? e.message : String(e)
      const m = /position (\d+)/.exec(msg)
      if (m) {
        const pos = Number(m[1])
        const before = input.slice(0, pos)
        const line = before.split('\n').length
        const column = pos - before.lastIndexOf('\n')
        return { ok: false, error: `${msg}（第 ${line} 行，第 ${column} 列）` }
      }
      return { ok: false, error: msg }
    }
  }, [tab, input])

  const copy = async (): Promise<void> => {
    const text = tab === 'format' && output === '' ? JSON.stringify(JSON.parse(input), null, indent) : output
    await workos.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.title}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => void copy()}>
          {copied ? '已复制 ✓' : '复制结果'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: 8, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <textarea
            className="editor"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            data-selectable
            spellCheck={false}
            placeholder="输入 JSON…"
          />
          {tab === 'diff' && (
            <textarea className="editor" style={{ height: '40%' }} value={diffRight} onChange={(e) => setDiffRight(e.target.value)} data-selectable spellCheck={false} placeholder="对比的右侧 JSON…" />
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          {tab === 'validate' ? (
            <div className="editor" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {validateResult?.ok ? <span className="badge ok">✓ JSON 合法</span> : <span className="badge err">✗ {validateResult?.error}</span>}
            </div>
          ) : (
            <textarea className="editor" value={output} readOnly data-selectable spellCheck={false} placeholder="结果…" />
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {tab === 'format' && (
              <>
                <span style={{ color: 'var(--fg-dim)' }}>缩进</span>
                {[2, 4].map((n) => (
                  <button key={n} className={`tab ${indent === n ? 'active' : ''}`} onClick={() => setIndent(n)}>
                    {n}
                  </button>
                ))}
              </>
            )}
            {tab === 'path' && (
              <>
                <input className="input" value={pathQuery} onChange={(e) => setPathQuery(e.target.value)} placeholder="$.store.book[0].title" style={{ flex: 1 }} />
              </>
            )}
            <span style={{ flex: 1 }} />
            <button className="btn secondary" onClick={() => run(tab)}>
              执行
            </button>
          </div>
          {error && <div className="badge err">{error}</div>}
        </div>
      </div>
    </div>
  )
}

function mark(t: string): string {
  return t === 'added' ? '[+]' : t === 'removed' ? '[-]' : '[~]'
}
