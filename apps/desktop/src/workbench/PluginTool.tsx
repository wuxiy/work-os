import { useEffect, useRef } from 'react'
import { ipc } from '../lib/ipc'
import { useRoute } from '../lib/store'

/** 延迟隐藏：规避 React StrictMode 双挂载时的瞬时 unmount */
const pendingHide = new Map<string, number>()

/**
 * 插件 Surface 宿主容器：把插件的子 WebView 精确对位到本组件的矩形区域。
 * 插件 UI 全部运行在隔离 WebView 中（技术架构 §10），本组件只负责布局与进入事件。
 */
export function PluginTool({ pluginId }: { pluginId: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const enter = useRoute().enter

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 取消待隐藏任务（StrictMode 快速重挂载场景）
    const pending = pendingHide.get(pluginId)
    if (pending) {
      cancelAnimationFrame(pending)
      pendingHide.delete(pluginId)
    }

    const report = (initial: boolean) => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 10 || rect.height < 10) return
      const surfaceRect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
      if (initial) {
        const enterPayload = enter
          ? { code: enter.code ?? 'open', type: 'text' as const, payload: enter.payload }
          : { code: 'open', type: 'none' as const }
        void ipc.surfaceOpen(pluginId, surfaceRect, enterPayload).catch((e) => ipc.debugLog(`surface_open failed: ${String(e)}`))
      } else {
        void ipc.surfaceUpdateRect(pluginId, surfaceRect).catch(() => {})
      }
    }

    report(true)
    const observer = new ResizeObserver(() => report(false))
    observer.observe(el)
    return () => {
      observer.disconnect()
      const raf = requestAnimationFrame(() => {
        pendingHide.delete(pluginId)
        void ipc.surfaceHide(pluginId)
      })
      pendingHide.set(pluginId, raf)
    }
  }, [pluginId, enter])

  return (
    <div className="h-full w-full p-0">
      <div ref={ref} className="h-full w-full overflow-hidden rounded-app border border-app-border bg-app-panel" />
    </div>
  )
}
