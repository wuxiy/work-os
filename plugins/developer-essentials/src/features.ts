/** 开发者小工具核心纯函数（验收 K1–K6 的测试目标），无副作用、不依赖 DOM */

// ---------- UUID ----------

/** 生成 v4 UUID（宿主 WebView 与 Node ≥19 均内置 crypto.randomUUID） */
export function uuidV4(): string {
  return crypto.randomUUID()
}

/** 按 UI 选项格式化 UUID（大写 / 去连字符） */
export function formatUuid(id: string, opts: { uppercase?: boolean; hyphens?: boolean } = {}): string {
  let s = opts.hyphens === false ? id.replaceAll('-', '') : id
  if (opts.uppercase) s = s.toUpperCase()
  return s
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

// ---------- URL 解析 ----------

export interface ParsedUrl {
  protocol: string
  /** 含端口（如 example.com:8080） */
  host: string
  port: string
  pathname: string
  /** 含前导 ? */
  search: string
  /** 含前导 # */
  hash: string
  params: Record<string, string>
}

export function parseUrl(url: string): ParsedUrl {
  const u = new URL(url) // 非法输入抛 TypeError
  const params: Record<string, string> = {}
  u.searchParams.forEach((value, key) => {
    params[key] = value
  })
  return {
    protocol: u.protocol,
    host: u.host,
    port: u.port,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    params,
  }
}

// ---------- 时间戳 ----------

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** 本地时区可读时间，如 2026-08-16 10:30:05（可选毫秒 .123） */
export function formatTimestamp(ms: number, withMs = false): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) throw new Error(`无效时间戳：${ms}`)
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return withMs ? `${base}.${pad(d.getMilliseconds(), 3)}` : base
}

/** 秒/毫秒自动识别：|值| < 1e11 视为秒，返回毫秒；非法输入抛错 */
export function parseTimestamp(input: string | number): number {
  const s = typeof input === 'number' ? String(input) : input.trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`无法识别的时间戳：${input}`)
  const n = Number(s)
  const ms = Math.abs(n) < 1e11 ? n * 1000 : n
  return Math.round(ms)
}

// ---------- 正则匹配 ----------

export interface RegexMatch {
  text: string
  index: number
  groups: string[]
  namedGroups: Record<string, string>
}

/** 返回全部匹配（g 标志时用 matchAll，否则单次）；非法正则抛错 */
export function matchRegex(pattern: string, flags: string, text: string): RegexMatch[] {
  const safeFlags = flags.replace(/[^gimsuy]/g, '')
  const re = new RegExp(pattern, safeFlags)
  const toMatch = (m: RegExpExecArray): RegexMatch => ({
    text: m[0],
    index: m.index,
    groups: m.slice(1).map((g) => g ?? ''),
    namedGroups: m.groups ?? {},
  })
  const out: RegexMatch[] = []
  if (re.global) {
    for (const m of text.matchAll(re)) out.push(toMatch(m))
  } else {
    const m = re.exec(text)
    if (m) out.push(toMatch(m))
  }
  return out
}

// ---------- 文本 Diff（行级 + 词级 LCS） ----------

export interface DiffSegment {
  type: 'same' | 'add' | 'del'
  text: string
}

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
  /** 原文 1-based 行号（same/del 行有） */
  oldNo?: number
  /** 新文 1-based 行号（same/add 行有） */
  newNo?: number
  /** 词级细分（变更是词级高亮的数据来源） */
  segments: DiffSegment[]
}

interface LineOp {
  op: 'same' | 'del' | 'add'
  ai?: number
  bi?: number
}

function lcsOps(a: string[], b: string[]): LineOp[] {
  const n = a.length
  const m = b.length
  const w = m + 1
  // dp[i*w+j] = a[i:] 与 b[j:] 的 LCS 长度（滚动一维 Uint32Array，避免 noUncheckedIndexedAccess）
  const dp = new Uint32Array((n + 1) * w)
  const at = (x: number, y: number): number => dp[x * w + y] ?? 0
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const ops: LineOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: 'same', ai: i, bi: j })
      i++
      j++
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      ops.push({ op: 'del', ai: i })
      i++
    } else {
      ops.push({ op: 'add', bi: j })
      j++
    }
  }
  while (i < n) {
    ops.push({ op: 'del', ai: i })
    i++
  }
  while (j < m) {
    ops.push({ op: 'add', bi: j })
    j++
  }
  return ops
}

function tokenizeWords(line: string): string[] {
  return line.split(/(\s+)/).filter((t) => t !== '')
}

