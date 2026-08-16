/** JSON 核心功能（纯函数，验收 G1–G6 的测试目标） */

export interface ValidateResult {
  ok: boolean
  error?: string
  /** 1-based 行/列 */
  line?: number
  column?: number
}

/** 精确定位 JSON 语法错误（Node 24 的报错信息不含 position，自行扫描） */
function locateJsonError(text: string): { line: number; column: number; message: string } | null {
  let i = 0
  const n = text.length
  const ws = (): void => {
    while (i < n && /\s/.test(text[i]!)) i++
  }
  const value = (): string | null => {
    ws()
    if (i >= n) return '意外的输入结束（缺少值）'
    const c = text[i]!
    if (c === '{') return object()
    if (c === '[') return array()
    if (c === '"') return string_() == null ? null : null
    if (c === 't') return literal('true')
    if (c === 'f') return literal('false')
    if (c === 'n') return literal('null')
    if (c === '-' || (c >= '0' && c <= '9')) return number_()
    return `意外的字符 '${c}'`
  }
  const object = (): string | null => {
    i++ // {
    ws()
    if (text[i] === '}') {
      i++
      return null
    }
    for (;;) {
      ws()
      if (text[i] !== '"') return `期望字符串键名，但得到 '${text[i] ?? '输入结束'}'`
      if (string_() !== null) return null!
      ws()
      if (text[i] !== ':') return `期望 ':'，但得到 '${text[i] ?? '输入结束'}'`
      i++
      const err = value()
      if (err) return err
      ws()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === '}') {
        i++
        return null
      }
      return `期望 ',' 或 '}'，但得到 '${text[i] ?? '输入结束'}'`
    }
  }
  const array = (): string | null => {
    i++ // [
    ws()
    if (text[i] === ']') {
      i++
      return null
    }
    for (;;) {
      const err = value()
      if (err) return err
      ws()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === ']') {
        i++
        return null
      }
      return `期望 ',' 或 ']'，但得到 '${text[i] ?? '输入结束'}'`
    }
  }
  const string_ = (): string | null => {
    i++ // "
    for (;;) {
      if (i >= n) return '字符串未闭合'
      const c = text[i]!
      if (c === '"') {
        i++
        return null
      }
      if (c === '\\') {
        i++
        const e = text[i]
        if (e === undefined || !['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'].includes(e)) {
          return `非法转义 '\\${e ?? ''}'`
        }
        if (e === 'u') {
          for (let k = 1; k <= 4; k++) {
            if (!/[0-9a-fA-F]/.test(text[i + k] ?? '')) return 'unicode 转义需要 4 位十六进制'
          }
          i += 4
        }
        i++
        continue
      }
      if (c.charCodeAt(0) < 0x20) return '字符串中包含非法控制字符'
      i++
    }
  }
  const literal = (lit: string): string | null => {
    if (text.slice(i, i + lit.length) !== lit) return `期望 '${lit}'`
    i += lit.length
    return null
  }
  const number_ = (): string | null => {
    const start = i
    if (text[i] === '-') i++
    while (i < n && text[i]! >= '0' && text[i]! <= '9') i++
    if (text[i] === '.') {
      i++
      while (i < n && text[i]! >= '0' && text[i]! <= '9') i++
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++
      if (text[i] === '+' || text[i] === '-') i++
      while (i < n && text[i]! >= '0' && text[i]! <= '9') i++
    }
    if (i === start) return '非法数字'
    return null
  }

  const err = value()
  if (err) {
    const pos = Math.min(i, n)
    const before = text.slice(0, pos)
    const line = before.split('\n').length
    const column = pos - before.lastIndexOf('\n')
    return { line, column, message: `${err}（第 ${line} 行，第 ${column} 列）` }
  }
  ws()
  if (i < n) {
    const before = text.slice(0, i)
    const line = before.split('\n').length
    const column = i - before.lastIndexOf('\n')
    return { line, column, message: `JSON 后有多余内容（第 ${line} 行，第 ${column} 列）` }
  }
  return null
}

