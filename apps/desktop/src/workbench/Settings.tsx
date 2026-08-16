import { Badge, Button, Card, Input, Spinner, Switch } from '@work-os/ui'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ipc } from '../lib/ipc'
import { store, useThemeMode } from '../lib/store'

/** 设置：主题 / 启动器 / 插件源（只读展示）/ 更新 / 关于 */
export function Settings() {
  const { themeMode } = useThemeMode()
  const setTheme = store.setTheme
  const [appInfo, setAppInfo] = useState({ name: 'Work-OS', version: '' })
  const [registryUrls, setRegistryUrls] = useState<string[]>([])
  const [feedUrl, setFeedUrl] = useState('')
  const [pubkey, setPubkey] = useState('')
  const [updateState, setUpdateState] = useState<{ checking: boolean; text: string }>({ checking: false, text: '' })

  useEffect(() => {
    void ipc.getAppInfo().then(setAppInfo)
    void ipc.registryList().then(setRegistryUrls)
    void ipc.settingGet('updaterFeed').then((v) => setFeedUrl(v ?? ''))
    void ipc.settingGet('updaterPubkey').then((v) => setPubkey(v ?? ''))
  }, [])

  const checkUpdate = async () => {
    setUpdateState({ checking: true, text: '' })
    try {
      if (pubkey.trim()) await ipc.updaterSetPubkey(pubkey.trim())
      const r = await ipc.updaterCheck(feedUrl.trim())
      setUpdateState({
        checking: false,
        text: r.available ? `发现新版本 ${r.version}（已支持检测；安装更新需签名版应用）` : '当前已是最新版本',
      })
    } catch (e) {
      setUpdateState({ checking: false, text: String(e) })
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-5">
      <h1 className="text-[15px] font-semibold">设置</h1>

      <Card className="space-y-3 p-4">
        <p className="text-[13px] font-medium">外观</p>
        <div className="flex items-center gap-6 text-[13px]">
          {(['system', 'light', 'dark'] as const).map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" checked={themeMode === m} onChange={() => void setTheme(m)} />
              {m === 'system' ? '跟随系统' : m === 'light' ? '浅色' : '深色'}
            </label>
          ))}
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-[13px] font-medium">启动器</p>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-app-fg-dim">全局快捷键</span>
          <span className="font-mono">⌥ Space</span>
        </div>
        <p className="text-[11px] text-app-fg-dim">在任意应用中按下快捷键唤起/隐藏快速启动器；ESC 或失焦自动隐藏。</p>
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-[13px] font-medium">插件源</p>
        {registryUrls.length === 0 && <p className="text-[12px] text-app-fg-dim">未配置。可在「插件 → 可获取」中添加静态 Registry。</p>}
        {registryUrls.map((u) => (
          <p key={u} className="truncate font-mono text-[11px] text-app-fg-dim">
            {u}
          </p>
        ))}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-[13px] font-medium">软件更新</p>
        <div className="flex gap-2">
          <Input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="更新源 URL（latest.json）" />
          <Button variant="outline" disabled={updateState.checking || !feedUrl.trim()} onClick={() => void checkUpdate()}>
            {updateState.checking ? <Spinner /> : <RefreshCw size={13} />} 检查更新
          </Button>
        </div>
        <Input value={pubkey} onChange={(e) => setPubkey(e.target.value)} placeholder="更新签名公钥（minisign，可选）" className="font-mono text-[11px]" />
        {updateState.text && <p className="text-[12px] text-app-fg-dim">{updateState.text}</p>}
        <p className="text-[11px] text-app-fg-dim">注：未签名构建支持检测与下载提示；自动安装需正式签名版。</p>
      </Card>

      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-[13px] font-medium">{appInfo.name}</p>
          <p className="mt-0.5 text-[11px] text-app-fg-dim">本地优先 · 插件驱动 · 数据保存在本机</p>
        </div>
        <Badge tone="accent">v{appInfo.version}</Badge>
      </Card>
    </div>
  )
}
