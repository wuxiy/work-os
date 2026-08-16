/** API Client 核心功能（纯函数，验收 H1–H8 的测试目标）：cURL 解析/导出、模板变量、Collection 树、请求组装 */

// ---------- 通用类型 ----------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export type BodyType = 'none' | 'json' | 'text' | 'form' | 'urlencoded' | 'binary'

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey'

/** 键值行（Query/Path/Headers/Cookies/Form 通用） */
export interface KV {
  key: string
  value: string
  enabled: boolean
}

export interface AuthConfig {
  type: AuthType
  bearerToken: string
  basicUser: string
  basicPassword: string
  apiKeyName: string
  apiKeyValue: string
}

/** 请求编辑器完整模型（持久化单元） */
export interface RequestSpec {
  method: HttpMethod
  url: string
  query: KV[]
  pathVars: KV[]
  headers: KV[]
  cookies: KV[]
  bodyType: BodyType
  bodyText: string
  bodyForm: KV[]
  bodyB64: string
  bodyFileName: string
  auth: AuthConfig
}

export function emptyRequest(): RequestSpec {
  return {
    method: 'GET',
    url: '',
    query: [],
    pathVars: [],
    headers: [],
    cookies: [],
    bodyType: 'none',
    bodyText: '',
    bodyForm: [],
    bodyB64: '',
    bodyFileName: '',
    auth: { type: 'none', bearerToken: '', basicUser: '', basicPassword: '', apiKeyName: 'X-API-Key', apiKeyValue: '' },
  }
}

// ---------- cURL 解析 / 导出 ----------

/** parseCurl 的产物（语义模型，与编辑器 RequestSpec 互转） */
export interface ParsedRequest {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body: string | null
  auth?: { user: string; password: string }
}

/** shell 风格分词：单引号（字面量）、双引号（\" \\ 转义）、反斜杠转义、行尾续行 */
export function tokenizeShell(cmd: string): string[] {
  const tokens: string[] = []
  let cur = ''
  let has = false
  let i = 0
  const s = cmd.replace(/\\\r?\n/g, ' ') // Unix 续行
  const at = (n: number): string => s.charAt(n)
  while (i < s.length) {
    const c = at(i)
    if (c === "'") {
      i += 1
      while (i < s.length && at(i) !== "'") cur += at(i++)
      i += 1
      has = true
    } else if (c === '"') {
      i += 1
      while (i < s.length && at(i) !== '"') {
        const n = at(i + 1)
        if (at(i) === '\\' && (n === '"' || n === '\\' || n === '$' || n === '`')) {
          cur += n
          i += 2
        } else {
          cur += at(i++)
        }
      }
      i += 1
      has = true
    } else if (c === '\\' && i + 1 < s.length) {
      cur += at(i + 1)
      i += 2
      has = true
    } else if (/\s/.test(c)) {
      if (has) tokens.push(cur)
      cur = ''
      has = false
      i += 1
    } else {
      cur += c
      i += 1
      has = true
    }
  }
  if (has) tokens.push(cur)
  return tokens
}

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-ascii', '--data-binary'])
const HEADER_FLAGS = new Set(['-H', '--header'])
const METHOD_FLAGS = new Set(['-X', '--request'])
/** 无值开关（解析时吞掉即可） */
const BOOL_FLAGS = new Set(['-k', '--insecure', '-L', '--location', '-s', '--silent', '-v', '--verbose', '--compressed', '-i', '--include', '-f', '--fail', '-G', '--get'])

