/** WebSocket 调试核心纯函数（验收 I1–I5 的测试目标） */

import type { WsDirection } from '@work-os/plugin-sdk'

/** 消息条目（事件 + 本地自增 id，便于渲染 key） */
export interface ChatMsg {
  id: number
  sessionId: string
  dir: WsDirection
  data: string
  binary: boolean
  ts: number
}

/** 最近连接记录（持久化到 storage key `sessions`） */
export interface SessionEntry {
  url: string
  headers: Record<string, string>
  subprotocols: string[]
}

/** 键值行（Headers 编辑表） */
export interface KeyValueRow {
  key: string
  value: string
}

/** 时间戳 → HH:mm:ss.SSS（本地时区） */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

/** URL 必须以 ws:// 或 wss:// 开头 */
export function isWebSocketUrl(url: string): boolean {
  return /^wss?:\/\//i.test(url.trim())
}

/** 子协议输入 → 数组（逗号 / 空格 / 中文逗号分隔，去空去重） */
export function parseSubprotocols(input: string): string[] {
  const parts = input
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return [...new Set(parts)]
}

/** Headers 键值行 → Record（去空键，trim；后行覆盖同行） */
export function rowsToHeaders(rows: KeyValueRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const k = r.key.trim()
    if (!k) continue
    out[k] = r.value.trim()
  }
  return out
}

/** Record → 键值行（恢复会话用） */
export function headersToRows(headers: Record<string, string>): KeyValueRow[] {
  return Object.entries(headers).map(([key, value]) => ({ key, value }))
}

export interface SendJsonResult {
  ok: boolean
  /** 校验通过时为压缩后的 JSON 字符串 */
  payload: string
  error?: string
}

/** JSON 发送前校验并压缩格式化（失败给出错误信息） */
export function validateSendJson(text: string): SendJsonResult {
  try {
    return { ok: true, payload: JSON.stringify(JSON.parse(text)) }
  } catch (e) {
    return { ok: false, payload: '', error: e instanceof SyntaxError ? e.message : String(e) }
  }
}

/** 尝试美化 JSON：成功返回 2 空格缩进字符串，失败返回 null */
export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return null
  }
}

/** 系统事件是否为「关闭/断开」类（自动重连判定） */
export function isCloseSystemEvent(data: string): boolean {
  return /关闭|断开|close/i.test(data)
}

/** UTF-8 安全的 base64 编码（Binary 发送：文本 → base64） */
export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export type DirectionFilter = 'all' | 'in' | 'out'

export interface FilterOptions {
  /** 关键词（大小写不敏感，匹配消息内容） */
  keyword: string
  /** 方向过滤：全部 / 接收 / 发送 */
  dir: DirectionFilter
}

/** 消息过滤：关键词 + 方向（关键词与方向同时生效，空关键词即不过滤内容） */
export function filterMessages(msgs: ChatMsg[], opts: FilterOptions): ChatMsg[] {
  const kw = opts.keyword.trim().toLowerCase()
  return msgs.filter((m) => {
    if (opts.dir !== 'all' && m.dir !== opts.dir) return false
    if (kw && !m.data.toLowerCase().includes(kw)) return false
    return true
  })
}

/** 消息展示文本：二进制原样（base64）；开启 pretty 时 in 文本尝试美化 */
export function displayMessage(m: ChatMsg, pretty: boolean): string {
  if (pretty && m.dir === 'in' && !m.binary) {
    return prettyJson(m.data) ?? m.data
  }
  return m.data
}

/** 最近连接列表：去重（url+headers+子协议一致视为同一条）、最新在前、最多 20 条 */
export function appendSession(list: SessionEntry[], entry: SessionEntry): SessionEntry[] {
  const sig = (s: SessionEntry): string =>
    JSON.stringify([s.url, s.headers, [...s.subprotocols].sort()])
  return [entry, ...list.filter((s) => sig(s) !== sig(entry))].slice(0, 20)
}

/** 解析持久化的最近连接（容错：坏数据返回空表） */
export function parseSessions(raw: string | null): SessionEntry[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter(
      (s): s is SessionEntry =>
        !!s &&
        typeof s === 'object' &&
        typeof (s as SessionEntry).url === 'string' &&
        (s as SessionEntry).headers !== null &&
        typeof (s as SessionEntry).headers === 'object' &&
        Array.isArray((s as SessionEntry).subprotocols),
    )
  } catch {
    return []
  }
}