export function validateJson(text: string): ValidateResult {
  try {
    JSON.parse(text)
    return { ok: true }
  } catch {
    const located = locateJsonError(text)
    if (located) return { ok: false, error: located.message, line: located.line, column: located.column }
    return { ok: false, error: 'JSON 解析失败' }
  }
}

export function formatJson(text: string, indent = 2): string {
  return JSON.stringify(JSON.parse(text), null, indent)
}

export function minifyJson(text: string): string {
  return JSON.stringify(JSON.parse(text))
}

export function escapeJsonString(text: string): string {
  return JSON.stringify(text).slice(1, -1)
}

export function unescapeJsonString(text: string): string {
  return JSON.parse(`"${text}"`) as string
}

// ---------- JSONPath（精简实现：$ .key .key? [n] [*] [start:end] ..key） ----------

export function jsonPath(root: unknown, path: string): unknown[] {
  const tokens = tokenize(path)
  let current: unknown[] = [root]
  for (const t of tokens) {
    const next: unknown[] = []
    for (const c of current) {
      next.push(...applyToken(c, t))
    }
    current = next
  }
  return current
}

type Token = { kind: 'child'; name: string; optional: boolean } | { kind: 'index'; n: number } | { kind: 'wildcard' } | { kind: 'slice'; start?: number; end?: number } | { kind: 'descend'; name: string }