/** 解析 curl 命令：支持 -X/--request、-H/--header、-d/--data/--data-raw、-u/--user，及 `=` 与粘连形式 */
export function parseCurl(cmd: string): ParsedRequest {
  const tokens = tokenizeShell(cmd.trim())
  let method: HttpMethod | null = null
  let url = ''
  const headers: Record<string, string> = {}
  const dataList: string[] = []
  let auth: { user: string; password: string } | undefined

  const asMethod = (m: string): HttpMethod | null => {
    const u = m.toUpperCase()
    return (HTTP_METHODS as string[]).includes(u) ? (u as HttpMethod) : null
  }

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i] as string
    if (t === 'curl' && i === 0) {
      i += 1
      continue
    }
    if (!t.startsWith('-')) {
      // 位置参数即 URL（取第一个）
      if (!url) url = t
      i += 1
      continue
    }
    // 拆分 `--flag=value` 与 `-XPOST` 粘连形式
    let flag = t
    let val: string | null = null
    const eq = t.indexOf('=')
    if (t.startsWith('--') && eq !== -1) {
      flag = t.slice(0, eq)
      val = t.slice(eq + 1)
    } else if (/^-X[A-Za-z]+$/.test(t)) {
      flag = '-X'
      val = t.slice(2)
    }
    if (METHOD_FLAGS.has(flag)) {
      const m = val ?? tokens[++i] ?? ''
      method = asMethod(m) ?? method
      i += 1
      continue
    }
    if (HEADER_FLAGS.has(flag)) {
      const h = val ?? tokens[++i] ?? ''
      const idx = h.indexOf(':')
      if (idx > 0) {
        const k = h.slice(0, idx).trim()
        const v = h.slice(idx + 1).trim()
        if (v === '' && h.trimEnd().endsWith(';')) headers[k] = '' // `K;` 表示传空值头
        else headers[k] = v
      }
      i += 1
      continue
    }
    if (DATA_FLAGS.has(flag)) {
      const d = val ?? tokens[++i] ?? ''
      if (d) dataList.push(d)
      i += 1
      continue
    }
    if (flag === '-u' || flag === '--user') {
      const u = val ?? tokens[++i] ?? ''
      const idx = u.indexOf(':')
      auth = { user: idx === -1 ? u : u.slice(0, idx), password: idx === -1 ? '' : u.slice(idx + 1) }
      i += 1
      continue
    }
    if (BOOL_FLAGS.has(flag)) {
      i += 1
      continue
    }
    // 未知旗标：按单 token 吞掉，避免误当作 URL
    i += 1
  }

  const body = dataList.length ? dataList.join('&') : null
  return {
    method: method ?? (body !== null ? 'POST' : 'GET'),
    url,
    headers,
    body,
    auth,
  }
}

