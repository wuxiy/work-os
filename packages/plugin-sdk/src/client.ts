import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  HttpBody,
  HttpRequest,
  HttpResponse,
  OpenDialogOptions,
  PluginEnterEvent,
  SaveDialogOptions,
  ThemeName,
  WsConnectOptions,
  WsMessageEvent,
  WorkosApi,
} from './types'

/** 请求体辅助（供插件构造 HttpBody） */
export const body = {
  empty(): HttpBody {
    return { kind: 'empty', content: '' }
  },
  text(t: string): HttpBody {
    return { kind: 'text', content: t }
  },
  json(v: unknown): HttpBody {
    return { kind: 'json', content: JSON.stringify(v) }
  },
  /** base64 编码的原始字节 */
  binary(b64: string): HttpBody {
    return { kind: 'binary_b64', content: b64 }
  },
}

interface BridgeResponse<T> {
  ok: boolean
  data?: T
  error?: { kind: string; message: string }
}

async function bridge<T>(api: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await invoke<BridgeResponse<T>>('plugin_bridge', { api, args })
  if (!res.ok) {
    const err = new Error(res.error?.message ?? 'bridge error') as Error & { kind?: string }
    err.kind = res.error?.kind
    throw err
  }
  return res.data as T
}

/**
 * 创建 window.workos 客户端。
 * 插件必须通过本 API 访问系统能力，所有调用经 Permission Broker 校验（技术架构 §10、§13）。
 */
export function createWorkos(): WorkosApi {
  const themeListeners: Array<(t: ThemeName) => void> = []
  const enterListeners: Array<(e: PluginEnterEvent) => void> = []
  const outListeners: Array<() => void> = []
  const wsListeners = new Map<string, (e: WsMessageEvent) => void>()

  let started = false
  async function ensureEvents(): Promise<void> {
    if (started) return
    started = true
    await listen<ThemeName>('workos://theme', (e) => {
      for (const cb of themeListeners) cb(e.payload)
    })
    await listen<PluginEnterEvent>('workos://enter', (e) => {
      for (const cb of enterListeners) cb(e.payload)
    })
    await listen('workos://out', () => {
      for (const cb of outListeners) cb()
    })
    await listen<WsMessageEvent>('workos://ws', (e) => {
      const cb = wsListeners.get(e.payload.sessionId)
      if (cb) cb(e.payload)
    })
  }
  void ensureEvents()

  return {
    clipboard: {
      readText: () => bridge<string>('clipboard.readText'),
      writeText: (text) => bridge<void>('clipboard.writeText', { text }),
    },
    storage: {
      get: (key) => bridge<string | null>('storage.get', { key }),
      set: (key, value) => bridge<void>('storage.set', { key, value }),
      remove: (key) => bridge<void>('storage.remove', { key }),
      keys: () => bridge<string[]>('storage.keys'),
    },
    http: {
      request: (req: HttpRequest) => bridge<HttpResponse>('http.request', { req }),
    },
    ws: {
      connect: async (url, opts?, onMessage?) => {
        const { sessionId } = await bridge<{ sessionId: string }>('ws.connect', { url, opts: opts ?? {} })
        if (onMessage) wsListeners.set(sessionId, onMessage)
        return { sessionId }
      },
      send: (sessionId, data, binary = false) => bridge<void>('ws.send', { sessionId, data, binary }),
      close: (sessionId) => {
        wsListeners.delete(sessionId)
        return bridge<void>('ws.close', { sessionId })
      },
    },
    secret: {
      get: (key) => bridge<string | null>('secret.get', { key }),
      set: (key, value) => bridge<void>('secret.set', { key, value }),
      remove: (key) => bridge<void>('secret.remove', { key }),
    },
    commands: {
      execute: (id, payload) => bridge<unknown>('commands.execute', { id, payload }),
    },
    window: {
      setTitle: (title) => bridge<void>('window.setTitle', { title }),
    },
    notification: {
      show: (title, bodyText) => bridge<void>('notification.show', { title, body: bodyText }),
    },
    dialog: {
      open: (opts?: OpenDialogOptions) => bridge<string | null | string[]>('dialog.open', { opts: opts ?? {} }),
      save: (opts?: SaveDialogOptions) => bridge<string | null>('dialog.save', { opts: opts ?? {} }),
    },
    theme: {
      get: () => bridge<ThemeName>('theme.get'),
      onChange(cb) {
        themeListeners.push(cb)
      },
    },
    lifecycle: {
      onPluginEnter(cb) {
        enterListeners.push(cb)
        // 注册晚于 host 首次 emit 时，host 会在 ready ack 后重发
        void bridge<void>('lifecycle.ready', {})
      },
      onPluginOut(cb) {
        outListeners.push(cb)
      },
    },
  }
}