/** 词级 LCS：同时产出旧行（same/del）与新行（same/add）两份片段 */
function wordSegments(a: string, b: string): { left: DiffSegment[]; right: DiffSegment[] } {
  const ta = tokenizeWords(a)
  const tb = tokenizeWords(b)
  const n = ta.length
  const m = tb.length
  const w = m + 1
  const dp = new Uint32Array((n + 1) * w)
  const at = (x: number, y: number): number => dp[x * w + y] ?? 0
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = ta[i] === tb[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const push = (arr: DiffSegment[], type: DiffSegment['type'], text: string): void => {
    const last = arr[arr.length - 1]
    if (last && last.type === type) last.text += text
    else arr.push({ type, text })
  }
  const left: DiffSegment[] = []
  const right: DiffSegment[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      push(left, 'same', ta[i] as string)
      push(right, 'same', tb[j] as string)
      i++
      j++
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      push(left, 'del', ta[i] as string)
      i++
    } else {
      push(right, 'add', tb[j] as string)
      j++
    }
  }
  while (i < n) {
    push(left, 'del', ta[i] as string)
    i++
  }
  while (j < m) {
    push(right, 'add', tb[j] as string)
    j++
  }
  return { left, right }
}

/** 行级 LCS diff；相邻的删/增行再做词级配对，segments 标出词级差异 */
export function textDiff(a: string, b: string): DiffLine[] {
  const la = a.split('\n')
  const lb = b.split('\n')
  const ops = lcsOps(la, lb)
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  let i = 0
  while (i < ops.length) {
    const op = ops[i] as LineOp
    if (op.op === 'same') {
      oldNo++
      newNo++
      const text = la[op.ai as number] as string
      out.push({ type: 'same', text, oldNo, newNo, segments: [{ type: 'same', text }] })
      i++
      continue
    }
    // 收集同一变更块内的 del / add 行，按序配对做词级 diff
    const dels: number[] = []
    const adds: number[] = []
    while (i < ops.length && (ops[i] as LineOp).op !== 'same') {
      const cur = ops[i] as LineOp
      if (cur.op === 'del') dels.push(cur.ai as number)
      else adds.push(cur.bi as number)
      i++
    }
    const pairs = Math.min(dels.length, adds.length)
    for (let k = 0; k < dels.length; k++) {
      oldNo++
      const idx = dels[k] as number
      const text = la[idx] as string
      let segments: DiffSegment[] = [{ type: 'del', text }]
      if (k < pairs) {
        const { left } = wordSegments(text, lb[adds[k] as number] as string)
        if (left.length > 0) segments = left
      }
      out.push({ type: 'del', text, oldNo, segments })
    }
    for (let k = 0; k < adds.length; k++) {
      newNo++
      const idx = adds[k] as number
      const text = lb[idx] as string
      let segments: DiffSegment[] = [{ type: 'add', text }]
      if (k < pairs) {
        const { right } = wordSegments(la[dels[k] as number] as string, text)
        if (right.length > 0) segments = right
      }
      out.push({ type: 'add', text, newNo, segments })
    }
  }
  return out
}

// ---------- Cron（5 段：分 时 日 月 周） ----------

interface CronField {
  set: Set<number>
  all: boolean
  /** 纯步长（整字段为 星/n 或 min-max/n）时的 n，用于「每 n 分钟」描述 */
  step: number | null
  values: number[]
}

interface CronFields {
  minute: CronField
  hour: CronField
  dom: CronField
  month: CronField
  dow: CronField
}

export interface CronResult {
  humanReadable: string
  next: Date
  error?: string
}

function parseCronField(raw: string, min: number, max: number, label: string, map?: (v: number) => number): CronField {
  const set = new Set<number>()
  let pureStep: number | null = null
  const parts = raw.split(',')
  for (const part of parts) {
    // 支持 *、a、a-b、*/n、a/n（视为 a-max/n）、a-b/n
    const seg = part.split('/')
    const rangeStr = seg[0] ?? ''
    const stepStr = seg[1]
    if (seg.length > 2 || rangeStr === '' || (stepStr !== undefined && !/^\d+$/.test(stepStr))) {
      throw new Error(`无法解析 Cron 字段（${label}）："${part}"`)
    }
    const step = stepStr === undefined ? 1 : Number(stepStr)
    if (step < 1) throw new Error(`Cron 步长必须为正整数（${label}）：${part}`)
    let lo: number
    let hi: number
    if (rangeStr === '*') {
      lo = min
      hi = max
    } else if (/^\d+$/.test(rangeStr)) {
      lo = Number(rangeStr)
      hi = step > 1 ? max : lo // Vixie 风格：a/n 等价 a-max/n
    } else if (/^\d+-\d+$/.test(rangeStr)) {
      const dash = rangeStr.indexOf('-')
      lo = Number(rangeStr.slice(0, dash))
      hi = Number(rangeStr.slice(dash + 1))
    } else {
      throw new Error(`无法解析 Cron 字段（${label}）："${part}"`)
    }
    if (lo < min || hi > max || lo > hi) {
      throw new Error(`Cron 字段越界（${label}，允许 ${min}–${max}）："${part}"`)
    }
    for (let v = lo; v <= hi; v += step) set.add(map ? map(v) : v)
    if (step > 1 && lo === min && hi === max && parts.length === 1 && pureStep === null) pureStep = step
  }
  const values = [...set].sort((x, y) => x - y)
  // 「全选」按映射后的去重个数判断（如 周 0–7 归一化后为 7 个）
  const expectedSize = new Set(Array.from({ length: max - min + 1 }, (_, i) => (map ? map(min + i) : min + i))).size
  const all = values.length === expectedSize
  return { set, all, step: pureStep, values }
}

