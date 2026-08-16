import { describe, expect, it } from 'vitest'
import {
  diffJson,
  escapeJsonString,
  formatJson,
  jsonPath,
  jsonToTypescript,
  jsonToYaml,
  minifyJson,
  unescapeJsonString,
  validateJson,
  yamlToJson,
} from './features'

const SAMPLE = '{"name":"work-os","version":"0.4","tags":["launcher","plugin"],"meta":{"local":true,"count":2}}'

describe('JSON Workbench（验收 G1–G6）', () => {
  it('G1 格式化与压缩往返', () => {
    const formatted = formatJson(SAMPLE, 2)
    expect(formatted.split('\n').length).toBeGreaterThan(3)
    expect(formatted).toContain('"name": "work-os"')
    expect(minifyJson(formatted)).toBe(SAMPLE)
    expect(formatJson(SAMPLE, 4)).toContain('    "name"')
  })

  it('G1 校验：合法/非法与行列定位', () => {
    expect(validateJson(SAMPLE).ok).toBe(true)
    const bad = '{\n  "a": 1,\n  "b": }\n}'
    const r = validateJson(bad)
    expect(r.ok).toBe(false)
    expect(r.line).toBe(3)
    expect(r.column).toBeGreaterThan(0)
  })

  it('G2 转义/反转义往返一致', () => {
    const s = '{"a":"=\\"x\\"\\n\\t}"}'
    const escaped = escapeJsonString(s)
    expect(escaped).not.toContain('{"a"')
    expect(unescapeJsonString(escaped)).toBe(s)
    // 含中文与反斜杠
    const s2 = '中文\\内容"引号'
    expect(unescapeJsonString(escapeJsonString(s2))).toBe(s2)
  })

  it('G3 JSONPath 基本查询', () => {
    const doc = { store: { book: [{ title: 'A', price: 5 }, { title: 'B', price: 15 }], bicycle: { color: 'red' } } }
    expect(jsonPath(doc, '$.store.book[0].title')).toEqual(['A'])
    expect(jsonPath(doc, '$.store.bicycle.color')).toEqual(['red'])
    expect(jsonPath(doc, '$.store.book[*].title')).toEqual(['A', 'B'])
    expect(jsonPath(doc, '$.store.book[1:].title')).toEqual(['B'])
    expect(jsonPath(doc, '$..price')).toEqual([5, 15])
    expect(jsonPath(doc, '$.nothing.here')).toEqual([])
  })

  it('G4 结构化 Diff', () => {
    const l = { a: 1, b: { c: 2 }, arr: [1, 2, 3] }
    const r = { a: 1, b: { c: 9 }, arr: [1, 2], d: 'new' }
    const diffs = diffJson(l, r)
    expect(diffs).toHaveLength(3)
    expect(diffs.find((d) => d.path === '$.b.c')?.type).toBe('changed')
    expect(diffs.find((d) => d.path === '$.arr[2]')?.type).toBe('removed')
    expect(diffs.find((d) => d.path === '$.d')?.type).toBe('added')
    expect(diffJson(l, JSON.parse(JSON.stringify(l)))).toEqual([])
  })

  it('G5 JSON ⇄ YAML 往返语义等价', () => {
    const y = jsonToYaml(SAMPLE)
    expect(y).toContain('name: work-os')
    const back = JSON.parse(yamlToJson(y))
    expect(back).toEqual(JSON.parse(SAMPLE))
  })

  it('G6 JSON → TypeScript 类型生成', () => {
    const ts = jsonToTypescript('user', '{"id":1,"name":"a","active":null,"tags":["x"],"profile":{"email":"e"}}')
    expect(ts).toContain('export interface Profile')
    expect(ts).toContain('email: string')
    expect(ts).toContain('id: number')
    expect(ts).toContain('name: string')
    expect(ts).toContain('active: null')
    expect(ts).toContain('tags: string[]')
    expect(ts).toContain('profile: Profile')
    expect(ts).toContain('export type User =')
  })
})
