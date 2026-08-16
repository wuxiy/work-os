import { useEffect, useMemo, useState } from 'react'
import type { PluginEnterEvent, WorkosApi } from '@work-os/plugin-sdk'
import {
  formatTimestamp,
  matchRegex,
  nextCronRuns,
  parseCron,
  parseTimestamp,
  parseUrl,
  textDiff,
  uuidV4,
  type DiffLine,
} from './features'

type TabId = 'uuid' | 'timestamp' | 'regex' | 'url' | 'diff' | 'cron'

const TABS: Array<{ id: TabId; title: string }> = [
  { id: 'uuid', title: 'UUID' },
  { id: 'timestamp', title: '时间戳' },
  { id: 'regex', title: '正则' },
  { id: 'url', title: 'URL 解析' },
  { id: 'diff', title: '文本 Diff' },
  { id: 'cron', title: 'Cron' },
]

/** 命令 → Tab（essentials.open 打开时保持当前 Tab） */
const CODE_TO_TAB: Record<string, TabId> = {
  'essentials.uuid': 'uuid',
  'essentials.timestamp': 'timestamp',
  'essentials.regex': 'regex',
  'essentials.url': 'url',
  'essentials.diff': 'diff',
  'essentials.cron': 'cron',
}

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** datetime-local 控件所需的本地时间值（YYYY-MM-DDTHH:mm） */
function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 复制按钮：自带 1.2s「已复制」反馈；无宿主桥（浏览器 dev）时回退原生剪贴板 */
function CopyButton({ api, text, label = '复制' }: { api: WorkosApi; text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="btn secondary"
      style={{ height: 22, padding: '0 8px', fontSize: 11.5, flex: 'none' }}
      onClick={() => {
        void (async () => {
          try {
            await api.clipboard.writeText(text)
          } catch {
            try {
              await navigator.clipboard.writeText(text)
            } catch {
              /* 忽略：无剪贴板权限 */
            }
          }
        })()
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? '已复制 ✓' : label}
    </button>
  )
}

// ---------- UUID ----------

function UuidPane({ api }: { api: WorkosApi }) {
  const [uuids, setUuids] = useState<string[]>(() => [uuidV4()])
  const [upper, setUpper] = useState(false)
  const [hyphens, setHyphens] = useState(true)
  const fmt = (u: string): string => {
    let s = hyphens ? u : u.replaceAll('-', '')
    if (upper) s = s.toUpperCase()
    return s
  }
  const gen = (n: number): void => {
    setUuids(Array.from({ length: n }, () => uuidV4()))
  }
  return (
    <div className="pane">
      <div className="row">
        <button className="btn" onClick={() => gen(1)}>
          生成 1 个
        </button>
        <button className="btn" onClick={() => gen(5)}>
          批量 5 个
        </button>
        <button className="btn" onClick={() => gen(10)}>
          批量 10 个
        </button>
        <span style={{ flex: 1 }} />
        <label className="check">
          <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} />
          大写
        </label>
        <label className="check">
          <input type="checkbox" checked={hyphens} onChange={(e) => setHyphens(e.target.checked)} />
          连字符
        </label>
      </div>
      <ul className="uuid-list">
        {uuids.map((u, i) => (
          <li className="uuid-item" key={`${u}-${i}`}>
            <span className="dim" style={{ width: 18, textAlign: 'right', fontSize: 11, flex: 'none' }}>
              {i + 1}
            </span>
            <code data-selectable className="mono">
              {fmt(u)}
            </code>
            <CopyButton api={api} text={fmt(u)} />
          </li>
        ))}
      </ul>
      {uuids.length > 1 && (
        <div className="row">
          <span className="badge">共 {uuids.length} 个（v4）</span>
          <span style={{ flex: 1 }} />
          <CopyButton api={api} text={uuids.map(fmt).join('\n')} label="复制全部" />
        </div>
      )}
    </div>
  )
}

// ---------- 时间戳 ----------