export function parseCronFields(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`Cron 表达式需为 5 段（分 时 日 月 周）："${expr}"`)
  return {
    minute: parseCronField(parts[0] as string, 0, 59, '分钟'),
    hour: parseCronField(parts[1] as string, 0, 23, '小时'),
    dom: parseCronField(parts[2] as string, 1, 31, '日'),
    month: parseCronField(parts[3] as string, 1, 12, '月'),
    // 周允许 0–7，7 归一化为周日 0
    dow: parseCronField(parts[4] as string, 0, 7, '星期', (v) => v % 7),
  }
}

function matchesDay(f: CronFields, d: Date): boolean {
  const domOk = f.dom.set.has(d.getDate())
  const dowOk = f.dow.set.has(d.getDay())
  // 经典 Vixie 语义：日与周都受限时取「或」
  if (!f.dom.all && !f.dow.all) return domOk || dowOk
  if (!f.dom.all) return domOk
  if (!f.dow.all) return dowOk
  return true
}

/** 从 from 之后的首个整分钟起逐分钟扫描，最多 366 天 */
function findNext(f: CronFields, from: Date): Date | null {
  const d = new Date(from)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)
  const limitMs = from.getTime() + 366 * 24 * 3600 * 1000
  while (d.getTime() <= limitMs) {
    if (!f.month.set.has(d.getMonth() + 1)) {
      d.setDate(1)
      d.setMonth(d.getMonth() + 1)
      d.setHours(0, 0, 0, 0)
      continue
    }
    if (!matchesDay(f, d) || !f.hour.set.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0)
      continue
    }
    if (f.minute.set.has(d.getMinutes())) return new Date(d)
    d.setMinutes(d.getMinutes() + 1, 0, 0)
  }
  return null
}

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function listStr(arr: number[]): string {
  return arr.join('、')
}

function describeCron(f: CronFields): string {
  const single = (fld: CronField): number | null => (fld.values.length === 1 ? (fld.values[0] as number) : null)
  const minV = single(f.minute)
  const hourV = single(f.hour)

  // 时间部分（频率型以「每」开头）
  let time: string
  if (f.minute.all && f.hour.all) time = '每分钟'
  else if (f.hour.all && f.minute.step !== null) time = `每 ${f.minute.step} 分钟`
  else if (f.hour.all) time = `每小时的第 ${listStr(f.minute.values)} 分钟`
  else if (f.minute.all && f.hour.step !== null) time = `每 ${f.hour.step} 小时`
  else if (minV !== null && hourV !== null) time = `${pad(hourV)}:${pad(minV)}`
  else if (minV === 0) time = `${f.hour.values.map((h) => `${h} 点`).join('、')}`
  else if (hourV !== null) time = `${pad(hourV)} 点的第 ${listStr(f.minute.values)} 分钟`
  else time = `${f.hour.values.map((h) => `${h} 点`).join('、')}的第 ${listStr(f.minute.values)} 分钟`

  const isFreq = time.startsWith('每')

  // 日期部分
  const dayParts: string[] = []
  if (!f.month.all) dayParts.push(`${listStr(f.month.values)} 月`)
  if (!f.dom.all) dayParts.push(f.month.all ? `每月 ${listStr(f.dom.values)} 日` : `${listStr(f.dom.values)} 日`)
  if (!f.dow.all) {
    const isWeekdays = f.dow.values.length === 5 && f.dow.values.every((v) => v >= 1 && v <= 5)
    dayParts.push(isWeekdays ? '每个工作日' : `每${f.dow.values.map((v) => WEEK_NAMES[v] as string).join('、')}`)
  }
  let day: string
  if (dayParts.length === 0) day = isFreq ? '' : '每天'
  else if (dayParts.length === 1) day = dayParts[0] as string
  else day = dayParts.join('的')

  if (day === '') return time
  return isFreq ? `${day}的${time}` : `${day} ${time}`
}

/** 解析 5 段 cron：非法表达式抛错；next 为 from（默认当前时间）之后的首个执行时间 */
export function parseCron(expr: string, from: Date = new Date()): CronResult {
  const fields = parseCronFields(expr)
  const next = findNext(fields, from)
  if (!next) throw new Error('366 天内未找到下次执行时间')
  return { humanReadable: describeCron(fields), next }
}

/** 下 count 次执行时间（升序，从 from 起算） */
export function nextCronRuns(expr: string, count = 5, from: Date = new Date()): Date[] {
  const fields = parseCronFields(expr)
  const out: Date[] = []
  let cursor = new Date(from)
  for (let i = 0; i < count; i++) {
    const n = findNext(fields, cursor)
    if (!n) break
    out.push(n)
    cursor = n
  }
  return out
}
