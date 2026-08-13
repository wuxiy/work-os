import { useEffect, useState } from 'react'
import CryptoJS from 'crypto-js'
import { wb } from '@wb/plugin-kit'

type Tab = 'hash' | 'base64' | 'url' | 'aes' | 'jwt'

const TABS: { id: Tab; label: string }[] = [
  { id: 'hash', label: 'Hash' },
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'aes', label: 'AES' },
  { id: 'jwt', label: 'JWT' }
]

export default function App() {
  const [tab, setTab] = useState<Tab>('hash')
  const [input, setInput] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    wb.setExpendHeight(460)
    wb.onPluginEnter((e) => {
      if (typeof e.payload === 'string' && e.payload.trim()) setInput(e.payload)
    })
  }, [])

  function setResult(out: string, err = '') {
    setOutput(out)
    setError(err)
  }

  // --- hash ---
  const hashes = [
    { label: 'MD5', fn: () => CryptoJS.MD5(input).toString() },
    { label: 'SHA1', fn: () => CryptoJS.SHA1(input).toString() },
    { label: 'SHA256', fn: () => CryptoJS.SHA256(input).toString() },
    { label: 'SHA512', fn: () => CryptoJS.SHA512(input).toString() }
  ]

  // --- base64 ---
  const b64Encode = () =>
    setResult(CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(input)))
  const b64Decode = () => {
    try {
      setResult(CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(input.trim())))
    } catch {
      setResult('', 'Invalid Base64')
    }
  }

  // --- url ---
  const urlEncode = () => setResult(encodeURIComponent(input))
  const urlDecode = () => {
    try {
      setResult(decodeURIComponent(input))
    } catch {
      setResult('', 'Invalid URL-encoded text')
    }
  }

  // --- aes ---
  const aesEncrypt = () => {
    if (!passphrase) return setResult('', 'Enter a passphrase')
    setResult(CryptoJS.AES.encrypt(input, passphrase).toString())
  }
  const aesDecrypt = () => {
    if (!passphrase) return setResult('', 'Enter a passphrase')
    try {
      const decrypted = CryptoJS.AES.decrypt(input.trim(), passphrase).toString(CryptoJS.enc.Utf8)
      if (!decrypted) setResult('', 'Decryption failed (wrong passphrase or input)')
      else setResult(decrypted)
    } catch {
      setResult('', 'Decryption failed')
    }
  }

  // --- jwt ---
  const jwtDecode = () => {
    const part = input.trim().split('.')[1]
    if (!part) return setResult('', 'Not a JWT (no payload segment)')
    try {
      const json = CryptoJS.enc.Utf8.stringify(
        CryptoJS.enc.Base64.parse(part.replace(/-/g, '+').replace(/_/g, '/'))
      )
      setResult(JSON.stringify(JSON.parse(json), null, 2))
    } catch {
      setResult('', 'Invalid JWT payload')
    }
  }

  const actions: Record<Tab, { label: string; fn: () => void }[]> = {
    hash: hashes.map((h) => ({ label: h.label, fn: () => setResult(h.fn()) })),
    base64: [
      { label: 'Encode', fn: b64Encode },
      { label: 'Decode', fn: b64Decode }
    ],
    url: [
      { label: 'Encode', fn: urlEncode },
      { label: 'Decode', fn: urlDecode }
    ],
    aes: [
      { label: 'Encrypt', fn: aesEncrypt },
      { label: 'Decrypt', fn: aesDecrypt }
    ],
    jwt: [{ label: 'Decode', fn: jwtDecode }]
  }

  return (
    <div className="flex h-full flex-col bg-white text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="flex shrink-0 gap-1 border-b border-black/5 px-2 py-1.5 dark:border-white/5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id)
              setResult('')
            }}
            className={`rounded-md px-3 py-1 text-xs ${
              tab === t.id
                ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          placeholder={tab === 'jwt' ? 'Paste a JWT…' : 'Input…'}
          className="selectable mb-2 h-24 resize-none rounded-md border border-zinc-300 bg-transparent p-2 font-mono text-[13px] dark:border-zinc-600"
        />

        {tab === 'aes' && (
          <input
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            spellCheck={false}
            placeholder="Passphrase"
            className="selectable mb-2 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-[13px] dark:border-zinc-600"
          />
        )}

        <div className="mb-2 flex flex-wrap gap-1.5">
          {actions[tab].map((a) => (
            <button
              key={a.label}
              onClick={a.fn}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-zinc-600 dark:hover:bg-white/10"
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={() => wb.copyText(output)}
            disabled={!output}
            className="ml-auto rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-white/10"
          >
            Copy
          </button>
        </div>

        <pre className="selectable min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-md bg-zinc-50 p-2 font-mono text-[13px] text-emerald-600 dark:bg-zinc-800/50 dark:text-emerald-400">
          {error ? <span className="text-red-500">{error}</span> : output}
        </pre>
      </div>
    </div>
  )
}
