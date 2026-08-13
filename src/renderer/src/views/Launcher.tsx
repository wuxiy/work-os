import { useEffect, useRef, useState } from 'react'
import { useStore } from '../stores/useStore'
import WindowControls from '../components/WindowControls'

export default function Launcher() {
  const store = useStore()
  const {
    ready,
    query,
    results,
    selectedIndex,
    mode,
    activePluginName,
    subInput,
    setQuery,
    moveSelection,
    activateSelected,
    exitPlugin,
    typeSubInput
  } = store

  const [isMac, setIsMac] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsMac(window.host?.platform === 'darwin')
    // Focus the input + refresh trigger context whenever we return to launcher
    // mode or the window gains focus (clipboard/frontmost window may have changed).
    const onActivate = () => {
      inputRef.current?.focus()
      void useStore.getState().refreshContext()
    }
    onActivate()
    window.addEventListener('focus', onActivate)
    return () => window.removeEventListener('focus', onActivate)
  }, [])

  useEffect(() => {
    if (mode === 'launcher') inputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode === 'plugin') {
        if (e.key === 'Escape') {
          e.preventDefault()
          exitPlugin()
        }
        return
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          moveSelection(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          moveSelection(-1)
          break
        case 'Enter':
          e.preventDefault()
          activateSelected()
          break
        case 'Escape':
          if (query) setQuery('')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, query, moveSelection, activateSelected, exitPlugin, setQuery])

  return (
    <div className="flex h-full flex-col">
      {/* Header: search bar (launcher) or plugin bar (plugin). Height = 56px,
          matching SEARCH_BAR_HEIGHT in the runner so the plugin view lines up. */}
      <header
        className="flex h-14 shrink-0 items-center gap-2 border-b border-black/5 px-3 dark:border-white/5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className={`flex items-center gap-2 ${isMac ? 'ml-[68px]' : ''}`} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {mode === 'plugin' ? (
            <>
              <button
                onClick={exitPlugin}
                className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10"
                aria-label="Back"
              >
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {subInput.enabled ? (
                <input
                  value={subInput.value}
                  onChange={(e) => typeSubInput(e.target.value)}
                  spellCheck={false}
                  placeholder={subInput.placeholder}
                  className="w-full bg-transparent text-[15px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                />
              ) : (
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{activePluginName}</span>
              )}
              <button
                onClick={() => void window.api.detachActivePlugin()}
                title="Open in new window"
                className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10"
                aria-label="Open in new window"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M9 2.5h4.5V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.5 2.5L8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M11.5 9.5v3.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <svg className="h-4 w-4 text-zinc-400" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools and plugins…"
                spellCheck={false}
                className="w-full bg-transparent text-[15px] text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              />
            </>
          )}
        </div>
        <div className="ml-auto">
          <WindowControls />
        </div>
      </header>

      {/* Results (launcher mode). In plugin mode this region is covered by the
          plugin's WebContentsView, so we render nothing. */}
      {mode === 'launcher' && (
        <div className="flex-1 overflow-y-auto py-1">
          {!ready ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">Loading…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">No matching tools.</div>
          ) : (
            <ul>
              {results.map((r, i) => (
                <li
                  key={`${r.pluginId}-${r.feature.code}-${i}`}
                  onMouseEnter={() => useStore.setState({ selectedIndex: i })}
                  onClick={() => {
                    useStore.setState({ selectedIndex: i })
                    activateSelected()
                  }}
                  className={`mx-2 flex cursor-default items-center gap-3 rounded-lg px-3 py-2 ${
                    i === selectedIndex
                      ? 'bg-blue-500/15 dark:bg-blue-400/20'
                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  {r.logo ? (
                    <img src={r.logo} alt="" className="h-7 w-7 shrink-0 rounded-md" draggable={false} />
                  ) : (
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-zinc-200 text-xs text-zinc-500 dark:bg-zinc-700">
                      {r.pluginName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {r.feature.explain || r.feature.code}
                    </div>
                    <div className="truncate text-xs text-zinc-400">{r.pluginName}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex items-center justify-between px-4 py-2 text-[11px] text-zinc-400">
            <span>↑↓ select · ⏎ open · esc clear</span>
            <button
              onClick={() => window.api.openSettings()}
              className="rounded px-2 py-0.5 hover:bg-black/5 dark:hover:bg-white/10"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              Settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
