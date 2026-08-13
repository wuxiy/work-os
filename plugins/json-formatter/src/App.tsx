import { useEffect, useState } from 'react'
import { wb } from '@wb/plugin-kit'

type Mode = 'format' | 'minify'

export default function App() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    wb.setExpendHeight(440)
    wb.onPluginEnter((e) => {
      if (typeof e.payload === 'string' && e.payload.trim()) {
        setInput(e.payload)
        run('format', e.payload)
      }
    })
  }, [])

  function run(mode: Mode, source?: string) {
    const src = (source ?? input).trim()
    if (!src) {
      setOutput('')
      setError('')
      return
    }
    try {
      const obj = JSON.parse(src)
      setOutput(mode === 'minify' ? JSON.stringify(obj) : JSON.stringify(obj, null, 2))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setOutput('')
    }
  }

  return (
    <div className="flex h-full flex-col bg-white text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="flex shrink-0 items-center gap-2 border-b border-black/5 px-3 py-2 dark:border-white/5">
        <span className="text-sm font-medium">JSON</span>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => run('format')}
            className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Format
          </button>
          <button
            onClick={() => run('minify')}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-zinc-600 dark:hover:bg-white/10"
          >
            Minify
          </button>
          <button
            onClick={() => wb.copyText(output)}
            disabled={!output}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-white/10"
          >
            Copy
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          placeholder="Paste JSON here…"
          className="selectable min-h-0 resize-none border-r border-black/5 bg-transparent p-3 font-mono text-[13px] outline-none dark:border-white/5"
        />
        <div className="selectable min-h-0 overflow-auto p-3 font-mono text-[13px]">
          {error ? (
            <pre className="whitespace-pre-wrap text-red-500">{error}</pre>
          ) : (
            <pre className="whitespace-pre-wrap text-emerald-600 dark:text-emerald-400">{output}</pre>
          )}
        </div>
      </div>
    </div>
  )
}
