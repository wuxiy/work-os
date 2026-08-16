import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { body, type HttpBody, type HttpResponse } from '@work-os/plugin-sdk'
import { workos } from './main'
import {
  HTTP_METHODS,
  addCollection,
  addChild,
  bytesToBase64,
  emptyRequest,
  findNode,
  formatSize,
  moveNode,
  parseCurl,
  prettyBody,
  removeNode,
  renameNode,
  resolveRequest,
  toCurl,
  updateRequest,
  type CollectionNode,
  type ContainerNode,
  type FolderNode,
  type HttpMethod,
  type KV,
  type ParsedRequest,
  type RequestNode,
  type RequestSpec,
  type WorkspaceTree,
} from './features'

// ---------- 常量与工具 ----------

const STORAGE_WS = 'workspace'
const STORAGE_ENV = 'environments'
const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'var(--success)',
  POST: '#e8a33d',
  PUT: '#5aa9e6',
  PATCH: '#b07ce8',
  DELETE: 'var(--danger)',
  HEAD: 'var(--fg-dim)',
  OPTIONS: 'var(--fg-dim)',
}

const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const DEFAULT_ENVS: Record<string, Record<string, string>> = {
  dev: { baseUrl: 'http://localhost:3000' },
  test: {},
  prod: {},
}

function seedWorkspace(): WorkspaceTree {
  const list: RequestNode = { id: uid(), kind: 'request', name: '获取用户列表', request: { ...emptyRequest(), url: '{{baseUrl}}/users', query: [{ key: 'page', value: '1', enabled: true }] } }
  const login: RequestNode = { id: uid(), kind: 'request', name: '登录', request: { ...emptyRequest(), method: 'POST', url: '{{baseUrl}}/login', bodyType: 'json', bodyText: '{"user":"demo","password":"123456"}' } }
  const folder: FolderNode = { id: uid(), kind: 'folder', name: '认证', children: [login] }
  const col: CollectionNode = { id: uid(), kind: 'collection', name: '示例集合', children: [list, folder] }
  return { collections: [col] }
}

/** 找节点的最近容器祖先（集合或文件夹）id */
function parentContainerId(ws: WorkspaceTree, id: string): string | null {
  const find = (node: ContainerNode): string | null => {
    for (const ch of node.children) {
      if (ch.id === id) return node.id
      if (ch.kind === 'folder') {
        const hit = find(ch)
        if (hit) return hit
      }
    }
    return null
  }
  for (const c of ws.collections) {
    if (c.id === id) return c.id
    const hit = find(c)
    if (hit) return hit
  }
  return null
}

