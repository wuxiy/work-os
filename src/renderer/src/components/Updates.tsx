import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/ipc/api'

const STATUS_TEXT: Record<UpdateState['status'], string> = {
  idle: 'Idle',
  checking: 'Checking for updates…',
  available: 'Update available',
  'not-available': 'You are up to date',
  downloading: 'Downloading update…',
  downloaded: 'Update downloaded — restart to install',
  error: 'Update check failed'
}

export default function Updates() {
  const [feedUrl, setFeedUrl] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [status, setStatus] = useState<UpdateState>({ status: 'idle' })
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    void window.api.getUpdateFeedUrl().then((url: string) => {
      setFeedUrl(url)
      setUrlDraft(url)
    })
    void window.api.getUpdateStatus().then(setStatus)
    const off = window.apiOn('update-status', (s) => setStatus(s as UpdateState))
    return off
  }, [])

  async function saveUrl() {
    await window.api.setUpdateFeedUrl(urlDraft.trim())
    setFeedUrl(urlDraft.trim())
  }

  async function check() {
    setChecking(true)
    try {
      setStatus(await window.api.checkForUpdates())
    } finally {
      setChecking(false)
    }
  }

  const isError = status.status === 'error'

  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-zinc-500">Updates</h2>
      <p className="mb-3 text-xs text-zinc-400">
        Work-OS checks an update feed (a directory of <code>latest.yml</code> /
        <code> latest-mac.yml</code> + installers published by
        <code> electron-builder</code>). Configure the feed URL, then check manually or
        restart to apply a downloaded update. macOS applying an update requires the build
        to be code-signed/notarized; detection works regardless.
      </p>

      <div className="mb-4 flex items-center gap-2">
        <input
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          spellCheck={false}
          placeholder="https://example.com/work-os-updates/"
          className="selectable min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-600"
        />
        <button
          onClick={saveUrl}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-zinc-600 dark:hover:bg-white/10"
        >
          Save
        </button>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <span className={`text-sm ${isError ? 'text-red-500' : 'text-zinc-700 dark:text-zinc-200'}`}>
          {STATUS_TEXT[status.status]}
          {status.version ? ` (v${status.version})` : ''}
        </span>
        {status.message && <span className="break-all text-xs text-zinc-400">{status.message}</span>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={check}
          disabled={checking}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {checking ? 'Checking…' : 'Check now'}
        </button>
        {status.status === 'downloaded' && (
          <button
            onClick={() => void window.api.quitAndInstall()}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
          >
            Install &amp; restart
          </button>
        )}
      </div>
    </section>
  )
}
