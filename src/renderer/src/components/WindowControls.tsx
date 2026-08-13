import { useEffect, useState } from 'react'

/**
 * Windows has no native traffic lights (we're frameless), so we paint our own
 * min/close buttons. macOS uses `titleBarStyle: hiddenInset` and needs none.
 */
export default function WindowControls() {
  const [isWin, setIsWin] = useState(false)
  useEffect(() => {
    setIsWin(window.host?.platform === 'win32')
  }, [])
  if (!isWin) return null

  return (
    <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        aria-label="Minimize"
        onClick={() => window.api.showMainWindow()}
        className="grid h-8 w-8 place-items-center text-zinc-500 hover:bg-zinc-500/15 dark:text-zinc-400"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        aria-label="Close"
        onClick={() => window.api.quitApp()}
        className="grid h-8 w-8 place-items-center text-zinc-500 hover:bg-red-500 hover:text-white dark:text-zinc-400"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path
            d="M1 1l8 8M9 1l-8 8"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
