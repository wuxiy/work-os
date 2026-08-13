import { useEffect, useRef, useState } from 'react'
import { wb } from '@wb/plugin-kit'

type Direction = 'in' | 'out' | 'system'
interface LogEntry {
  id: number
  dir: Direction
  text: string
  time: string
}

const now = () => new Date().toLocaleTimeString([], { hour12: false })

export default function App() {
  const [url, setUrl] = useState('wss://echo.websocket.org')
  const [connected, setConnected] = useState(false)
  const [sendText, setSendText] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const idRef = useRef(0)

  useEffect(() => {
    wb.setExpendHeight(460)
    wb.onPluginEnter(() => {})
    return () => {
      wsRef.current?.close()
    }
  }, [])

  function push(dir: Direction, text: string) {
    setLog((prev) => [...prev, { id: idRef.current++, dir, text, time: now() }].slice(-200))
  }

  function connect() {
    const target = url.trim()
    if (!target || connected) return
    try {
      const ws = new WebSocket(target)
      ws.onopen = () => {
        setConnected(true)
        push('system', `Connected to ${target}`)
      }
      ws.onmessage = (ev) => push('in', typeof ev.data === 'string' ? ev.data : '(binary)')
      ws.onclose = () => {
        setConnected(false)
        push('system', 'Connection closed')
      }
      ws.onerror = () => push('system', 'Connection error')
      wsRef.current = ws
    } catch (err) {
      push('system', err instanceof Error ? err.message : String(err))
    }
  }

  function disconnect() {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
  }

  function send() {
    const ws = wsRef.current
    const text = sendText
    if (!ws || !text || ws.readyState !== WebSocket.OPEN) return
    ws.send(text)
    push('out', text)
    setSendText('')
  }

  const colorFor: Record<Direction, string> = {
    in: 'text-emerald-600 dark:text-emerald-400',
    out: 'text-sky-600 dark:text-sky-400',
    system: 'text-zinc-400 italic'
  }

  return (
    <div className="flex h-full flex-col bg-white text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/5 px-3 py-2 dark:border-white/5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          placeholder="wss://host/path"
          className="selectable min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 font-mono text-[13px] dark:border-zinc-600"
        />
        {connected ? (
          <button
            onClick={disconnect}
            className="rounded-md bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={connect}
            className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700"
          >
            Connect
          </button>
        )}
      </div>

      <div className="selectable min-h-0 flex-1 overflow-auto p-3 font-mono text-[12px]">
        {log.length === 0 ? (
          <div className="text-zinc-400">Messages will appear here.</div>
        ) : (
          log.map((e) => (
            <div key={e.id} className="py-0.5">
              <span className="mr-2 text-zinc-400">{e.time}</span>
              <span className={`mr-2 font-semibold uppercase ${colorFor[e.dir]}`}>{e.dir}</span>
              <span className="whitespace-pre-wrap break-all">{e.text}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-black/5 px-3 py-2 dark:border-white/5">
        <textarea
          value={sendText}
          onChange={(e) => setSendText(e.target.value)}
          placeholder="Message to send…"
          rows={1}
          className="selectable min-h-0 flex-1 resize-none rounded-md border border-zinc-300 bg-transparent px-2 py-1 font-mono text-[13px] dark:border-zinc-600"
        />
        <button
          onClick={send}
          className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      </div>
    </div>
  )
}
