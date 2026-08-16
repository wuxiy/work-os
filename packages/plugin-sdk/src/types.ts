/** 与 Rust plugin_bridge 命令通信的数据契约（两侧保持一致） */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface HttpBody {
  kind: 'empty' | 'text' | 'json' | 'binary_b64'
  content: string
}

export interface HttpRequest {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body: HttpBody
  timeoutMs?: number
}

export interface HttpResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  bodyText: string | null
  bodyB64: string | null
  timeMs: number
  sizeBytes: number
}

export interface WsConnectOptions {
  headers?: Record<string, string>
  subprotocols?: string[]
}

export type WsDirection = 'in' | 'out' | 'system'

export interface WsMessageEvent {
  sessionId: string
  dir: WsDirection
  /** system 事件为状态文本；in/out 为消息文本或 base64(binary:) */
  data: string
  binary: boolean
  ts: number
}

export interface PluginEnterEvent {
  code: string
  type: 'text' | 'none'
  payload?: unknown
}

export type ThemeName = 'dark' | 'light'

export interface OpenDialogOptions {
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
  multiple?: boolean
}

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

export interface BridgeError {
  kind: 'permission-denied' | 'invalid-args' | 'not-found' | 'internal'
  message: string
}

declare global {
  interface Window {
    workos?: WorkosApi
    __TAURI__?: unknown
  }
}

export interface WorkosApi {
  clipboard: {
    readText(): Promise<string>
    writeText(text: string): Promise<void>
  }
  storage: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    remove(key: string): Promise<void>
    keys(): Promise<string[]>
  }
  http: {
    request(req: HttpRequest): Promise<HttpResponse>
  }
  ws: {
    connect(url: string, opts?: WsConnectOptions, onMessage?: (e: WsMessageEvent) => void): Promise<{ sessionId: string }>
    send(sessionId: string, data: string, binary?: boolean): Promise<void>
    close(sessionId: string): Promise<void>
  }
  secret: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    remove(key: string): Promise<void>
  }
  commands: {
    execute(id: string, payload?: unknown): Promise<unknown>
  }
  window: {
    setTitle(title: string): Promise<void>
  }
  notification: {
    show(title: string, body?: string): Promise<void>
  }
  dialog: {
    open(opts?: OpenDialogOptions): Promise<string | null | string[]>
    save(opts?: SaveDialogOptions): Promise<string | null>
  }
  theme: {
    get(): Promise<ThemeName>
    onChange(cb: (t: ThemeName) => void): void
  }
  lifecycle: {
    onPluginEnter(cb: (e: PluginEnterEvent) => void): void
    onPluginOut(cb: () => void): void
  }
}