/** 单引号安全包裹 */
function shQuote(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`
}

/** 导出语义等价的 curl 命令 */
export function toCurl(req: ParsedRequest): string {
  const parts = ['curl', '-X', req.method, shQuote(req.url)]
  for (const [k, v] of Object.entries(req.headers)) parts.push('-H', shQuote(v === '' ? `${k};` : `${k}: ${v}`))
  if (req.auth) parts.push('-u', shQuote(req.auth.password ? `${req.auth.user}:${req.auth.password}` : req.auth.user))
  if (req.body !== null && req.body !== '') parts.push('--data-raw', shQuote(req.body))
  return parts.join(' ')
}

// ---------- 模板变量 ----------

const VAR_RE = /\{\{\s*([\w.$-]+)\s*\}\}/g

/** 渲染 `{{var}}`；未定义变量原样保留并收集（去重、按首次出现排序） */
export function renderTemplate(text: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = []
  const out = text.replace(VAR_RE, (raw, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name] as string
    if (!missing.includes(name)) missing.push(name)
    return raw
  })
  return { text: out, missing }
}

// ---------- Collection 树（Workspace → Collection → Folder* → Request） ----------

export interface RequestNode {
  id: string
  kind: 'request'
  name: string
  request: RequestSpec
}

export interface FolderNode {
  id: string
  kind: 'folder'
  name: string
  children: Array<FolderNode | RequestNode>
}

export interface CollectionNode {
  id: string
  kind: 'collection'
  name: string
  children: Array<FolderNode | RequestNode>
}

export interface WorkspaceTree {
  collections: CollectionNode[]
}

export type AnyNode = CollectionNode | FolderNode | RequestNode
export type ContainerNode = CollectionNode | FolderNode

/** 深拷贝树（操作函数一律返回新对象，不改入参） */
function cloneTree(ws: WorkspaceTree): WorkspaceTree {
  return JSON.parse(JSON.stringify(ws)) as WorkspaceTree
}

export function findNode(ws: WorkspaceTree, id: string): AnyNode | null {
  for (const c of ws.collections) {
    if (c.id === id) return c
    const hit = findInContainer(c, id)
    if (hit) return hit
  }
  return null
}

function findInContainer(node: ContainerNode, id: string): FolderNode | RequestNode | null {
  for (const ch of node.children) {
    if (ch.id === id) return ch
    if (ch.kind === 'folder') {
      const hit = findInContainer(ch, id)
      if (hit) return hit
    }
  }
  return null
}

function findContainer(ws: WorkspaceTree, id: string): ContainerNode | null {
  for (const c of ws.collections) {
    if (c.id === id) return c
    const hit = findInContainer(c, id)
    if (hit && hit.kind === 'folder') return hit
  }
  return null
}

/** 是否为节点的后代（用于阻止把父级移入自己的子树） */
export function isDescendant(ws: WorkspaceTree, ancestorId: string, nodeId: string): boolean {
  const anc = findNode(ws, ancestorId)
  if (!anc || anc.kind === 'request') return false
  const stack: Array<FolderNode | RequestNode> = [...anc.children]
  while (stack.length) {
    const n = stack.pop() as FolderNode | RequestNode
    if (n.id === nodeId) return true
    if (n.kind === 'folder') stack.push(...n.children)
  }
  return false
}

/** 新建 Collection（顶层） */
export function addCollection(ws: WorkspaceTree, node: CollectionNode): WorkspaceTree {
  const next = cloneTree(ws)
  next.collections.push(node)
  return next
}

/** 向 Collection/Folder 内新增 Folder 或 Request */
export function addChild(ws: WorkspaceTree, parentId: string, node: FolderNode | RequestNode): WorkspaceTree {
  const next = cloneTree(ws)
  const parent = findContainer(next, parentId)
  if (!parent) return ws
  parent.children.push(node)
  return next
}

/** 重命名任意节点 */
export function renameNode(ws: WorkspaceTree, id: string, name: string): WorkspaceTree {
  const next = cloneTree(ws)
  const n = findNode(next, id)
  if (!n) return ws
  n.name = name
  return next
}

/** 删除节点（Collection 删除整棵子树） */
export function removeNode(ws: WorkspaceTree, id: string): WorkspaceTree {
  const next = cloneTree(ws)
  const idx = next.collections.findIndex((c) => c.id === id)
  if (idx !== -1) {
    next.collections.splice(idx, 1)
    return next
  }
  const removeFrom = (node: ContainerNode): boolean => {
    const i = node.children.findIndex((c) => c.id === id)
    if (i !== -1) {
      node.children.splice(i, 1)
      return true
    }
    return node.children.some((c) => c.kind === 'folder' && removeFrom(c))
  }
  for (const c of next.collections) if (removeFrom(c)) break
  return next
}

/** 移动节点到目标容器（拒绝移动到自身或自己的后代） */
export function moveNode(ws: WorkspaceTree, id: string, targetId: string): WorkspaceTree {
  const node = findNode(ws, id)
  const target = findNode(ws, targetId)
  if (!node || !target || node.kind === 'collection') return ws
  if (id === targetId || isDescendant(ws, id, targetId)) return ws
  const detached = removeNode(ws, id)
  return addChild(detached, targetId, node)
}

/** 更新某个请求节点的 RequestSpec（编辑器每次改动调用） */
export function updateRequest(ws: WorkspaceTree, id: string, patch: Partial<RequestSpec>): WorkspaceTree {
  const next = cloneTree(ws)
  const n = findNode(next, id)
  if (!n || n.kind !== 'request') return ws
  n.request = { ...n.request, ...patch }
  return next
}

// ---------- 请求组装（编辑器 → 可发送请求） ----------

/** 纯文本 HttpBody 形状（与 SDK body.* 产物一致，避免 features 依赖 SDK） */
export interface PlainBody {
  kind: 'empty' | 'text' | 'json' | 'binary_b64'
  content: string
}

export interface ResolvedRequest {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body: PlainBody
  missing: string[]
}

/** :id 形式的路径变量替换（未定义的保留原样） */
export function applyPathVariables(url: string, vars: Record<string, string>): string {
  return url.replace(/:([\w-]+)/g, (raw, name: string) => (Object.prototype.hasOwnProperty.call(vars, name) ? (vars[name] as string) : raw))
}

/** Query 参数追加（已含 ? 的 URL 也兼容） */
export function appendQuery(url: string, query: Array<{ key: string; value: string }>): string {
  const enabled = query.filter((q) => q.key !== '')
  if (!enabled.length) return url
  const sp = new URLSearchParams()
  for (const q of enabled) sp.append(q.key, q.value)
  const qs = sp.toString()
  return qs === '' ? url : url + (url.includes('?') ? '&' : '?') + qs
}

function collectMissing(all: string[], more: string[]): void {
  for (const m of more) if (!all.includes(m)) all.push(m)
}

function renderKV(kvs: KV[], vars: Record<string, string>): { pairs: Array<{ key: string; value: string }>; missing: string[] } {
  const missing: string[] = []
  const pairs: Array<{ key: string; value: string }> = []
  for (const kv of kvs) {
    if (!kv.enabled || kv.key === '') continue
    const k = renderTemplate(kv.key, vars)
    const v = renderTemplate(kv.value, vars)
    collectMissing(missing, [...k.missing, ...v.missing])
    pairs.push({ key: k.text, value: v.text })
  }
  return { pairs, missing }
}

/** 组装最终请求：模板渲染 → 路径变量 → Query → Headers/Cookies/Auth → Body */
export function resolveRequest(spec: RequestSpec, vars: Record<string, string>): ResolvedRequest {
  const missing: string[] = []

  const u = renderTemplate(spec.url, vars)
  collectMissing(missing, u.missing)

  const pathMap: Record<string, string> = {}
  const path = renderKV(spec.pathVars, vars)
  collectMissing(missing, path.missing)
  for (const p of path.pairs) pathMap[p.key] = p.value

  const query = renderKV(spec.query, vars)
  collectMissing(missing, query.missing)

  const headers: Record<string, string> = {}
  const lowerSet = (k: string, v: string): void => {
    for (const ek of Object.keys(headers)) if (ek.toLowerCase() === k.toLowerCase()) delete headers[ek]
    headers[k] = v
  }
  const headerPairs = renderKV(spec.headers, vars)
  collectMissing(missing, headerPairs.missing)
  for (const h of headerPairs.pairs) lowerSet(h.key, h.value)

  const cookiePairs = renderKV(spec.cookies, vars)
  collectMissing(missing, cookiePairs.missing)
  if (cookiePairs.pairs.length) lowerSet('Cookie', cookiePairs.pairs.map((c) => `${c.key}=${c.value}`).join('; '))

  const auth = spec.auth
  const aTok = renderTemplate(auth.bearerToken, vars)
  const aUser = renderTemplate(auth.basicUser, vars)
  const aPass = renderTemplate(auth.basicPassword, vars)
  const aKey = renderTemplate(auth.apiKeyValue, vars)
  collectMissing(missing, [...aTok.missing, ...aUser.missing, ...aPass.missing, ...aKey.missing])
  if (auth.type === 'bearer' && aTok.text) lowerSet('Authorization', `Bearer ${aTok.text}`)
  if (auth.type === 'basic' && (aUser.text || aPass.text)) lowerSet('Authorization', `Basic ${bytesToBase64(new TextEncoder().encode(`${aUser.text}:${aPass.text}`))}`)
  if (auth.type === 'apikey' && auth.apiKeyName && aKey.text) lowerSet(renderTemplate(auth.apiKeyName, vars).text, aKey.text)

  let body: PlainBody = { kind: 'empty', content: '' }
  if (spec.bodyType === 'json') {
    const t = renderTemplate(spec.bodyText, vars)
    collectMissing(missing, t.missing)
    body = { kind: 'json', content: t.text }
    lowerSet('Content-Type', 'application/json')
  } else if (spec.bodyType === 'text') {
    const t = renderTemplate(spec.bodyText, vars)
    collectMissing(missing, t.missing)
    body = { kind: 'text', content: t.text }
    lowerSet('Content-Type', 'text/plain')
  } else if (spec.bodyType === 'urlencoded') {
    const form = renderKV(spec.bodyForm, vars)
    collectMissing(missing, form.missing)
    const sp = new URLSearchParams()
    for (const p of form.pairs) sp.append(p.key, p.value)
    body = { kind: 'text', content: sp.toString() }
    lowerSet('Content-Type', 'application/x-www-form-urlencoded')
  } else if (spec.bodyType === 'form') {
    const form = renderKV(spec.bodyForm, vars)
    collectMissing(missing, form.missing)
    const boundary = `----workos${Date.now().toString(16)}`
    const parts = form.pairs.map((p) => `--${boundary}\r\nContent-Disposition: form-data; name="${p.key}"\r\n\r\n${p.value}\r\n`)
    body = { kind: 'text', content: `${parts.join('')}--${boundary}--\r\n` }
    lowerSet('Content-Type', `multipart/form-data; boundary=${boundary}`)
  } else if (spec.bodyType === 'binary') {
    body = { kind: 'binary_b64', content: spec.bodyB64 }
    if (spec.bodyB64 && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/octet-stream'
  }

  const url = appendQuery(applyPathVariables(u.text, pathMap), query.pairs)
  return { method: spec.method, url, headers, body, missing }
}

// ---------- base64（Node 与浏览器通用） ----------

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 字节数 → 人类可读 */
export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** 响应体 JSON 美化（失败返回原文） */
export function prettyBody(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