function firstRequestId(ws: WorkspaceTree): string | null {
  for (const c of ws.collections) {
    for (const ch of c.children) {
      if (ch.kind === 'request') return ch.id
      if (ch.kind === 'folder') {
        const hit = ch.children.find((x) => x.kind === 'request')
        if (hit) return hit.id
      }
    }
  }
  return null
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}` || '/'
  } catch {
    return url
  }
}

interface HistoryItem {
  id: string
  ts: number
  method: HttpMethod
  url: string
  status: number
  timeMs: number
  spec: RequestSpec
}

// ---------- 键值行编辑器 ----------

function KVTable({ rows, onChange, keyPh, valPh }: { rows: KV[]; onChange: (rows: KV[]) => void; keyPh: string; valPh: string }) {
  const set = (i: number, patch: Partial<KV>): void => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div>
      <div className="kv-head">
        <span />
        <span>键</span>
        <span>值</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div className="kv-grid" key={i}>
          <input type="checkbox" checked={r.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} title="启用/禁用" />
          <input className="input" style={{ height: 26 }} value={r.key} placeholder={keyPh} onChange={(e) => set(i, { key: e.target.value })} data-selectable spellCheck={false} />
          <input className="input" style={{ height: 26 }} value={r.value} placeholder={valPh} onChange={(e) => set(i, { value: e.target.value })} data-selectable spellCheck={false} />
          <button className="icon-btn" title="删除行" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn secondary" style={{ height: 24 }} onClick={() => onChange([...rows, { key: '', value: '', enabled: true }])}>
        ＋ 添加
      </button>
    </div>
  )
}

// ---------- 主组件 ----------

type TabId = 'query' | 'path' | 'headers' | 'cookies' | 'body'

export function App() {
  const [ws, setWs] = useState<WorkspaceTree>(seedWorkspace)
  const [selId, setSelId] = useState<string | null>(null)
  const [envs, setEnvs] = useState<Record<string, Record<string, string>>>(DEFAULT_ENVS)
  const [envName, setEnvName] = useState('dev')
  const [envOpen, setEnvOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('query')
  const [res, setRes] = useState<HttpResponse | null>(null)
  const [resTab, setResTab] = useState<'body' | 'headers'>('body')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)

  const sel = selId ? findNode(ws, selId) : null
  const spec = sel && sel.kind === 'request' ? sel.request : null
  const vars = envs[envName] ?? {}
  const resolved = useMemo(() => (spec ? resolveRequest(spec, vars) : null), [spec, vars])

  // 恢复持久化数据（workspace / environments），完成后开始自动保存
  useEffect(() => {
    let alive = true
    void (async () => {
      const [wRaw, eRaw] = await Promise.all([workos.storage.get(STORAGE_WS), workos.storage.get(STORAGE_ENV)])
      if (!alive) return
      if (wRaw) {
        try {
          const parsed = JSON.parse(wRaw) as WorkspaceTree
          if (parsed && Array.isArray(parsed.collections)) setWs(parsed)
        } catch {
          /* 损坏数据回落到种子 */
        }
      }
      if (eRaw) {
        try {
          const parsed = JSON.parse(eRaw) as Record<string, Record<string, string>>
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) setEnvs(parsed)
        } catch {
          /* 忽略 */
        }
      }
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // 恢复后默认选中第一个请求
  useEffect(() => {
    if (loaded && !selId) setSelId(firstRequestId(ws))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // 变更即保存
  useEffect(() => {
    if (loaded) void workos.storage.set(STORAGE_WS, JSON.stringify(ws)).catch(() => {})
  }, [ws, loaded])
  useEffect(() => {
    if (loaded) void workos.storage.set(STORAGE_ENV, JSON.stringify(envs)).catch(() => {})
  }, [envs, loaded])

  const patchSpec = useCallback(
    (patch: Partial<RequestSpec>) => {
      setWs((w) => (selId ? updateRequest(w, selId, patch) : w))
    },
    [selId],
  )

  const patchAuth = (patch: Partial<RequestSpec['auth']>): void => {
    if (spec) patchSpec({ auth: { ...spec.auth, ...patch } })
  }

  // ---------- 树操作 ----------

  const newCollection = (): void => {
    const col: CollectionNode = { id: uid(), kind: 'collection', name: '新集合', children: [] }
    setWs((w) => addCollection(w, col))
  }

  const newChild = (parentId: string, kind: 'folder' | 'request'): void => {
    const node: FolderNode | RequestNode =
      kind === 'folder'
        ? { id: uid(), kind: 'folder', name: '新文件夹', children: [] }
        : { id: uid(), kind: 'request', name: '新请求', request: emptyRequest() }
    setWs((w) => addChild(w, parentId, node))
    if (kind === 'request') setSelId(node.id)
    setCollapsed((s) => {
      const n = new Set(s)
      n.delete(parentId)
      return n
    })
  }

  /** 新建请求：落在当前选中节点所在容器，否则第一个集合，否则新建集合 */
  const createRequest = useCallback(
    (init?: RequestSpec): void => {
      setWs((w) => {
        const target = (selId ? parentContainerId(w, selId) : null) ?? w.collections[0]?.id ?? null
        const node: RequestNode = { id: uid(), kind: 'request', name: init ? `${init.method} ${shortUrl(init.url)}` : '新请求', request: init ?? emptyRequest() }
        let next = w
        let containerId = target
        if (!containerId) {
          const col: CollectionNode = { id: uid(), kind: 'collection', name: '默认集合', children: [] }
          next = addCollection(w, col)
          containerId = col.id
        }
        setSelId(node.id)
        return addChild(next, containerId, node)
      })
    },
    [selId],
  )

  const commitRename = (): void => {
    if (editing) setWs((w) => renameNode(w, editing.id, editing.draft.trim() || '未命名'))
    setEditing(null)
  }

  // ---------- 发送 / cURL ----------

  const send = useCallback(async (): Promise<void> => {
    if (!spec || !resolved) return
    setSending(true)
    setErr('')
    setRes(null)
    try {
      const headers = { ...resolved.headers }
      const b = resolved.body
      let httpBody: HttpBody
      if (b.kind === 'empty') httpBody = body.empty()
      else if (b.kind === 'binary_b64') httpBody = body.binary(b.content)
      else if (b.kind === 'json') {
        try {
          const v: unknown = JSON.parse(b.content)
          // 默认 application/json 时交给宿主 json kind 补 content-type，避免重复头
          const ctKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type')
          if (ctKey && headers[ctKey] === 'application/json') delete headers[ctKey]
          httpBody = body.json(v)
        } catch {
          httpBody = body.text(b.content)
        }
      } else httpBody = body.text(b.content)

      const r = await workos.http.request({ method: resolved.method, url: resolved.url, headers, body: httpBody, timeoutMs: 15000 })
      setRes(r)
      setHistory((h) => [{ id: uid(), ts: Date.now(), method: resolved.method, url: resolved.url, status: r.status, timeMs: r.timeMs, spec: { ...spec } }, ...h].slice(0, 20))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }, [spec, resolved])

  const doImport = (): void => {
    const p = parseCurl(importText)
    if (!p.url) {
      setErr('未能从 cURL 命令中解析出 URL')
      return
    }
    const ct = Object.entries(p.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? ''
    let specFrom: RequestSpec = { ...emptyRequest(), method: p.method, url: p.url, headers: Object.entries(p.headers).map(([key, value]) => ({ key, value, enabled: true })) }
    if (p.body !== null) {
      if (ct.includes('json')) {
        specFrom = { ...specFrom, bodyType: 'json', bodyText: p.body }
      } else if (ct.includes('x-www-form-urlencoded')) {
        specFrom = { ...specFrom, bodyType: 'urlencoded', bodyForm: [...new URLSearchParams(p.body).entries()].map(([key, value]) => ({ key, value, enabled: true })) }
      } else {
        specFrom = { ...specFrom, bodyType: 'text', bodyText: p.body }
      }
    }
    if (p.auth) specFrom = { ...specFrom, auth: { ...specFrom.auth, type: 'basic', basicUser: p.auth.user, basicPassword: p.auth.password } }
    createRequest(specFrom)
    setShowImport(false)
    setImportText('')
    setErr('')
  }

  const copyCurl = async (): Promise<void> => {
    if (!resolved) return
    const p: ParsedRequest = {
      method: resolved.method,
      url: resolved.url,
      headers: resolved.headers,
      body: resolved.body.kind === 'empty' ? null : resolved.body.content,
    }
    await workos.clipboard.writeText(toCurl(p))
  }

  const loadHistory = (item: HistoryItem): void => {
    if (selId) patchSpec(item.spec)
    else createRequest(item.spec)
  }

  // 进入事件：http.new 新建请求；http.open 聚焦（携带 curl 文本则直接进入导入）
  useEffect(() => {
    const onEnter = (e: Event): void => {
      const detail = (e as CustomEvent<{ code: string; payload?: unknown }>).detail
      if (detail?.code === 'http.new') createRequest()
      else if (detail?.code === 'http.open') {
        const p = detail.payload
        if (typeof p === 'string' && p.trim().startsWith('curl')) {
          setImportText(p)
          setShowImport(true)
        }
        urlRef.current?.focus()
      }
    }
    window.addEventListener('workos-enter', onEnter)
    return () => window.removeEventListener('workos-enter', onEnter)
  }, [createRequest])

  // ---------- 树渲染（含拖拽移动） ----------

  const renderRow = (node: CollectionNode | FolderNode | RequestNode, depth: number): ReactNode => {
    const isContainer = node.kind !== 'request'
    const isSel = node.id === selId
    const open = !collapsed.has(node.id)
    const method = node.kind === 'request' ? node.request.method : null
    return (
      <div key={node.id}>
        <div
          className={`tree-row ${isSel ? 'sel' : ''}`}
          draggable={node.kind !== 'collection'}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/workos-node', node.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (isContainer) e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            const dragId = e.dataTransfer.getData('text/workos-node')
            if (dragId) setWs((w) => moveNode(w, dragId, node.id))
          }}
        >
          <span style={{ width: depth * 12, flexShrink: 0 }} />
          {isContainer ? (
            <span
              className="icon-btn"
              style={{ width: 14 }}
              onClick={(e) => {
                e.stopPropagation()
                setCollapsed((s) => {
                  const n = new Set(s)
                  if (n.has(node.id)) n.delete(node.id)
                  else n.add(node.id)
                  return n
                })
              }}
            >
              {open ? '▾' : '▸'}
            </span>
          ) : (
            <span style={{ width: 14, color: METHOD_COLORS[method ?? 'GET'], fontSize: 9, textAlign: 'center' }}>●</span>
          )}
          {editing?.id === node.id ? (
            <input
              className="input"
              style={{ height: 22, fontSize: 12, padding: '0 4px' }}
              value={editing.draft}
              autoFocus
              onChange={(e) => setEditing({ id: node.id, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditing(null)
              }}
              onBlur={commitRename}
              data-selectable
            />
          ) : (
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: node.kind === 'request' && method ? METHOD_COLORS[method] : undefined }}
              onClick={() => setSelId(node.id)}
            >
              {node.name}
            </span>
          )}
          <span className="tree-actions">
            {isContainer && (
              <>
                <button className="icon-btn" title="新建请求" onClick={() => newChild(node.id, 'request')}>
                  ＋
                </button>
                <button className="icon-btn" title="新建文件夹" onClick={() => newChild(node.id, 'folder')}>
                  ▤
                </button>
              </>
            )}
            <button className="icon-btn" title="重命名" onClick={() => setEditing({ id: node.id, draft: node.name })}>
              ✎
            </button>
            <button
              className="icon-btn"
              title="删除"
              onClick={() => {
                if (node.id === selId) setSelId(null)
                setWs((w) => removeNode(w, node.id))
              }}
            >
              ✕
            </button>
          </span>
        </div>
        {isContainer && open && <div>{node.children.map((ch) => renderRow(ch, depth + 1))}</div>}
      </div>
    )
  }

  // ---------- 渲染 ----------

  const tabs: Array<{ id: TabId; title: string; count: number }> = [
    { id: 'query', title: 'Query Params', count: spec?.query.filter((q) => q.enabled && q.key).length ?? 0 },
    { id: 'path', title: 'Path Variables', count: spec?.pathVars.filter((q) => q.enabled && q.key).length ?? 0 },
    { id: 'headers', title: 'Headers', count: spec?.headers.filter((q) => q.enabled && q.key).length ?? 0 },
    { id: 'cookies', title: 'Cookies', count: spec?.cookies.filter((q) => q.enabled && q.key).length ?? 0 },
    { id: 'body', title: 'Body', count: spec && spec.bodyType !== 'none' ? 1 : 0 },
  ]

  const statusOk = res !== null && res.status >= 200 && res.status < 400

  return (
    <div className="app" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flex: 1, gap: 6, minHeight: 0 }}>
        {/* 左栏：Collection 树 */}
        <div className="panel" style={{ width: 215, flexShrink: 0 }}>
          <div className="panel-head">
            Collections
            <span style={{ flex: 1 }} />
            <button className="icon-btn" title="新建 Collection" onClick={newCollection}>
              ＋
            </button>
          </div>
          <div className="panel-body" style={{ padding: 4 }}>
            {ws.collections.map((c) => renderRow(c, 0))}
            {!ws.collections.length && <div className="dim">暂无集合，点击 ＋ 新建</div>}
          </div>
        </div>

        {/* 中栏：请求编辑器 */}
        <div className="panel" style={{ flex: 1.15 }}>
          <div className="panel-head">
            {spec && sel && sel.kind === 'request' ? (
              <input className="input" style={{ flex: 1, height: 24 }} value={sel.name} onChange={(e) => selId && setWs((w) => renameNode(w, selId, e.target.value))} data-selectable />
            ) : (
              <span>请求编辑器</span>
            )}
            <select className="input" style={{ width: 90, height: 24 }} value={envName} onChange={(e) => setEnvName(e.target.value)} title="环境">
              {Object.keys(envs).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button className="btn secondary" style={{ height: 24 }} onClick={() => setEnvOpen((v) => !v)}>
              环境变量
            </button>
          </div>

          {envOpen && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
              <KVTable
                rows={Object.entries(vars).map(([key, value]) => ({ key, value, enabled: true }))}
                onChange={(rows) =>
                  setEnvs((all) => {
                    const next: Record<string, string> = {}
                    for (const r of rows) if (r.key) next[r.key] = r.value
                    return { ...all, [envName]: next }
                  })
                }
                keyPh="baseUrl"
                valPh="http://localhost:3000"
              />
            </div>
          )}

          {spec && resolved ? (
            <>
              <div style={{ display: 'flex', padding: '8px 8px 0' }}>
                <select
                  className="m-input"
                  style={{ color: METHOD_COLORS[spec.method], width: 86, flexShrink: 0 }}
                  value={spec.method}
                  onChange={(e) => patchSpec({ method: e.target.value as HttpMethod })}
                >
                  {HTTP_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  ref={urlRef}
                  className="input"
                  style={{ flex: 1, borderRadius: '0 6px 6px 0' }}
                  value={spec.url}
                  placeholder="https://api.example.com/users/:id?page={{page}}"
                  onChange={(e) => patchSpec({ url: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && void send()}
                  data-selectable
                  spellCheck={false}
                />
                <button className="btn" style={{ marginLeft: 6 }} onClick={() => void send()} disabled={sending}>
                  {sending ? '发送中…' : '发送'}
                </button>
              </div>
              <div className="dim" style={{ padding: '3px 8px 0', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {resolved.url || '（空 URL）'}
                {resolved.missing.length > 0 && (
                  <span className="badge err" style={{ marginLeft: 6 }}>
                    未定义变量：{resolved.missing.join(', ')}
                  </span>
                )}
              </div>

              {/* Auth 区 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 0', flexWrap: 'wrap' }}>
                <span className="dim">认证</span>
                <select className="input" style={{ width: 100, height: 24 }} value={spec.auth.type} onChange={(e) => patchAuth({ type: e.target.value as RequestSpec['auth']['type'] })}>
                  <option value="none">无</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic Auth</option>
                  <option value="apikey">API Key</option>
                </select>
                {spec.auth.type === 'bearer' && (
                  <input className="input" style={{ flex: 1, height: 24 }} placeholder="Token（支持 {{var}}）" value={spec.auth.bearerToken} onChange={(e) => patchAuth({ bearerToken: e.target.value })} data-selectable spellCheck={false} />
                )}
                {spec.auth.type === 'basic' && (
                  <>
                    <input className="input" style={{ flex: 1, height: 24 }} placeholder="用户名" value={spec.auth.basicUser} onChange={(e) => patchAuth({ basicUser: e.target.value })} data-selectable />
                    <input className="input" style={{ flex: 1, height: 24 }} type="password" placeholder="密码" value={spec.auth.basicPassword} onChange={(e) => patchAuth({ basicPassword: e.target.value })} />
                  </>
                )}
                {spec.auth.type === 'apikey' && (
                  <>
                    <input className="input" style={{ width: 140, height: 24 }} placeholder="Header 名（X-API-Key）" value={spec.auth.apiKeyName} onChange={(e) => patchAuth({ apiKeyName: e.target.value })} data-selectable />
                    <input className="input" style={{ flex: 1, height: 24 }} placeholder="值（支持 {{var}}）" value={spec.auth.apiKeyValue} onChange={(e) => patchAuth({ apiKeyValue: e.target.value })} data-selectable spellCheck={false} />
                  </>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 8px 0' }}>
                <div className="tabs" style={{ flex: 1 }}>
                  {tabs.map((t) => (
                    <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                      {t.title}
                      {t.count > 0 ? ` (${t.count})` : ''}
                    </button>
                  ))}
                </div>
                <button className="btn secondary" style={{ height: 24 }} onClick={() => void copyCurl()}>
                  复制 cURL
                </button>
                <button className="btn secondary" style={{ height: 24 }} onClick={() => setShowImport(true)}>
                  导入 cURL
                </button>
              </div>

              <div className="panel-body">
                {tab === 'query' && <KVTable rows={spec.query} onChange={(rows) => patchSpec({ query: rows })} keyPh="page" valPh="1" />}
                {tab === 'path' && <KVTable rows={spec.pathVars} onChange={(rows) => patchSpec({ pathVars: rows })} keyPh="id" valPh="42" />}
                {tab === 'headers' && <KVTable rows={spec.headers} onChange={(rows) => patchSpec({ headers: rows })} keyPh="Content-Type" valPh="application/json" />}
                {tab === 'cookies' && <KVTable rows={spec.cookies} onChange={(rows) => patchSpec({ cookies: rows })} keyPh="session" valPh="abc123" />}
                {tab === 'body' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
                    <select className="input" style={{ width: 210, height: 24 }} value={spec.bodyType} onChange={(e) => patchSpec({ bodyType: e.target.value as RequestSpec['bodyType'] })}>
                      <option value="none">none</option>
                      <option value="json">JSON</option>
                      <option value="text">Text</option>
                      <option value="form">Form Data (multipart)</option>
                      <option value="urlencoded">x-www-form-urlencoded</option>
                      <option value="binary">Binary（文件）</option>
                    </select>
                    {(spec.bodyType === 'json' || spec.bodyType === 'text') && (
                      <textarea
                        className="editor"
                        style={{ flex: 1, minHeight: 80 }}
                        value={spec.bodyText}
                        onChange={(e) => patchSpec({ bodyText: e.target.value })}
                        placeholder={spec.bodyType === 'json' ? '{"key": "value"}' : '原始文本'}
                        data-selectable
                        spellCheck={false}
                      />
                    )}
                    {(spec.bodyType === 'form' || spec.bodyType === 'urlencoded') && (
                      <KVTable rows={spec.bodyForm} onChange={(rows) => patchSpec({ bodyForm: rows })} keyPh="field" valPh="value" />
                    )}
                    {spec.bodyType === 'binary' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="file"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            void f.arrayBuffer().then((buf) => patchSpec({ bodyB64: bytesToBase64(new Uint8Array(buf)), bodyFileName: f.name }))
                          }}
                        />
                        {spec.bodyB64 && <span className="badge ok">已加载 {spec.bodyFileName}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="dim">在左侧选择或新建一个请求</span>
            </div>
          )}
        </div>

        {/* 右栏：响应面板 */}
        <div className="panel" style={{ flex: 1 }}>
          <div className="panel-head">
            响应
            {res && (
              <>
                <span className={`badge ${statusOk ? 'ok' : 'err'}`}>
                  {res.status} {res.statusText}
                </span>
                <span className="dim">
                  {res.timeMs} ms · {formatSize(res.sizeBytes)}
                </span>
              </>
            )}
            <span style={{ flex: 1 }} />
            <div className="tabs">
              <button className={`tab ${resTab === 'body' ? 'active' : ''}`} onClick={() => setResTab('body')}>
                Body
              </button>
              <button className={`tab ${resTab === 'headers' ? 'active' : ''}`} onClick={() => setResTab('headers')}>
                响应头
              </button>
            </div>
          </div>
          <div className="panel-body">
            {err && <div className="badge err">{err}</div>}
            {!err && !res && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <span className="dim">尚未发送请求</span>
              </div>
            )}
            {res && resTab === 'body' && (
              <pre className="mono-pre" data-selectable>
                {res.bodyText !== null ? prettyBody(res.bodyText) : `（二进制响应 ${formatSize(res.sizeBytes)}，base64 已省略）`}
              </pre>
            )}
            {res && resTab === 'headers' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {Object.entries(res.headers).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: '2px 8px 2px 0', color: 'var(--fg-dim)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
                      <td style={{ padding: '2px 0', userSelect: 'text', wordBreak: 'break-all' }} data-selectable>
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 底部历史（内存，核心历史由宿主 http_history 记录） */}
      <div className="panel" style={{ height: 84, flexShrink: 0 }}>
        <div className="panel-head">
          最近请求（内存，点击载入到当前请求）
          <span style={{ flex: 1 }} />
          {history.length > 0 && (
            <button className="icon-btn" title="清空" onClick={() => setHistory([])}>
              清空
            </button>
          )}
        </div>
        <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start', padding: 6 }}>
          {history.map((h) => (
            <span key={h.id} className="hist-item" onClick={() => loadHistory(h)} title={h.url}>
              <b style={{ color: METHOD_COLORS[h.method] }}>{h.method}</b>
              <span>{h.url.length > 52 ? `${h.url.slice(0, 52)}…` : h.url}</span>
              <span className={`badge ${h.status >= 200 && h.status < 400 ? 'ok' : 'err'}`}>{h.status}</span>
              <span className="dim">{h.timeMs}ms</span>
            </span>
          ))}
          {!history.length && <span className="dim">暂无记录</span>}
        </div>
      </div>

      {/* 导入 cURL 弹层 */}
      {showImport && (
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
          onClick={() => setShowImport(false)}
        >
          <div className="panel" style={{ width: '72%' }} onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">导入 cURL（粘贴完整命令）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
              <textarea
                className="editor"
                style={{ height: 130 }}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`curl -X POST 'http://localhost:8080/echo' -H 'Content-Type: application/json' -d '{"a":1}'`}
                data-selectable
                spellCheck={false}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn secondary" onClick={() => setShowImport(false)}>
                  取消
                </button>
                <button className="btn" onClick={doImport}>
                  导入为请求
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
