import { describe, expect, it } from 'vitest'
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
  prettyJson,
  rowsToHeaders,
  validateSendJson,
  type ChatMsg,
  type SessionEntry,
} from './features'

function msg(partial: Partial<ChatMsg> & Pick<ChatMsg, 'dir' | 'data'>): ChatMsg {
  return { id: 0, sessionId: 's1', binary: false, ts: 0, ...partial }
}

describe('WebSocket 工具（验收 I1–I5）', () => {
  it('I1 URL 校验', () => {
    expect(isWebSocketUrl('wss://echo.websocket.events')).toBe(true)
    expect(isWebSocketUrl('  ws://127.0.0.1:9000/path ')).toBe(true)
    expect(isWebSocketUrl('WS://example.com')).toBe(true)
    expect(isWebSocketUrl('https://example.com')).toBe(false)
    expect(isWebSocketUrl('')).toBe(false)
    expect(isWebSocketUrl('echo.websocket.events')).toBe(false)
  })

  it('I1 时间戳格式化为 HH:mm:ss.SSS', () => {
    const d = new Date(2026, 7, 16, 9, 5, 3, 42)
    expect(formatTimestamp(d.getTime())).toBe('09:05:03.042')
    const d2 = new Date(2026, 11, 31, 23, 59, 59, 999)
    expect(formatTimestamp(d2.getTime())).toBe('23:59:59.999')
    expect(formatTimestamp(d.getTime())).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/)
  })

  it('I1 子协议解析：中英文逗号/空格分隔、去空去重', () => {
    expect(parseSubprotocols('chat, chat')).toEqual(['chat'])
    expect(parseSubprotocols('chat, superchat')).toEqual(['chat', 'superchat'])
    expect(parseSubprotocols('a，b  c')).toEqual(['a', 'b', 'c'])
    expect(parseSubprotocols('  ,, ')).toEqual([])
    expect(parseSubprotocols('')).toEqual([])
  })

  it('I1 Headers 键值行与 Record 互转', () => {
    const rows = [
      { key: 'Authorization', value: 'Bearer token ' },
      { key: '  ', value: '空键应被忽略' },
      { key: 'X-Trace', value: '' },
    ]
    const headers = rowsToHeaders(rows)
    expect(headers).toEqual({ Authorization: 'Bearer token', 'X-Trace': '' })
    expect(headersToRows(headers)).toEqual([
      { key: 'Authorization', value: 'Bearer token' },
      { key: 'X-Trace', value: '' },
    ])
    expect(rowsToHeaders(headersToRows(headers))).toEqual(headers)
  })

  it('I2 JSON 发送校验并压缩', () => {
    const ok = validateSendJson('{ "a": 1,  "b": [1, 2] }')
    expect(ok.ok).toBe(true)
    expect(ok.payload).toBe('{"a":1,"b":[1,2]}')
    const bad = validateSendJson('{ "a": }')
    expect(bad.ok).toBe(false)
    expect(bad.payload).toBe('')
    expect(bad.error).toBeTruthy()
    // 中文内容往返无损
    expect(validateSendJson('{"msg":"你好"}').payload).toBe('{"msg":"你好"}')
  })

  it('I4 pretty 判断：合法 JSON 美化、非法原样返回 null', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyJson('[1,2]')).toBe('[\n  1,\n  2\n]')
    expect(prettyJson('plain text')).toBeNull()
    expect(prettyJson('')).toBeNull()
  })

  it('I3 自动重连判定：system 事件含「关闭/断开」', () => {
    expect(isCloseSystemEvent('已断开')).toBe(true)
    expect(isCloseSystemEvent('连接已关闭')).toBe(true)
    expect(isCloseSystemEvent('connection closed by peer')).toBe(true)
    expect(isCloseSystemEvent('已连接')).toBe(false)
    expect(isCloseSystemEvent('')).toBe(false)
  })

  it('I3 base64 编码（UTF-8 安全）', () => {
    expect(encodeBase64Utf8('hello')).toBe('aGVsbG8=')
    expect(encodeBase64Utf8('')).toBe('')
    // 中文需走 UTF-8 字节而非 latin1
    expect(encodeBase64Utf8('你好')).toBe('5L2g5aW9')
    expect(encodeBase64Utf8('a=b&c=d')).toBe('YT1iJmM9ZA==')
  })

  it('I4 消息过滤：关键词 + 方向组合', () => {
    const msgs = [
      msg({ id: 1, dir: 'out', data: '{"cmd":"ping"}' }),
      msg({ id: 2, dir: 'in', data: '{"cmd":"pong"}' }),
      msg({ id: 3, dir: 'system', data: '已连接' }),
      msg({ id: 4, dir: 'in', data: 'PONG! 大写' }),
    ]
    // 全部
    expect(filterMessages(msgs, { keyword: '', dir: 'all' })).toHaveLength(4)
    // 方向：收 / 发
    expect(filterMessages(msgs, { keyword: '', dir: 'in' }).map((m) => m.id)).toEqual([2, 4])
    expect(filterMessages(msgs, { keyword: '', dir: 'out' }).map((m) => m.id)).toEqual([1])
    // 关键词（大小写不敏感）
    expect(filterMessages(msgs, { keyword: 'pong', dir: 'all' }).map((m) => m.id)).toEqual([2, 4])
    expect(filterMessages(msgs, { keyword: 'PONG', dir: 'in' }).map((m) => m.id)).toEqual([2, 4])
    // 组合：发 + 无命中
    expect(filterMessages(msgs, { keyword: 'pong', dir: 'out' })).toEqual([])
    // 中文关键词
    expect(filterMessages(msgs, { keyword: '已连接', dir: 'all' }).map((m) => m.id)).toEqual([3])
  })

  it('I4 消息展示：二进制原样 base64、in 文本可 pretty', () => {
    const bin = msg({ dir: 'in', data: 'aGVsbG8=', binary: true })
    expect(displayMessage(bin, true)).toBe('aGVsbG8=') // 二进制不做 pretty
    const textIn = msg({ dir: 'in', data: '{"a":1}' })
    expect(displayMessage(textIn, true)).toBe('{\n  "a": 1\n}')
    expect(displayMessage(textIn, false)).toBe('{"a":1}')
    const textOut = msg({ dir: 'out', data: '{"a":1}' })
    expect(displayMessage(textOut, true)).toBe('{"a":1}') // 仅 in 消息美化
    const plain = msg({ dir: 'in', data: 'hello' })
    expect(displayMessage(plain, true)).toBe('hello') // 非 JSON 原样
  })

  it('I5 会话持久化：去重、最新在前、最多 20 条', () => {
    const a: SessionEntry = { url: 'wss://a', headers: {}, subprotocols: [] }
    const b: SessionEntry = { url: 'wss://b', headers: { Authorization: 'Bearer x' }, subprotocols: ['chat'] }
    // 同 url + 同配置去重（顺序不同也算同一条）
    let list = appendSession([], a)
    list = appendSession(list, a)
    expect(list).toHaveLength(1)
    // 新会话插到最前
    list = appendSession(list, b)
    expect(list.map((s) => s.url)).toEqual(['wss://b', 'wss://a'])
    // headers 不同的同 url 不去重
    list = appendSession(list, { url: 'wss://b', headers: {}, subprotocols: ['chat'] })
    expect(list).toHaveLength(3)
    // 上限 20
    let big: SessionEntry[] = []
    for (let i = 0; i < 25; i++) big = appendSession(big, { url: `wss://s${i}`, headers: {}, subprotocols: [] })
    expect(big).toHaveLength(20)
    expect(big[0]?.url).toBe('wss://s24')
  })

  it('I5 会话解析容错', () => {
    expect(parseSessions(null)).toEqual([])
    expect(parseSessions('')).toEqual([])
    expect(parseSessions('not json')).toEqual([])
    expect(parseSessions('{"a":1}')).toEqual([])
    expect(parseSessions('[{"url":"wss://x","headers":{},"subprotocols":[]}]')).toEqual([
      { url: 'wss://x', headers: {}, subprotocols: [] },
    ])
    // 混入脏数据只保留合法项
    const mixed = parseSessions('[null,"x",{"url":"wss://y","headers":{"k":"v"},"subprotocols":["p"]}]')
    expect(mixed).toEqual([{ url: 'wss://y', headers: { k: 'v' }, subprotocols: ['p'] }])
  })
})
