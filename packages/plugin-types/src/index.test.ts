import { describe, expect, it } from 'vitest'
import { validateManifest } from './index'

const base = {
  schemaVersion: 1,
  id: 'dev.workos.tool.json-tools',
  name: 'JSON 工具',
  version: '0.1.0',
  type: 'ui',
  apiVersion: '1',
  entry: 'dist/index.html',
}

describe('validateManifest', () => {
  it('接受合法 ui manifest', () => {
    const r = validateManifest(base)
    expect(r.ok).toBe(true)
  })

  it('接受合法 manual manifest', () => {
    const r = validateManifest({
      schemaVersion: 1,
      id: 'dev.workos.manual.linux',
      name: 'Linux Manual',
      version: '1.8.0',
      type: 'manual',
      apiVersion: '1',
      manual: { provider: 'static', index: 'dist/index.json', content: 'dist/content' },
    })
    expect(r.ok).toBe(true)
  })

  it('拒绝缺失字段', () => {
    const r = validateManifest({ ...base, version: undefined })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some((e) => e.field === 'version')).toBe(true)
  })

  it('拒绝非法 type', () => {
    const r = validateManifest({ ...base, type: 'widget' })
    expect(r.ok).toBe(false)
  })

  it('拒绝非法版本号', () => {
    const r = validateManifest({ ...base, version: 'v0.1' })
    expect(r.ok).toBe(false)
  })

  it('ui 类型缺少 entry 被拒', () => {
    const r = validateManifest({ ...base, entry: undefined })
    expect(r.ok).toBe(false)
  })

  it('manual 类型缺少 manual 配置被拒', () => {
    const r = validateManifest({ ...base, type: 'manual' })
    expect(r.ok).toBe(false)
  })

  it('高危权限 filesystem/shell 不在 V0.1 权限集，声明即校验失败', () => {
    const r = validateManifest({ ...base, permissions: ['shell.execute'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some((e) => e.field.startsWith('permissions'))).toBe(true)
  })

  it('命令 id 重复被拒', () => {
    const r = validateManifest({
      ...base,
      commands: [
        { id: 'json.format', title: 'A' },
        { id: 'json.format', title: 'B' },
      ],
    })
    expect(r.ok).toBe(false)
  })
})