function TimestampPane({ api, tsInput, onTsInputChange }: { api: WorkosApi; tsInput: string; onTsInputChange: (v: string) => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offsetH = -new Date().getTimezoneOffset() / 60

  // 时间戳 → 可读
  const tsResult = useMemo(() => {
    if (tsInput.trim() === '') return null
    try {
      const ms = parseTimestamp(tsInput)
      return { ms, local: formatTimestamp(ms, true), iso: new Date(ms).toISOString() }
    } catch (e) {
      return { error: errMsg(e) }
    }
  }, [tsInput])

  // 可读 → 时间戳（日期选择器 + 手输）
  const [dateInput, setDateInput] = useState(() => toLocalInputValue(new Date()))
  const [manualInput, setManualInput] = useState('')
  const parseManual = (s: string): number => {
    const t = s.trim().replace(' ', 'T')
    const ms = Date.parse(t)
    return Number.isNaN(ms) ? Date.parse(s.trim()) : ms
  }
  const pickerMs = dateInput !== '' ? new Date(dateInput).getTime() : NaN
  const manualMs = manualInput.trim() !== '' ? parseManual(manualInput) : NaN

  return (
    <div className="pane">
      <div className="panel">
        <div className="row">
          <span className="title">当前时间</span>
          <span className="badge">{typeof offsetH === 'number' && !Number.isInteger(offsetH) ? `UTC${offsetH.toFixed(1)}` : `UTC${offsetH >= 0 ? '+' : ''}${offsetH}`}</span>
          <span className="badge">{tz}</span>
          <span className="hint">时区</span>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="dim" style={{ width: 64 }}>
            毫秒
          </span>
          <code className="mono" data-selectable style={{ flex: 1 }}>
            {now}
          </code>
          <CopyButton api={api} text={String(now)} />
        </div>
        <div className="row" style={{ marginTop: 4 }}>
          <span className="dim" style={{ width: 64 }}>
            秒
          </span>
          <code className="mono" data-selectable style={{ flex: 1 }}>
            {Math.floor(now / 1000)}
          </code>
          <CopyButton api={api} text={String(Math.floor(now / 1000))} />
        </div>
        <div className="row" style={{ marginTop: 4 }}>
          <span className="dim" style={{ width: 64 }}>
            本地
          </span>
          <code className="mono" data-selectable style={{ flex: 1 }}>
            {formatTimestamp(now, true)}
          </code>
          <CopyButton api={api} text={formatTimestamp(now, true)} />
        </div>
      </div>

      <div className="panel">
        <div className="title">时间戳 → 可读时间</div>
        <div className="row" style={{ marginTop: 6 }}>
          <input
            className="input mono"
            value={tsInput}
            onChange={(e) => onTsInputChange(e.target.value)}
            placeholder="输入秒或毫秒时间戳，如 1699999999（<1e11 视为秒）"
            data-selectable
          />
        </div>
        {tsResult && 'error' in tsResult ? (
          <div className="badge err" style={{ marginTop: 6 }}>
            {tsResult.error}
          </div>
        ) : tsResult ? (
          <div className="col" style={{ marginTop: 6, gap: 4 }}>
            <div className="row">
              <span className="dim" style={{ width: 64 }}>
                本地
              </span>
              <code className="mono" data-selectable style={{ flex: 1 }}>
                {tsResult.local}
              </code>
              <CopyButton api={api} text={tsResult.local} />
            </div>
            <div className="row">
              <span className="dim" style={{ width: 64 }}>
                UTC
              </span>
              <code className="mono" data-selectable style={{ flex: 1 }}>
                {tsResult.iso}
              </code>
              <CopyButton api={api} text={tsResult.iso} />
            </div>
          </div>
        ) : (
          <div className="hint" style={{ marginTop: 6 }}>
            秒 / 毫秒自动识别（数值小于 1e11 按秒处理）
          </div>
        )}
      </div>

      <div className="panel">
        <div className="title">可读时间 → 时间戳</div>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="dim" style={{ width: 64 }}>
            选择器
          </span>
          <input className="input" type="datetime-local" step="1" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: 4 }}>
          <span className="dim" style={{ width: 64 }}>
            手输
          </span>
          <input className="input mono" value={manualInput} onChange={(e) => setManualInput(e.target.value)} placeholder="如 2026-08-16 10:30:00" data-selectable />
        </div>
        <div className="col" style={{ marginTop: 6, gap: 4 }}>
          {[
            { label: '选择器', ms: pickerMs },
            { label: '手输', ms: manualMs },
          ].map(({ label, ms }) => (
            <div className="row" key={label}>
              <span className="dim" style={{ width: 64 }}>
                {label}
              </span>
              {Number.isNaN(ms) ? (
                manualInput.trim() === '' && label === '手输' ? (
                  <span className="hint">（可选）输入后自动换算</span>
                ) : (
                  <span className="badge err">无法解析</span>
                )
              ) : (
                <>
                  <code className="mono" data-selectable style={{ flex: 1 }}>
                    {ms} 毫秒 = {Math.floor(ms / 1000)} 秒
                  </code>
                  <CopyButton api={api} text={String(ms)} label="复制 ms" />
                  <CopyButton api={api} text={String(Math.floor(ms / 1000))} label="复制 s" />
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- 正则 ----------

function RegexPane({ text, onTextChange }: { text: string; onTextChange: (v: string) => void }) {
  const [pattern, setPattern] = useState('\\d+(\\.\\d+)?')
  const [flagG, setFlagG] = useState(true)
  const [flagI, setFlagI] = useState(false)
  const [flagM, setFlagM] = useState(false)
  const flags = `${flagG ? 'g' : ''}${flagI ? 'i' : ''}${flagM ? 'm' : ''}`

  const result = useMemo(() => {
    try {
      return { ok: true as const, matches: matchRegex(pattern, flags, text) }
    } catch (e) {
      return { ok: false as const, error: errMsg(e) }
    }
  }, [pattern, flags, text])

  // 高亮片段：命中用 <mark>
  const parts = useMemo(() => {
    if (!result.ok) return null
    const segs: Array<{ text: string; hit: boolean }> = []
    let last = 0
    for (const m of result.matches) {
      if (m.text === '') {
        last = m.index + 1
        continue // 零宽匹配跳过渲染
      }
      if (m.index > last) segs.push({ text: text.slice(last, m.index), hit: false })
      segs.push({ text: m.text, hit: true })
      last = m.index + m.text.length
    }
    if (last < text.length) segs.push({ text: text.slice(last), hit: false })
    return segs
  }, [result, text])

  const matches = result.ok ? result.matches : []
  const maxGroups = Math.max(0, ...matches.map((m) => m.groups.length))

  return (
    <div className="pane">
      <div className="row">
        <span className="dim">/</span>
        <input className="input mono" style={{ flex: 1 }} value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="正则表达式，如 \\d+" data-selectable spellCheck={false} />
        <span className="dim">/</span>
        <label className="check">
          <input type="checkbox" checked={flagG} onChange={(e) => setFlagG(e.target.checked)} />g
        </label>
        <label className="check">
          <input type="checkbox" checked={flagI} onChange={(e) => setFlagI(e.target.checked)} />i
        </label>
        <label className="check">
          <input type="checkbox" checked={flagM} onChange={(e) => setFlagM(e.target.checked)} />m
        </label>
      </div>
      <textarea
        className="editor"
        style={{ height: '30%' }}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        data-selectable
        spellCheck={false}
        placeholder="测试文本…"
      />
      {!result.ok ? (
        <div className="badge err">✗ 非法正则：{result.error}</div>
      ) : (
        <div className="row">
          <span className={matches.length ? 'badge ok' : 'badge'}>{matches.length ? `✓ ${matches.length} 处匹配` : '无匹配'}</span>
          {maxGroups > 0 && <span className="badge">捕获分组 × {maxGroups}</span>}
        </div>
      )}
      {parts && (
        <div className="panel scroll" data-selectable style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all', minHeight: 60 }}>
          {parts.map((p, i) =>
            p.hit ? (
              <mark key={i}>{p.text}</mark>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </div>
      )}
      {result.ok && matches.length > 0 && maxGroups > 0 && (
        <div className="panel scroll" style={{ maxHeight: '35%' }}>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>匹配</th>
                <th>位置</th>
                {Array.from({ length: maxGroups }, (_, i) => (
                  <th key={i}>分组 {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matches.map((m, i) => (
                <tr key={i}>
                  <td className="dim">{i + 1}</td>
                  <td className="mono">{m.text}</td>
                  <td className="dim">{m.index}</td>
                  {m.groups.map((g, gi) => (
                    <td key={gi} className="mono">
                      {g === '' ? '—' : g}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- URL 解析 ----------

interface ParamRow {
  key: string
  value: string
}

function UrlPane({ api, input, onInputChange }: { api: WorkosApi; input: string; onInputChange: (v: string) => void }) {
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, url: parseUrl(input) }
    } catch (e) {
      return { ok: false as const, error: errMsg(e) }
    }
  }, [input])

  const [rows, setRows] = useState<ParamRow[]>([])
  useEffect(() => {
    // URL 输入变化时重建参数行（行内编辑不回写输入框，避免循环）
    if (parsed.ok) setRows(Object.entries(parsed.url.params).map(([key, value]) => ({ key, value })))
    else setRows([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input])

  const builtUrl = useMemo(() => {
    if (!parsed.ok) return ''
    try {
      const u = new URL(input)
      u.search = ''
      for (const r of rows) {
        if (r.key !== '') u.searchParams.append(r.key, r.value)
      }
      return u.toString()
    } catch {
      return ''
    }
  }, [parsed, input, rows])

  const setRow = (i: number, patch: Partial<ParamRow>): void => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  return (
    <div className="pane">
      <div className="row">
        <input className="input mono" style={{ flex: 1 }} value={input} onChange={(e) => onInputChange(e.target.value)} placeholder="https://…" data-selectable spellCheck={false} />
      </div>
      {!parsed.ok ? (
        <div className="badge err">✗ 无法解析 URL：{parsed.error}</div>
      ) : (
        <div className="panel">
          <table className="table">
            <tbody>
              {[
                ['协议', parsed.url.protocol],
                ['主机', parsed.url.host],
                ['端口', parsed.url.port === '' ? '（默认）' : parsed.url.port],
                ['路径', parsed.url.pathname],
                ['查询', parsed.url.search === '' ? '（无）' : parsed.url.search],
                ['Hash', parsed.url.hash === '' ? '（无）' : parsed.url.hash],
              ].map(([k, v]) => (
                <tr key={k}>
                  <th style={{ width: 64 }}>{k}</th>
                  <td className="mono" data-selectable>
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {parsed.ok && (
        <div className="panel">
          <div className="row">
            <span className="title">查询参数（可编辑，实时回填 URL）</span>
            <span style={{ flex: 1 }} />
            <button className="btn secondary" style={{ height: 22, fontSize: 11.5 }} onClick={() => setRows((rs) => [...rs, { key: '', value: '' }])}>
              + 添加参数
            </button>
          </div>
          <div className="col" style={{ marginTop: 6, gap: 4 }}>
            {rows.length === 0 && <span className="hint">无查询参数</span>}
            {rows.map((r, i) => (
              <div className="kv" key={i}>
                <input className="input mono" style={{ flex: 1 }} value={r.key} onChange={(e) => setRow(i, { key: e.target.value })} placeholder="key" data-selectable spellCheck={false} />
                <span className="dim">=</span>
                <input className="input mono" style={{ flex: 2 }} value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="value" data-selectable spellCheck={false} />
                <button className="btn ghost" style={{ height: 24, padding: '0 6px' }} onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          {rows.length > 0 && (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="dim" style={{ flex: 'none' }}>
                回填 URL
              </span>
              <code className="mono" data-selectable style={{ flex: 1, wordBreak: 'break-all' }}>
                {builtUrl}
              </code>
              <CopyButton api={api} text={builtUrl} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- 文本 Diff ----------

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div className={`diff-line ${line.type}`}>
      <span className="no">{line.oldNo ?? ''}</span>
      <span className="no">{line.newNo ?? ''}</span>
      <span className="content" data-selectable>
        {line.segments.map((s, i) =>
          s.type === 'same' ? (
            <span key={i}>{s.text}</span>
          ) : (
            <span key={i} className={`seg ${s.type}`}>
              {s.text}
            </span>
          ),
        )}
      </span>
    </div>
  )
}

function DiffPane({ left, onLeftChange }: { left: string; onLeftChange: (v: string) => void }) {
  const [right, setRight] = useState(`${left}\n// 新增一行`)
  const lines = useMemo(() => textDiff(left, right), [left, right])
  const added = lines.filter((l) => l.type === 'add').length
  const deleted = lines.filter((l) => l.type === 'del').length
  return (
    <div className="pane" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', flex: 1, gap: 8, minHeight: 0, maxHeight: '45%' }}>
        <textarea className="editor" value={left} onChange={(e) => onLeftChange(e.target.value)} data-selectable spellCheck={false} placeholder="原文（左）…" />
        <textarea className="editor" value={right} onChange={(e) => setRight(e.target.value)} data-selectable spellCheck={false} placeholder="修改后（右）…" />
      </div>
      <div className="row">
        <span className="badge ok">+{added} 新增</span>
        <span className="badge err">-{deleted} 删除</span>
        <span className="hint">行号：左为原文，右为新文；行内高亮为词级差异</span>
      </div>
      <div className="panel scroll diff-body" data-selectable style={{ flex: 1 }}>
        {lines.map((l, i) => (
          <DiffRow key={i} line={l} />
        ))}
      </div>
    </div>
  )
}

// ---------- Cron ----------

const CRON_PRESETS = ['*/5 * * * *', '0 9 * * 1-5', '0 0 * * *', '30 8 1 * *', '0 */2 * * *']

function CronPane({ expr, onExprChange }: { expr: string; onExprChange: (v: string) => void }) {
  const result = useMemo(() => {
    try {
      return { ok: true as const, ...parseCron(expr) }
    } catch (e) {
      return { ok: false as const, error: errMsg(e) }
    }
  }, [expr])
  const nexts = useMemo(() => (result.ok ? nextCronRuns(expr, 5) : []), [result.ok, expr])

  return (
    <div className="pane">
      <div className="row">
        <input className="input mono" style={{ flex: 1 }} value={expr} onChange={(e) => onExprChange(e.target.value)} placeholder="分 时 日 月 周，如 */5 * * * *" data-selectable spellCheck={false} />
      </div>
      <div className="row">
        {CRON_PRESETS.map((p) => (
          <button key={p} className={`tab ${expr === p ? 'active' : ''}`} onClick={() => onExprChange(p)}>
            {p}
          </button>
        ))}
        <span className="hint">支持 * / */n / a-b / a,b / a-b/n</span>
      </div>
      {!result.ok ? (
        <div className="badge err">✗ {result.error}</div>
      ) : (
        <>
          <div className="panel">
            <div className="title">中文描述</div>
            <div data-selectable style={{ marginTop: 4, fontSize: 13 }}>
              {result.humanReadable}
            </div>
          </div>
          <div className="panel">
            <div className="title">未来 5 次执行时间（本地时区）</div>
            <div className="col cron-next" style={{ marginTop: 6 }}>
              {nexts.map((d, i) => (
                <div className="item" key={i}>
                  <span className="dim" style={{ width: 16, textAlign: 'right' }}>
                    {i + 1}
                  </span>
                  <code className="mono" data-selectable>
                    {formatTimestamp(d.getTime())}
                  </code>
                  <span className="badge">{WEEK_NAMES[d.getDay()] ?? ''}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- App ----------

export function App({ api }: { api: WorkosApi }) {
  const [tab, setTab] = useState<TabId>('uuid')
  // 各 Tab 主输入提升到 App：onPluginEnter 的 payload 需要跨 Tab 填入
  const [regexText, setRegexText] = useState('订单 128 号，共 3 件商品，合计 256.50 元。\n第 1 批 12 件已发出，第 2 批 30 件备货中。')
  const [urlInput, setUrlInput] = useState('https://user:pass@example.com:8080/a/b?x=1&y=2#frag')
  const [diffLeft, setDiffLeft] = useState('const a = 1;\nconst b = 2;\nconsole.log(a + b);')
  const [cronExpr, setCronExpr] = useState('*/5 * * * *')
  const [tsInput, setTsInput] = useState('')

  useEffect(() => {
    const onEnter = (e: Event): void => {
      const detail = (e as CustomEvent<PluginEnterEvent>).detail
      if (!detail) return
      const payload = typeof detail.payload === 'string' ? detail.payload : ''
      const target = CODE_TO_TAB[detail.code]
      if (target) setTab(target)
      // payload 文本自动填入对应 Tab 的输入框
      if (payload !== '') {
        switch (target ?? tab) {
          case 'regex':
            setRegexText(payload)
            break
          case 'url':
            setUrlInput(payload)
            break
          case 'diff':
            setDiffLeft(payload)
            break
          case 'cron':
            setCronExpr(payload)
            break
          case 'timestamp':
            setTsInput(payload)
            break
          default:
            break
        }
      }
    }
    window.addEventListener('workos-enter', onEnter)
    return () => window.removeEventListener('workos-enter', onEnter)
  }, [tab])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: 10 }}>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.title}
          </button>
        ))}
      </div>
      {tab === 'uuid' && <UuidPane api={api} />}
      {tab === 'timestamp' && <TimestampPane api={api} tsInput={tsInput} onTsInputChange={setTsInput} />}
      {tab === 'regex' && <RegexPane text={regexText} onTextChange={setRegexText} />}
      {tab === 'url' && <UrlPane api={api} input={urlInput} onInputChange={setUrlInput} />}
      {tab === 'diff' && <DiffPane left={diffLeft} onLeftChange={setDiffLeft} />}
      {tab === 'cron' && <CronPane expr={cronExpr} onExprChange={setCronExpr} />}
    </div>
  )
}