function tokenize(path: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const s = path.trim()
  if (s.startsWith('$')) i = 1
  while (i < s.length) {
    if (s[i] === '.') {
      if (s[i + 1] === '.') {
        i += 2
        const m = /^[\w-]+/.exec(s.slice(i))
        if (m) {
          tokens.push({ kind: 'descend', name: m[0] })
          i += m[0].length
        }
        continue
      }
      i += 1
      const m = /^[\w-$]+/.exec(s.slice(i))
      if (!m) continue
      const name = m[0]
      i += name.length
      const optional = s[i] === '?'
      if (optional) i += 1
      tokens.push({ kind: 'child', name, optional })
    } else if (s[i] === '[') {
      const end = s.indexOf(']', i)
      if (end === -1) break
      const inner = s.slice(i + 1, end)
      i = end + 1
      if (inner === '*') tokens.push({ kind: 'wildcard' })
      else if (inner.includes(':')) {
        const [a, b] = inner.split(':')
        tokens.push({ kind: 'slice', start: a === '' || a === '*' ? undefined : Number(a), end: b === '' || b === '*' ? undefined : Number(b) })
      } else if (/^-?\d+$/.test(inner)) tokens.push({ kind: 'index', n: Number(inner) })
      else tokens.push({ kind: 'child', name: inner.replace(/^['"]|['"]$/g, ''), optional: false })
    } else {
      // 顶层裸 key（容错）
      const m = /^[\w-$]+/.exec(s.slice(i))
      if (!m) {
        i += 1
        continue
      }
      tokens.push({ kind: 'child', name: m[0], optional: false })
      i += m[0].length
    }
  }
  return tokens
}

function applyToken(node: unknown, t: Token): unknown[] {
  switch (t.kind) {
    case 'child': {
      if (node !== null && typeof node === 'object' && t.name in (node as Record<string, unknown>)) {
        return [(node as Record<string, unknown>)[t.name]]
      }
      return t.optional ? [] : []
    }
    case 'index': {
      if (Array.isArray(node)) {
        const v = node[t.n < 0 ? node.length + t.n : t.n]
        return v === undefined ? [] : [v]
      }
      return []
    }
    case 'wildcard': {
      if (Array.isArray(node)) return node
      if (node !== null && typeof node === 'object') return Object.values(node as Record<string, unknown>)
      return []
    }
    case 'slice': {
      if (!Array.isArray(node)) return []
      const start = t.start ?? 0
      const end = t.end ?? node.length
      return node.slice(start, end)
    }
    case 'descend': {
      const out: unknown[] = []
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) {
          for (const x of n) walk(x)
        } else if (n !== null && typeof n === 'object') {
          const o = n as Record<string, unknown>
          if (t.name in o) out.push(o[t.name])
          for (const v of Object.values(o)) walk(v)
        }
      }
      walk(node)
      return out
    }
  }
}

// ---------- Diff（结构化路径对比） ----------

export interface DiffEntry {
  path: string
  type: 'added' | 'removed' | 'changed'
  left?: unknown
  right?: unknown
}

export function diffJson(left: unknown, right: unknown): DiffEntry[] {
  const out: DiffEntry[] = []
  const walk = (l: unknown, r: unknown, path: string): void => {
    if (l === r) return
    const lObj = l !== null && typeof l === 'object'
    const rObj = r !== null && typeof r === 'object'
    if (lObj && rObj) {
      if (Array.isArray(l) && Array.isArray(r)) {
        const n = Math.max(l.length, r.length)
        for (let i = 0; i < n; i++) {
          if (i >= l.length) out.push({ path: `${path}[${i}]`, type: 'added', right: r[i] })
          else if (i >= r.length) out.push({ path: `${path}[${i}]`, type: 'removed', left: l[i] })
          else walk(l[i], r[i], `${path}[${i}]`)
        }
      } else if (!Array.isArray(l) && !Array.isArray(r)) {
        const keys = new Set([...Object.keys(l as object), ...Object.keys(r as object)])
        for (const k of keys) {
          const lp = `${path}.${k}`
          const lv = (l as Record<string, unknown>)[k]
          const rv = (r as Record<string, unknown>)[k]
          if (!(k in (l as object))) out.push({ path: lp, type: 'added', right: rv })
          else if (!(k in (r as object))) out.push({ path: lp, type: 'removed', left: lv })
          else walk(lv, rv, lp)
        }
      } else {
        out.push({ path, type: 'changed', left: l, right: r })
      }
    } else {
      out.push({ path: path || '$', type: 'changed', left: l, right: r })
    }
  }
  walk(left, right, '$')
  return out
}

// ---------- YAML 互转 ----------

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export function jsonToYaml(text: string): string {
  return stringifyYaml(JSON.parse(text))
}

export function yamlToJson(text: string): string {
  return JSON.stringify(parseYaml(text), null, 2)
}

// ---------- JSON → TypeScript ----------

export function jsonToTypescript(name: string, text: string): string {
  const root = JSON.parse(text)
  const interfaces = new Map<string, Map<string, { type: string; optional: boolean }>>()
  const used = new Set<string>()

  const pascal = (s: string): string =>
    s
      .replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
      .replace(/^(.)/, (m) => m.toUpperCase()) || 'Value'

  const uniqueName = (base: string): string => {
    let n = pascal(base)
    let i = 2
    while (used.has(n) && i < 100) n = `${pascal(base)}${i++}`
    used.add(n)
    return n
  }

  const typeOf = (v: unknown, hint: string): string => {
    if (v === null) return 'null'
    if (Array.isArray(v)) {
      if (v.length === 0) return 'unknown[]'
      const elemTypes = [...new Set(v.map((x) => typeOf(x, singular(hint))))]
      return elemTypes.length === 1 ? `${elemTypes[0]}[]` : `(${elemTypes.join(' | ')})[]`
    }
    if (typeof v === 'object') {
      const ifName = uniqueName(hint)
      const fields = new Map<string, { type: string; optional: boolean }>()
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        fields.set(k, { type: typeOf(val, k), optional: false })
      }
      interfaces.set(ifName, fields)
      return ifName
    }
    return typeof v
  }

  const rootType = typeOf(root, name)
  const out: string[] = []
  // 深层 interface 先声明（Map 插入顺序即依赖顺序：被引用者先插入）
  for (const [iname, fields] of interfaces) {
    out.push(`export interface ${iname} {`)
    for (const [fname, f] of fields) {
      const safe = /^[A-Za-z_$][\w$]*$/.test(fname) ? fname : JSON.stringify(fname)
      out.push(`  ${safe}: ${f.type}`)
    }
    out.push('}')
    out.push('')
  }
  out.push(`export type ${pascal(name)} = ${rootType}`)
  return out.join('\n')
}

function singular(s: string): string {
  return s.endsWith('s') && s.length > 1 ? s.slice(0, -1) : `item`
}
