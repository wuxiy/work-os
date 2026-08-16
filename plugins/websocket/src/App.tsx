import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWorkos } from '@work-os/plugin-sdk'
import type { WsMessageEvent } from '@work-os/plugin-sdk'
import {
  appendSession,
  displayMessage,
  encodeBase64Utf8,
  filterMessages,
  formatTimestamp,
  headersToRows,
  isCloseSystemEvent,
  isWebSocketUrl,
  parseSessions,
  parseSubprotocols,
  rowsToHeaders,
  validateSendJson,
  type ChatMsg,
  type DirectionFilter,
  type KeyValueRow,
  type SessionEntry,
} from './features'

// 每个插件实例独立的桥接客户端（与 window.workos 等价）
const workos = createWorkos()

const DEFAULT_URL = 'wss://echo.websocket.events'

type Status = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

type SendKind = 'text' | 'json' | 'binary'

const STATUS_TEXT: Record<Status, string> = {
  disconnected: '已断开',
  connecting: '连接中…',
  connected: '已连接',
  reconnecting: '自动重连中…（2 秒后）',
}

let nextId = 1

export function App() {
  // 连接配置
  const [url, setUrl] = useState(DEFAULT_URL)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>([{ key: '', value: '' }])
  const [subprotocols, setSubprotocols] = useState('')
  const [autoReconnect, setAutoReconnect] = useState(false)
  const [status, setStatus] = useState<Status>('disconnected')
  const [error, setError] = useState('')

  // 消息与工具条
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [keyword, setKeyword] = useState('')
  const [dirFilter, setDirFilter] = useState<DirectionFilter>('all')
  const [jsonPretty, setJsonPretty] = useState(false)

  // 发送区
  const [sendKind, setSendKind] = useState<SendKind>('text')
  const [sendText, setSendText] = useState('')
  const [sendError, setSendError] = useState('')

  // 最近连接
  const [sessions, setSessions] = useState<SessionEntry[]>([])

  // 跨回调共享的最新值（避免闭包过期）
  const sessionIdRef = useRef<string | null>(null)
  const manualCloseRef = useRef(false)
  const autoReconnectRef = useRef(autoReconnect)
  const urlRef = useRef(url)
  const headerRowsRef = useRef(headerRows)
  const subprotocolsRef = useRef(subprotocols)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectRef = useRef<() => Promise<void>>(async () => {})
  const listEndRef = useRef<HTMLDivElement | null>(null)

  autoReconnectRef.current = autoReconnect
  urlRef.current = url
  headerRowsRef.current = headerRows
  subprotocolsRef.current = subprotocols

  const appendMsg = useCallback((m: Omit<ChatMsg, 'id'>): void => {
    setMsgs((prev) => [...prev, { ...m, id: nextId++ }])
  }, [])

  const cancelReconnect = useCallback((): void => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  /** 保存最近连接（去重、最多 20 条） */
  const saveSession = useCallback(async (entry: SessionEntry): Promise<void> => {
    try {
      const raw = await workos.storage.get('sessions')
      const next = appendSession(parseSessions(raw), entry)
      setSessions(next)
      await workos.storage.set('sessions', JSON.stringify(next))
    } catch {
      // 存储不可用时静默降级（仅内存态）
    }
  }, [])

  /** 桥接事件回调：记录消息 + 自动重连判定 */
  const onBridgeMessage = useCallback(
    (e: WsMessageEvent): void => {
      if (sessionIdRef.current && e.sessionId !== sessionIdRef.current) return // 旧会话事件
      appendMsg({ sessionId: e.sessionId, dir: e.dir, data: e.data, binary: e.binary, ts: e.ts })
      // 自动重连：system 事件含「关闭/断开」，且非用户主动断开
      if (e.dir === 'system' && isCloseSystemEvent(e.data)) {
        sessionIdRef.current = null
        setStatus('disconnected')
        if (autoReconnectRef.current && !manualCloseRef.current) {
          setStatus('reconnecting')
          cancelReconnect()
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null
            void connectRef.current()
          }, 2000)
        }
      }
    },
    [appendMsg, cancelReconnect],
  )

  /** 建立连接（自动重连也走这里） */
  const connect = useCallback(async (): Promise<void> => {
    const u = urlRef.current.trim()
    if (!isWebSocketUrl(u)) {
      setError('地址需以 ws:// 或 wss:// 开头')
      return
    }
    setError('')
    cancelReconnect()
    manualCloseRef.current = false
    // 先清理旧会话，避免事件串流
    if (sessionIdRef.current) {
      const old = sessionIdRef.current
      sessionIdRef.current = null
      await workos.ws.close(old).catch(() => {})
    }
    setStatus('connecting')
    const headers = rowsToHeaders(headerRowsRef.current)
    const protos = parseSubprotocols(subprotocolsRef.current)
    try {
      const { sessionId } = await workos.ws.connect(u, { headers, subprotocols: protos }, onBridgeMessage)
      sessionIdRef.current = sessionId
      setStatus('connected')
      void saveSession({ url: u, headers, subprotocols: protos })
    } catch (e) {
      sessionIdRef.current = null
      setStatus('disconnected')
      appendMsg({ sessionId: '-', dir: 'system', data: `连接失败：${errMsg(e)}`, binary: false, ts: Date.now() })
    }
  }, [appendMsg, cancelReconnect, onBridgeMessage, saveSession])

  connectRef.current = connect

  /** 主动断开 */
  const disconnect = useCallback(async (): Promise<void> => {
    manualCloseRef.current = true
    cancelReconnect()
    setStatus('disconnected')
    if (sessionIdRef.current) {
      const sid = sessionIdRef.current
      sessionIdRef.current = null
      await workos.ws.close(sid).catch(() => {})
    }
  }, [cancelReconnect])

  /** 发送消息 */
  const send = useCallback(async (): Promise<void> => {
    const sid = sessionIdRef.current
    if (!sid || status !== 'connected') {
      setSendError('未连接，无法发送')
      return
    }
    setSendError('')
    try {
      if (sendKind === 'json') {
        const r = validateSendJson(sendText)
        if (!r.ok) {
          setSendError(`JSON 无效：${r.error}`)
          return
        }
        await workos.ws.send(sid, r.payload, false)
      } else if (sendKind === 'binary') {
        if (!sendText.trim()) {
          setSendError('请输入要发送的二进制内容（文本将以 UTF-8 base64 编码发送）')
          return
        }
        await workos.ws.send(sid, encodeBase64Utf8(sendText), true)
      } else {
        if (!sendText) {
          setSendError('发送内容不能为空')
          return
        }
        await workos.ws.send(sid, sendText, false)
      }
    } catch (e) {
      setSendError(`发送失败：${errMsg(e)}`)
    }
  }, [sendKind, sendText, status])

  // 挂载：读取最近连接 + 进入事件（websocket.connect / websocket.open）
  useEffect(() => {
    void workos.storage
      .get('sessions')
      .then((raw) => setSessions(parseSessions(raw)))
      .catch(() => {})

    const onEnter = (e: Event): void => {
      const detail = (e as CustomEvent<{ code: string; payload?: unknown }>).detail
      const p = detail?.payload
      if (typeof p === 'string' && isWebSocketUrl(p)) setUrl(p)
      if (detail?.code === 'websocket.connect') void connectRef.current()
    }
    window.addEventListener('workos-enter', onEnter)
    return () => {
      window.removeEventListener('workos-enter', onEnter)
      cancelReconnect()
      if (sessionIdRef.current) void workos.ws.close(sessionIdRef.current).catch(() => {})
    }
  }, [cancelReconnect])

  // 新消息自动滚动到底部
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length, keyword, dirFilter])

  const visible = useMemo(() => filterMessages(msgs, { keyword, dir: dirFilter }), [msgs, keyword, dirFilter])

  const connected = status === 'connected'
  const busy = status === 'connecting' || status === 'reconnecting'

  const fillFromSession = (s: SessionEntry): void => {
    if (connected || busy) return // 连接中不覆盖配置
    setUrl(s.url)
    setHeaderRows(headersToRows(s.headers))
    setSubprotocols(s.subprotocols.join(', '))
  }

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: 10 }}>
      {/* 顶部：地址 + 连接/断开 + 状态 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="wss://example.com/socket"
          spellCheck={false}
        />
        {connected || busy ? (
          <button className="btn danger" onClick={() => void disconnect()} disabled={status === 'connecting'}>
            断开
          </button>
        ) : (
          <button className="btn" onClick={() => void connect()}>
            连接
          </button>
        )}
        <span className={`badge ${connected ? 'ok' : ''}`}>{STATUS_TEXT[status]}</span>
      </div>
      {error && <div className="badge err">{error}</div>}

      {/* 高级选项（可折叠） */}
      <div className="panel">
        <button className="btn ghost collapse-head" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? '▾' : '▸'} 高级选项
        </button>
        {showAdvanced && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ color: 'var(--fg-dim)' }}>自定义 Headers</span>
              {headerRows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="Header 名称"
                    value={row.key}
                    spellCheck={false}
                    onChange={(e) => setHeaderRows((rows) => rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
                  />
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="值"
                    value={row.value}
                    spellCheck={false}
                    onChange={(e) => setHeaderRows((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                  />
                  <button
                    className="btn secondary"
                    style={{ padding: '0 8px' }}
                    onClick={() => setHeaderRows((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ key: '', value: '' }]))}
                  >
                    删
                  </button>
                </div>
              ))}
              <button className="btn secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setHeaderRows((rows) => [...rows, { key: '', value: '' }])}>
                + 添加 Header
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: 'var(--fg-dim)', flexShrink: 0 }}>Sub Protocol</span>
              <input
                className="input"
                style={{ flex: 1 }}
                value={subprotocols}
                onChange={(e) => setSubprotocols(e.target.value)}
                placeholder="多个用逗号分隔，如 chat, superchat"
                spellCheck={false}
              />
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={autoReconnect} onChange={(e) => setAutoReconnect(e.target.checked)} />
              <span>
                自动重连
                <span style={{ color: 'var(--fg-dim)' }}>（连接因「关闭/断开」断开后 2 秒自动重连）</span>
              </span>
            </label>
          </div>
        )}
      </div>

      {/* 最近连接 */}
      {sessions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--fg-dim)', flexShrink: 0 }}>最近连接</span>
          {sessions.slice(0, 6).map((s, i) => (
            <button key={`${s.url}-${i}`} className="chip" onClick={() => fillFromSession(s)} title={s.url}>
              {s.url}
            </button>
          ))}
        </div>
      )}

      {/* 工具条：搜索 / 方向过滤 / JSON Pretty / 清空 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="input" style={{ flex: 1 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索消息…" spellCheck={false} />
        <div className="tabs">
          {(
            [
              ['all', '全部'],
              ['in', '收'],
              ['out', '发'],
            ] as Array<[DirectionFilter, string]>
          ).map(([id, title]) => (
            <button key={id} className={`tab ${dirFilter === id ? 'active' : ''}`} onClick={() => setDirFilter(id)}>
              {title}
            </button>
          ))}
        </div>
        <label className="toggle-row" style={{ flexShrink: 0 }}>
          <input type="checkbox" checked={jsonPretty} onChange={(e) => setJsonPretty(e.target.checked)} />
          <span>JSON Pretty</span>
        </label>
        <button className="btn secondary" style={{ flexShrink: 0 }} onClick={() => setMsgs([])}>
          清空
        </button>
      </div>

      {/* 消息区 */}
      <div className="msg-list" data-selectable>
        {visible.length === 0 && <div style={{ color: 'var(--fg-dim)', padding: 8 }}>{msgs.length === 0 ? '暂无消息，连接后开始调试…' : '没有匹配的消息'}</div>}
        {visible.map((m) => (
          <div key={m.id} className={`msg-row ${m.dir}`}>
            <span className="msg-ts">{formatTimestamp(m.ts)}</span>
            <span className={`msg-dir ${m.dir}`}>{m.dir === 'out' ? '↑ 发送' : m.dir === 'in' ? '↓ 接收' : '⚙ 系统'}</span>
            <span className="msg-data">
              {displayMessage(m, jsonPretty)}
              {m.binary && <span className="badge" style={{ marginLeft: 6 }}>二进制</span>}
            </span>
          </div>
        ))}
        <div ref={listEndRef} />
      </div>

      {/* 发送区 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="tabs">
            {(
              [
                ['text', 'Text'],
                ['json', 'JSON'],
                ['binary', 'Binary'],
              ] as Array<[SendKind, string]>
            ).map(([id, title]) => (
              <button key={id} className={`tab ${sendKind === id ? 'active' : ''}`} onClick={() => setSendKind(id)}>
                {title}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => void send()} disabled={!connected}>
            发送
          </button>
        </div>
        <textarea
          className="editor"
          style={{ height: 64 }}
          value={sendText}
          onChange={(e) => setSendText(e.target.value)}
          spellCheck={false}
          data-selectable
          placeholder={sendKind === 'json' ? '输入 JSON，发送时自动校验并格式化…' : sendKind === 'binary' ? '输入文本，发送时以 UTF-8 base64 二进制发出…' : '输入要发送的文本…'}
        />
        {sendError && <div className="badge err">{sendError}</div>}
      </div>
    </div>
  )
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
