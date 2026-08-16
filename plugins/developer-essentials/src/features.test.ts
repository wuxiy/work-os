import { describe, expect, it } from 'vitest'
import {
  formatTimestamp,
  formatUuid,
  isUuid,
  matchRegex,
  nextCronRuns,
  parseCron,
  parseTimestamp,
  parseUrl,
  textDiff,
  uuidV4,
} from './features'

describe('开发者小工具（验收 K1–K6）', () => {
  it('K1-1 UUID：v4 格式与唯一性', () => {
    const id = uuidV4()
    expect(isUuid(id)).toBe(true)
    expect(id[14]).toBe('4') // version 4
    expect(['8', '9', 'a', 'b']).toContain(id[19]) // variant 10xx
    expect(uuidV4()).not.toBe(id)
  })

  it('K1-2 UUID：大写 / 去连字符格式化', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000'
    expect(formatUuid(id)).toBe(id)
    expect(formatUuid(id, { uppercase: true })).toBe(id.toUpperCase())
    expect(formatUuid(id, { hyphens: false })).toBe('123e4567e89b12d3a456426614174000')
    expect(formatUuid(id, { uppercase: true, hyphens: false })).toBe('123E4567E89B12D3A456426614174000')
  })

  it('K1-3 时间戳：formatTimestamp 本地可读格式', () => {
    const d = new Date(2026, 7, 16, 10, 30, 5)
    d.setMilliseconds(123)
    expect(formatTimestamp(d.getTime())).toBe('2026-08-16 10:30:05')
    expect(formatTimestamp(d.getTime(), true)).toBe('2026-08-16 10:30:05.123')
    expect(formatTimestamp(0)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('K1-4 时间戳：parseTimestamp 秒/毫秒自动识别（<1e11 视为秒）', () => {
    expect(parseTimestamp('1699999999')).toBe(1699999999000)
    expect(parseTimestamp('1699999999000')).toBe(1699999999000)
    expect(parseTimestamp(1699999999)).toBe(1699999999000)
    expect(parseTimestamp(' 1699999999 ')).toBe(1699999999000)
    expect(() => parseTimestamp('abc')).toThrow()
    expect(() => parseTimestamp('')).toThrow()
  })

  it('K2-1 parseUrl 完整解析（协议/主机/端口/路径/查询/hash/参数）', () => {
    const r = parseUrl('https://user:pass@example.com:8080/a/b?x=1&y=2#frag')
    expect(r.protocol).toBe('https:')
    expect(r.host).toBe('example.com:8080')
    expect(r.port).toBe('8080')
    expect(r.pathname).toBe('/a/b')
    expect(r.search).toBe('?x=1&y=2')
    expect(r.hash).toBe('#frag')
    expect(r.params).toEqual({ x: '1', y: '2' })
  })

  it('K2-2 parseUrl 默认端口与非法输入', () => {
    const r = parseUrl('https://example.com/a')
    expect(r.port).toBe('')
    expect(r.host).toBe('example.com')
    expect(r.params).toEqual({})
    expect(() => parseUrl('not a url')).toThrow()
    expect(() => parseUrl('')).toThrow()
  })

  it('K2-3 正则匹配：全部匹配 + 捕获分组', () => {
    const ms = matchRegex('\\d+', 'g', 'a1 b22 c333')
    expect(ms.map((m) => m.text)).toEqual(['1', '22', '333'])
    expect(ms.map((m) => m.index)).toEqual([1, 4, 8])
    const withGroups = matchRegex('(\\w+)@(\\w+)\\.(\\w+)', 'g', '联系 alice@example.com 或 bob@test.org')
    expect(withGroups).toHaveLength(2)
    expect(withGroups[0]?.groups).toEqual(['alice', 'example', 'com'])
    expect(withGroups[0]?.namedGroups).toEqual({})
    // i 标志
    expect(matchRegex('abc', 'gi', 'ABC abc AbC')).toHaveLength(3)
    // 非 g 只匹配一次
    expect(matchRegex('\\d', '', '1 2 3')).toHaveLength(1)
  })

  it('K2-4 正则非法输入抛错', () => {
    expect(() => matchRegex('(', '', 'x')).toThrow()
    expect(() => matchRegex('[a-', 'g', 'x')).toThrow()
  })

  it('K5-1 textDiff：新增行', () => {
    const lines = textDiff('a\nb', 'a\nb\nc')
    expect(lines.map((l) => [l.type, l.text])).toEqual([
      ['same', 'a'],
      ['same', 'b'],
      ['add', 'c'],
    ])
    expect(lines[2]?.newNo).toBe(3)
    expect(lines[2]?.oldNo).toBeUndefined()
  })

  it('K5-2 textDiff：删除行', () => {
    const lines = textDiff('a\nb\nc', 'a\nc')
    expect(lines.map((l) => [l.type, l.text])).toEqual([
      ['same', 'a'],
      ['del', 'b'],
      ['same', 'c'],
    ])
    expect(lines[1]?.oldNo).toBe(2)
  })

  it('K5-3 textDiff：修改行（词级高亮）', () => {
    const lines = textDiff('hello world', 'hello wasm')
    expect(lines.map((l) => l.type)).toEqual(['del', 'add'])
    const del = lines[0]
    const add = lines[1]
    expect(del?.segments).toEqual([
      { type: 'same', text: 'hello ' },
      { type: 'del', text: 'world' },
    ])
    expect(add?.segments).toEqual([
      { type: 'same', text: 'hello ' },
      { type: 'add', text: 'wasm' },
    ])
  })

  it('K5-4 textDiff：完全一致与多行混合', () => {
    expect(textDiff('x\ny', 'x\ny').every((l) => l.type === 'same')).toBe(true)
    const lines = textDiff('const a = 1;\nconst b = 2;\nkeep\nold1\nold2', 'const a = 1;\nconst b = 3;\nkeep\nnew1')
    const types = lines.map((l) => l.type)
    expect(types).toEqual(['same', 'del', 'add', 'same', 'del', 'del', 'add'])
    // 修改行 const b：词级细分
    const changed = lines[1]
    expect(changed?.segments).toContainEqual({ type: 'del', text: '2;' })
    expect(lines[2]?.segments).toContainEqual({ type: 'add', text: '3;' })
    expect(lines[6]?.segments).toContainEqual({ type: 'add', text: 'new1' })
  })

  it('K6-1 parseCron：*/5 * * * *（每 5 分钟，下次为 5 的倍数分钟）', () => {
    const from = new Date(2026, 7, 15, 10, 32, 30)
    const r = parseCron('*/5 * * * *', from)
    expect(r.humanReadable).toBe('每 5 分钟')
    expect(r.next.getTime()).toBe(new Date(2026, 7, 15, 10, 35, 0).getTime())
    expect(r.next.getMinutes() % 5).toBe(0)
    expect(r.next.getTime()).toBeGreaterThan(from.getTime())
  })

  it('K6-2 parseCron：0 9 * * 1-5（工作日 9 点）', () => {
    const r = parseCron('0 9 * * 1-5', new Date(2026, 7, 14, 10, 0, 0)) // 2026-08-14 周五 10:00
    expect(r.humanReadable).toBe('每个工作日 09:00')
    expect(r.next.getTime()).toBe(new Date(2026, 7, 17, 9, 0, 0).getTime()) // 下周一 09:00
    const sameDay = parseCron('0 9 * * 1-5', new Date(2026, 7, 14, 8, 0, 0))
    expect(sameDay.next.getTime()).toBe(new Date(2026, 7, 14, 9, 0, 0).getTime()) // 当天 09:00
  })

  it('K6-3 parseCron：常见表达的中文描述', () => {
    expect(parseCron('* * * * *', new Date(2026, 7, 15)).humanReadable).toBe('每分钟')
    expect(parseCron('0 0 * * *', new Date(2026, 7, 15)).humanReadable).toBe('每天 00:00')
    expect(parseCron('30 8 1 * *', new Date(2026, 7, 15)).humanReadable).toBe('每月 1 日 08:30')
    expect(parseCron('0 9 * * 0', new Date(2026, 7, 15)).humanReadable).toBe('每周日 09:00')
    expect(parseCron('0,30 * * * *', new Date(2026, 7, 15)).humanReadable).toBe('每小时的第 0、30 分钟')
  })

  it('K6-4 parseCron：非法表达式抛错', () => {
    expect(() => parseCron('99 * * * *')).toThrow() // 分钟越界
    expect(() => parseCron('* 25 * * *')).toThrow() // 小时越界
    expect(() => parseCron('* * 32 * *')).toThrow() // 日越界
    expect(() => parseCron('* * * 13 *')).toThrow() // 月越界
    expect(() => parseCron('* * * * 8')).toThrow() // 周越界（0–7）
    expect(() => parseCron('* * *')).toThrow() // 段数不足
    expect(() => parseCron('*/0 * * * *')).toThrow() // 步长为 0
    expect(() => parseCron('5-1 * * * *')).toThrow() // 区间倒置
    expect(() => parseCron('a * * * *')).toThrow() // 非数字
  })

  it('K6-5 nextCronRuns：下 N 次升序且均满足表达式', () => {
    const from = new Date(2026, 7, 15, 10, 10, 0)
    const runs = nextCronRuns('*/30 * * * *', 5, from)
    expect(runs).toHaveLength(5)
    expect(runs.map((d) => d.getMinutes())).toEqual([30, 0, 30, 0, 30])
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]?.getTime()).toBeGreaterThan(runs[i - 1]?.getTime() as number)
    }
    // 工作日 9 点：下次均落在周一至周五
    const weekdayRuns = nextCronRuns('0 9 * * 1-5', 5, new Date(2026, 7, 14, 10, 0, 0))
    expect(weekdayRuns).toHaveLength(5)
    for (const d of weekdayRuns) {
      expect(d.getDay()).toBeGreaterThanOrEqual(1)
      expect(d.getDay()).toBeLessThanOrEqual(5)
      expect(d.getHours()).toBe(9)
      expect(d.getMinutes()).toBe(0)
    }
  })
})
