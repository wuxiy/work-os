import { describe, expect, it, vi, beforeAll } from 'vitest'
import { definePlugin } from './index'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ok: true, data: null }),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

// node 环境无 window：用 globalThis 充当（SDK 内部均有 typeof window 守卫）
beforeAll(() => {
  ;(globalThis as unknown as Record<string, unknown>).window = globalThis
})

describe('definePlugin（验收 E4）', () => {
  it('激活并挂载 window.workos', () => {
    const registered: unknown[] = []
    const api = definePlugin({
      activate(ctx) {
        expect(ctx.workos).toBeTruthy()
        ctx.commands.register({ id: 'json.format', title: 'JSON 格式化' })
      },
    })
    expect(api).toBeTruthy()
    expect(window.workos).toBe(api)
    expect(registered).toHaveLength(0)
  })

  it('window.__TAURI__ 未被 SDK 定义（隔离约束 E3）', () => {
    expect(window.__TAURI__).toBeUndefined()
    expect(typeof window.workos?.clipboard.writeText).toBe('function')
  })
})
