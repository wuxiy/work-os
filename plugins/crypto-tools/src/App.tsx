import { useEffect, useMemo, useState } from 'react'
import type { WorkosApi } from '@work-os/plugin-sdk'
import {
  aesDecrypt,
  aesEncrypt,
  base64Decode,
  base64Encode,
  decodeJwt,
  hexDecode,
  hexEncode,
  hmac,
  md5,
  rsaDecrypt,
  rsaEncrypt,
  rsaGenerateKeyPair,
  rsaSign,
  rsaVerify,
  sha1,
  sha256,
  sha512,
  unicodeDecode,
  unicodeEncode,
  urlDecode,
  urlEncode,
} from './features'
import type { HashAlgo } from './features'

// ---------- 公共类型与工具 ----------

type TabId = 'codec' | 'hash' | 'hmac' | 'aes' | 'rsa' | 'jwt'

const TABS: Array<{ id: TabId; title: string }> = [
  { id: 'codec', title: '编码 / 解码' },
  { id: 'hash', title: '哈希' },
  { id: 'hmac', title: 'HMAC' },
  { id: 'aes', title: 'AES' },
  { id: 'rsa', title: 'RSA' },
  { id: 'jwt', title: 'JWT' },
]

interface PanelCtx {
  copy: (key: string, text: string) => void
  copiedKey: string
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function CopyButton({ ctx, k, text, label }: { ctx: PanelCtx; k: string; text: string; label?: string }): JSX.Element {
  return (
    <button className="btn ghost" style={{ height: 24, padding: '0 8px', flex: 'none' }} onClick={() => ctx.copy(k, text)} disabled={!text}>
      {ctx.copiedKey === k ? '已复制 ✓' : (label ?? '复制')}
    </button>
  )
}

function fmtTime(sec: number | null): string {
  if (sec === null) return '—'
  return `${new Date(sec * 1000).toLocaleString('zh-CN', { hour12: false })}（${sec}）`
}

// ---------- 编码 / 解码 ----------

type Scheme = 'base64' | 'url' | 'hex' | 'unicode'

const SCHEMES: Array<{ id: Scheme; title: string }> = [
  { id: 'base64', title: 'Base64' },
  { id: 'url', title: 'URL' },
  { id: 'hex', title: 'Hex' },
  { id: 'unicode', title: 'Unicode' },
]

const ENCODERS: Record<Scheme, (s: string) => string> = { base64: base64Encode, url: urlEncode, hex: hexEncode, unicode: unicodeEncode }
const DECODERS: Record<Scheme, (s: string) => string> = { base64: base64Decode, url: urlDecode, hex: hexDecode, unicode: unicodeDecode }

function CodecPanel({ ctx, input, setInput }: { ctx: PanelCtx; input: string; setInput: (s: string) => void }): JSX.Element {
  const [scheme, setScheme] = useState<Scheme>('base64')
  const [decode, setDecode] = useState(false)

  const result = useMemo(() => {
    if (!input) return { text: '', error: '' }
    try {
      return { text: (decode ? DECODERS[scheme] : ENCODERS[scheme])(input), error: '' }
    } catch (e) {
      return { text: '', error: errText(e) }
    }
  }, [input, scheme, decode])

  return (
    <div className="col">
      <div className="row">
        <div className="tabs">
          {SCHEMES.map((s) => (
            <button key={s.id} className={`tab ${scheme === s.id ? 'active' : ''}`} onClick={() => setScheme(s.id)}>
              {s.title}
            </button>
          ))}
        </div>
        <div className="tabs">
          <button className={`tab ${!decode ? 'active' : ''}`} onClick={() => setDecode(false)}>
            编码 →
          </button>
          <button className={`tab ${decode ? 'active' : ''}`} onClick={() => setDecode(true)}>
            ← 解码
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <CopyButton ctx={ctx} k={`codec-${scheme}`} text={result.text} label="复制结果" />
        <button
          className="btn secondary"
          disabled={!result.text}
          onClick={() => {
            setInput(result.text)
            setDecode(!decode)
          }}
        >
          ⇄ 交换
        </button>
      </div>
      <div className="row" style={{ flex: 1, minHeight: 0 }}>
        <div className="col">
          <span className="label">{decode ? `${SCHEMES.find((s) => s.id === scheme)!.title} 密文` : '输入文本'}</span>
          <textarea
            className="editor"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            data-selectable
            spellCheck={false}
            placeholder="输入内容，实时转换…"
          />
        </div>
        <div className="col">
          <span className="label">{decode ? '解码结果' : `${SCHEMES.find((s) => s.id === scheme)!.title} 编码结果`}</span>
          <textarea className="editor" value={result.text} readOnly data-selectable spellCheck={false} placeholder="结果…" />
        </div>
      </div>
      {result.error && <span className="badge err">{result.error}</span>}
    </div>
  )
}

// ---------- 哈希 ----------

function HashPanel({ ctx, input, setInput }: { ctx: PanelCtx; input: string; setInput: (s: string) => void }): JSX.Element {
  const hashes = useMemo(
    () => [
      { title: 'MD5', hex: md5(input) },
      { title: 'SHA-1', hex: sha1(input) },
      { title: 'SHA-256', hex: sha256(input) },
      { title: 'SHA-512', hex: sha512(input) },
    ],
    [input],
  )

  return (
    <div className="col">
      <span className="label">输入文本（UTF-8，实时计算四种哈希，hex 小写）</span>
      <textarea
        className="editor"
        style={{ height: 120 }}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        data-selectable
        spellCheck={false}
        placeholder="输入文本…"
      />
      {hashes.map((h) => (
        <div key={h.title} className="hash-row">
          <span className="hash-name">{h.title}</span>
          <span className="hash-value">{h.hex}</span>
          <CopyButton ctx={ctx} k={`hash-${h.title}`} text={h.hex} />
        </div>
      ))}
    </div>
  )
}

// ---------- HMAC ----------

type HmacAlgo = Extract<HashAlgo, 'sha1' | 'sha256' | 'sha512'>

function HmacPanel({ ctx }: { ctx: PanelCtx }): JSX.Element {
  const [algo, setAlgo] = useState<HmacAlgo>('sha256')
  const [key, setKey] = useState('')
  const [text, setText] = useState('')

  const result = useMemo(() => {
    if (!text && !key) return { hex: '', error: '' }
    try {
      return { hex: hmac(algo, key, text), error: '' }
    } catch (e) {
      return { hex: '', error: errText(e) }
    }
  }, [algo, key, text])

  return (
    <div className="col">
      <div className="row">
        <span className="label">算法</span>
        <select className="input" style={{ width: 150 }} value={algo} onChange={(e) => setAlgo(e.target.value as HmacAlgo)}>
          <option value="sha1">HMAC-SHA-1</option>
          <option value="sha256">HMAC-SHA-256</option>
          <option value="sha512">HMAC-SHA-512</option>
        </select>
        <span className="label" style={{ marginLeft: 8 }}>
          密钥
        </span>
        <input className="input" style={{ flex: 1 }} value={key} onChange={(e) => setKey(e.target.value)} placeholder="密钥（UTF-8）…" data-selectable />
      </div>
      <span className="label">消息文本</span>
      <textarea
        className="editor"
        style={{ flex: 1, minHeight: 80 }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-selectable
        spellCheck={false}
        placeholder="输入文本…"
      />
      <div className="hash-row">
        <span className="hash-name">HMAC</span>
        <span className="hash-value">{result.hex || '—'}</span>
        <CopyButton ctx={ctx} k="hmac-out" text={result.hex} />
      </div>
      {result.error && <span className="badge err">{result.error}</span>}
    </div>
  )
}

// ---------- AES ----------

interface Msg {
  ok: boolean
  text: string
}

function AesPanel({ ctx, initialPlain }: { ctx: PanelCtx; initialPlain: string }): JSX.Element {
  const [pass, setPass] = useState('')
  const [plain, setPlain] = useState(initialPlain)
  const [cipher, setCipher] = useState('')
  const [plainOut, setPlainOut] = useState('')
  const [msg, setMsg] = useState<Msg | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initialPlain) setPlain(initialPlain)
  }, [initialPlain])

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setMsg(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setMsg({ ok: false, text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  const doEncrypt = (): Promise<void> =>
    run(async () => {
      setCipher(await aesEncrypt(plain, pass))
    })

  const doDecrypt = (): Promise<void> =>
    run(async () => {
      setPlainOut(await aesDecrypt(cipher, pass))
    })

  /** 往返验证：加密当前明文 → 立即解密 → 比对 */
  const doRoundtrip = (): Promise<void> =>
    run(async () => {
      if (!plain) throw new Error('请输入明文')
      if (!pass) throw new Error('请输入密码')
      const enc = await aesEncrypt(plain, pass)
      const dec = await aesDecrypt(enc, pass)
      setCipher(enc)
      setPlainOut(dec)
      setMsg(dec === plain ? { ok: true, text: `往返验证通过 ✓（密文 ${enc.length} 字符，PBKDF2 10 万次派生）` } : { ok: false, text: '往返验证失败：解密结果与原文不一致' })
    })

  return (
    <div className="col" style={{ overflow: 'auto' }}>
      <div className="row">
        <span className="label">密码（口令，PBKDF2-SHA256 派生 AES-256-GCM 密钥）</span>
      </div>
      <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="输入密码…" data-selectable />
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="col">
          <span className="label">明文（待加密）</span>
          <textarea className="editor" style={{ height: 150 }} value={plain} onChange={(e) => setPlain(e.target.value)} data-selectable spellCheck={false} placeholder="明文…" />
          <div className="row">
            <button className="btn" disabled={busy || !pass || !plain} onClick={() => void doEncrypt()}>
              🔒 加密
            </button>
            <button className="btn secondary" disabled={busy || !pass || !plain} onClick={() => void doRoundtrip()}>
              往返验证
            </button>
          </div>
        </div>
        <div className="col">
          <span className="label">密文（Base64，自包含 iv + salt + ciphertext）</span>
          <textarea className="editor" style={{ height: 150 }} value={cipher} onChange={(e) => setCipher(e.target.value)} data-selectable spellCheck={false} placeholder="加密结果，或粘贴待解密密文…" />
          <span className="label">解密结果</span>
          <textarea className="editor" style={{ height: 60 }} value={plainOut} readOnly data-selectable spellCheck={false} placeholder="解密后的明文…" />
          <div className="row">
            <button className="btn" disabled={busy || !pass || !cipher} onClick={() => void doDecrypt()}>
              🔓 解密
            </button>
            <CopyButton ctx={ctx} k="aes-cipher" text={cipher} label="复制密文" />
          </div>
        </div>
      </div>
      {msg && <span className={`badge ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
    </div>
  )
}

// ---------- RSA ----------

function RsaPanel({ ctx }: { ctx: PanelCtx }): JSX.Element {
  // RSA-OAEP 加密 / 解密
  const [encPub, setEncPub] = useState('')
  const [encPriv, setEncPriv] = useState('')
  const [encIn, setEncIn] = useState('')
  const [encOut, setEncOut] = useState('')
  const [encDec, setEncDec] = useState('')
  // RSA-PSS 签名 / 验签
  const [signPub, setSignPub] = useState('')
  const [signPriv, setSignPriv] = useState('')
  const [signText, setSignText] = useState('')
  const [signature, setSignature] = useState('')
  const [verifyText, setVerifyText] = useState('')
  const [verifySig, setVerifySig] = useState('')
  const [verifyResult, setVerifyResult] = useState<Msg | null>(null)

  const [encMsg, setEncMsg] = useState<Msg | null>(null)
  const [signMsg, setSignMsg] = useState<Msg | null>(null)
  const [genEncBusy, setGenEncBusy] = useState(false)
  const [genSignBusy, setGenSignBusy] = useState(false)
  const [busy, setBusy] = useState(false)

  const genKeys = async (usage: 'encrypt' | 'sign'): Promise<void> => {
    const setBusyFlag = usage === 'sign' ? setGenSignBusy : setGenEncBusy
    const setMsgFn = usage === 'sign' ? setSignMsg : setEncMsg
    setBusyFlag(true)
    setMsgFn({ ok: true, text: '正在生成 RSA-2048 密钥对…' })
    try {
      const kp = await rsaGenerateKeyPair(usage)
      if (usage === 'sign') {
        setSignPub(kp.publicPem)
        setSignPriv(kp.privatePem)
      } else {
        setEncPub(kp.publicPem)
        setEncPriv(kp.privatePem)
      }
      setMsgFn({ ok: true, text: '密钥对已生成（PEM：spki / pkcs8）' })
    } catch (e) {
      setMsgFn({ ok: false, text: errText(e) })
    } finally {
      setBusyFlag(false)
    }
  }

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setEncMsg({ ok: false, text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  const doRsaEncrypt = (): Promise<void> =>
    run(async () => {
      setEncOut(await rsaEncrypt(encIn, encPub))
      setEncMsg({ ok: true, text: '加密完成（RSA-OAEP / SHA-256）' })
    })

  const doRsaDecrypt = (): Promise<void> =>
    run(async () => {
      setEncDec(await rsaDecrypt(encOut, encPriv))
      setEncMsg({ ok: true, text: '解密完成' })
    })

  const doSign = async (): Promise<void> => {
    setSignMsg(null)
    setBusy(true)
    try {
      setSignature(await rsaSign(signText, signPriv))
      setVerifyText(signText)
      setVerifySig(await rsaSign(signText, signPriv))
      setSignMsg({ ok: true, text: '签名完成（RSA-PSS / SHA-256，已同步到右侧验签）' })
    } catch (e) {
      setSignMsg({ ok: false, text: errText(e) })
    } finally {
      setBusy(false)
    }
  }

  const doVerify = async (): Promise<void> => {
    setSignMsg(null)
    setBusy(true)
    try {
      const ok = await rsaVerify(verifyText, verifySig, signPub)
      setVerifyResult({ ok, text: ok ? '✓ 验签通过：签名与文本匹配' : '✗ 验签失败：签名、文本或公钥不匹配' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="col" style={{ overflow: 'auto', gap: 12 }}>
      <section className="card">
        <div className="row">
          <span className="card-title">RSA-OAEP 加密 / 解密（RSA-2048 / SHA-256）</span>
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={genEncBusy} onClick={() => void genKeys('encrypt')}>
            {genEncBusy ? '生成中…' : '生成密钥对'}
          </button>
        </div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div className="col">
            <span className="label">公钥 PEM（加密用）</span>
            <textarea className="editor" style={{ height: 108 }} value={encPub} onChange={(e) => setEncPub(e.target.value)} data-selectable spellCheck={false} placeholder="-----BEGIN PUBLIC KEY-----…" />
            <CopyButton ctx={ctx} k="rsa-enc-pub" text={encPub} label="复制公钥" />
          </div>
          <div className="col">
            <span className="label">私钥 PEM（解密用）</span>
            <textarea className="editor" style={{ height: 108 }} value={encPriv} onChange={(e) => setEncPriv(e.target.value)} data-selectable spellCheck={false} placeholder="-----BEGIN PRIVATE KEY-----…" />
            <CopyButton ctx={ctx} k="rsa-enc-priv" text={encPriv} label="复制私钥" />
          </div>
        </div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div className="col">
            <span className="label">明文</span>
            <textarea className="editor" style={{ height: 90 }} value={encIn} onChange={(e) => setEncIn(e.target.value)} data-selectable spellCheck={false} placeholder="待加密文本…" />
            <div className="row">
              <button className="btn" disabled={busy || !encIn || !encPub} onClick={() => void doRsaEncrypt()}>
                加密
              </button>
            </div>
          </div>
          <div className="col">
            <span className="label">密文（Base64）</span>
            <textarea className="editor" style={{ height: 90 }} value={encOut} onChange={(e) => setEncOut(e.target.value)} data-selectable spellCheck={false} placeholder="加密结果，或粘贴待解密密文…" />
            <div className="row">
              <button className="btn" disabled={busy || !encOut || !encPriv} onClick={() => void doRsaDecrypt()}>
                解密
              </button>
              <CopyButton ctx={ctx} k="rsa-enc-out" text={encOut} label="复制密文" />
            </div>
          </div>
        </div>
        <div className="col">
          <span className="label">解密结果</span>
          <textarea className="editor" style={{ height: 60 }} value={encDec} readOnly data-selectable spellCheck={false} placeholder="解密后的明文…" />
        </div>
        {encMsg && <span className={`badge ${encMsg.ok ? 'ok' : 'err'}`}>{encMsg.text}</span>}
      </section>

      <section className="card">
        <div className="row">
          <span className="card-title">RSA-PSS 签名 / 验签（RSA-2048 / SHA-256 / saltLength 32）</span>
          <span style={{ flex: 1 }} />
          <button className="btn" disabled={genSignBusy} onClick={() => void genKeys('sign')}>
            {genSignBusy ? '生成中…' : '生成密钥对'}
          </button>
        </div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div className="col">
            <span className="label">公钥 PEM（验签用）</span>
            <textarea className="editor" style={{ height: 108 }} value={signPub} onChange={(e) => setSignPub(e.target.value)} data-selectable spellCheck={false} placeholder="-----BEGIN PUBLIC KEY-----…" />
            <CopyButton ctx={ctx} k="rsa-sign-pub" text={signPub} label="复制公钥" />
          </div>
          <div className="col">
            <span className="label">私钥 PEM（签名用）</span>
            <textarea className="editor" style={{ height: 108 }} value={signPriv} onChange={(e) => setSignPriv(e.target.value)} data-selectable spellCheck={false} placeholder="-----BEGIN PRIVATE KEY-----…" />
            <CopyButton ctx={ctx} k="rsa-sign-priv" text={signPriv} label="复制私钥" />
          </div>
        </div>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div className="col">
            <span className="label">待签名文本</span>
            <textarea className="editor" style={{ height: 90 }} value={signText} onChange={(e) => setSignText(e.target.value)} data-selectable spellCheck={false} placeholder="输入文本…" />
            <div className="row">
              <button className="btn" disabled={busy || !signText || !signPriv} onClick={() => void doSign()}>
                签名
              </button>
              <CopyButton ctx={ctx} k="rsa-sign-sig" text={signature} label="复制签名" />
            </div>
          </div>
          <div className="col">
            <span className="label">验签：文本</span>
            <textarea className="editor" style={{ height: 44 }} value={verifyText} onChange={(e) => setVerifyText(e.target.value)} data-selectable spellCheck={false} placeholder="待验证文本…" />
            <span className="label">验签：签名（Base64）</span>
            <textarea className="editor" style={{ height: 44 }} value={verifySig} onChange={(e) => setVerifySig(e.target.value)} data-selectable spellCheck={false} placeholder="签名 Base64…" />
            <div className="row">
              <button className="btn" disabled={busy || !verifyText || !verifySig || !signPub} onClick={() => void doVerify()}>
                验签
              </button>
              {verifyResult && <span className={`badge ${verifyResult.ok ? 'ok' : 'err'}`}>{verifyResult.text}</span>}
            </div>
          </div>
        </div>
        {signMsg && <span className={`badge ${signMsg.ok ? 'ok' : 'err'}`}>{signMsg.text}</span>}
      </section>
    </div>
  )
}

// ---------- JWT ----------

function JwtPanel({ ctx, initialToken }: { ctx: PanelCtx; initialToken: string }): JSX.Element {
  const [token, setToken] = useState(initialToken)

  useEffect(() => {
    if (initialToken) setToken(initialToken)
  }, [initialToken])

  const result = useMemo(() => {
    if (!token.trim()) return null
    try {
      return { ok: true as const, d: decodeJwt(token) }
    } catch (e) {
      return { ok: false as const, error: errText(e) }
    }
  }, [token])

  const statusBadge = (status: string): JSX.Element => {
    if (status === 'valid') return <span className="badge ok">✓ 有效（未过期）</span>
    if (status === 'expired') return <span className="badge err">✗ 已过期</span>
    return <span className="badge err">✗ 尚未生效（nbf 未到）</span>
  }

  return (
    <div className="col">
      <div className="row">
        <span className="label">粘贴 JWT（不校验签名，仅解析与时效判断）</span>
        <span style={{ flex: 1 }} />
        {result?.ok && <span className="badge">alg：{String(result.d.header.alg ?? '未知')}</span>}
        {result?.ok && statusBadge(result.d.status)}
      </div>
      <textarea
        className="editor"
        style={{ height: 72 }}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        data-selectable
        spellCheck={false}
        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.…"
      />
      {result && !result.ok && <span className="badge err">{result.error}</span>}
      {result?.ok && (
        <>
          <div className="row">
            <span className="label">过期时间 exp：{fmtTime(result.d.expAt)}</span>
            <span className="label">生效时间 nbf：{fmtTime(result.d.nbfAt)}</span>
          </div>
          <div className="row" style={{ flex: 1, minHeight: 0 }}>
            <div className="col">
              <div className="row">
                <span className="label">Header</span>
                <CopyButton ctx={ctx} k="jwt-header" text={result.d.headerJson} />
              </div>
              <textarea className="editor" value={result.d.headerJson} readOnly data-selectable spellCheck={false} />
            </div>
            <div className="col">
              <div className="row">
                <span className="label">Payload</span>
                <CopyButton ctx={ctx} k="jwt-payload" text={result.d.payloadJson} />
              </div>
              <textarea className="editor" value={result.d.payloadJson} readOnly data-selectable spellCheck={false} />
            </div>
          </div>
          <div className="hash-row">
            <span className="hash-name">签名</span>
            <span className="hash-value">{result.d.signature || '（无签名）'}</span>
            <CopyButton ctx={ctx} k="jwt-sig" text={result.d.signature} />
          </div>
        </>
      )}
    </div>
  )
}

// ---------- 应用外壳 ----------

export function App({ workos }: { workos: WorkosApi }): JSX.Element {
  const [tab, setTab] = useState<TabId>('codec')
  const [copiedKey, setCopiedKey] = useState('')
  // 进入事件（Launcher 命令）可预填的输入
  const [codecInput, setCodecInput] = useState('')
  const [hashInput, setHashInput] = useState('')
  const [aesPlain, setAesPlain] = useState('')
  const [jwtToken, setJwtToken] = useState('')

  // 命令进入：如 crypto.jwt + 文本载荷 → 自动切到 JWT 分区并填入
  useEffect(() => {
    const onEnter = (e: Event): void => {
      const detail = (e as CustomEvent<{ code: string; payload?: unknown }>).detail
      const payload = typeof detail?.payload === 'string' ? detail.payload : ''
      switch (detail?.code) {
        case 'crypto.md5':
        case 'crypto.sha256':
          setTab('hash')
          if (payload) setHashInput(payload)
          break
        case 'crypto.base64':
          setTab('codec')
          if (payload) setCodecInput(payload)
          break
        case 'crypto.aes':
          setTab('aes')
          if (payload) setAesPlain(payload)
          break
        case 'crypto.jwt':
          setTab('jwt')
          if (payload) setJwtToken(payload)
          break
        case 'crypto.open':
        default:
          if (payload && !detail?.code?.startsWith('crypto.')) {
            setTab('codec')
            setCodecInput(payload)
          }
          break
      }
    }
    window.addEventListener('workos-enter', onEnter)
    return () => window.removeEventListener('workos-enter', onEnter)
  }, [])

  const ctx: PanelCtx = {
    copy: (key, text) => {
      void workos.clipboard
        .writeText(text)
        .then(() => {
          setCopiedKey(key)
          window.setTimeout(() => setCopiedKey((k) => (k === key ? '' : k)), 1200)
        })
        .catch(() => undefined)
    },
    copiedKey,
  }

  return (
    <div className="app">
      <nav className="tabs vertical">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.title}
          </button>
        ))}
      </nav>
      <main className="panel-stack">
        <section className="panel" style={{ display: tab === 'codec' ? 'flex' : 'none' }}>
          <CodecPanel ctx={ctx} input={codecInput} setInput={setCodecInput} />
        </section>
        <section className="panel" style={{ display: tab === 'hash' ? 'flex' : 'none' }}>
          <HashPanel ctx={ctx} input={hashInput} setInput={setHashInput} />
        </section>
        <section className="panel" style={{ display: tab === 'hmac' ? 'flex' : 'none' }}>
          <HmacPanel ctx={ctx} />
        </section>
        <section className="panel" style={{ display: tab === 'aes' ? 'flex' : 'none' }}>
          <AesPanel ctx={ctx} initialPlain={aesPlain} />
        </section>
        <section className="panel" style={{ display: tab === 'rsa' ? 'flex' : 'none' }}>
          <RsaPanel ctx={ctx} />
        </section>
        <section className="panel" style={{ display: tab === 'jwt' ? 'flex' : 'none' }}>
          <JwtPanel ctx={ctx} initialToken={jwtToken} />
        </section>
      </main>
    </div>
  )
}
