import { describe, expect, it } from 'vitest'
import { CommandRegistry } from './index'

describe('CommandRegistry（验收 D1）', () => {
  it('注册与查询', () => {
    const r = new CommandRegistry()
    r.register({ id: 'theme.toggle', title: '切换主题', source: 'core', kind: 'core-action' })
    expect(r.get('theme.toggle')?.title).toBe('切换主题')
    expect(r.list()).toHaveLength(1)
  })

  it('重复 id 注册被拒绝', () => {
    const r = new CommandRegistry()
    r.register({ id: 'a.b', title: 'A', source: 'core', kind: 'core-action' })
    expect(() => r.register({ id: 'a.b', title: 'B', source: 'core', kind: 'core-action' })).toThrow(/重复/)
  })

  it('runtime 注册可覆盖，unregisterBySource 可整体移除', () => {
    const r = new CommandRegistry()
    r.register({ id: 'json.format', title: 'JSON 格式化', source: 'dev.workos.tool.json-tools', kind: 'open-plugin' })
    r.registerRuntime({ id: 'json.format', title: 'JSON 格式化（新版）', source: 'dev.workos.tool.json-tools', kind: 'open-plugin' })
    expect(r.get('json.format')?.title).toContain('新版')
    r.unregisterBySource('dev.workos.tool.json-tools')
    expect(r.get('json.format')).toBeUndefined()
  })

  it('execute 未绑定处理器的 core-action 报错', async () => {
    const r = new CommandRegistry()
    r.register({ id: 'x.y', title: 'X', source: 'core', kind: 'core-action' })
    await expect(r.execute('x.y')).rejects.toThrow(/未绑定/)
    await expect(r.execute('nope')).rejects.toThrow(/不存在/)
  })

  it('搜索按 title/keywords 命中并降序', () => {
    const r = new CommandRegistry()
    r.register({ id: 'json.format', title: 'JSON 格式化', source: 'core', kind: 'core-action' })
    r.register({ id: 'dev.open', title: '打开开发者工具', keywords: ['dev', '开发'], source: 'core', kind: 'core-action' })
    const res = r.search('json')
    expect(res.map((c) => c.id)).toContain('json.format')
    expect(r.search('开发').map((c) => c.id)).toContain('dev.open')
    expect(r.search('完全不匹配的词')).toHaveLength(0)
  })
})
