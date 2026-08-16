import { Badge, Button, Card, Dialog, DialogContent, DialogFooter, DialogHeader, EmptyState, Spinner, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@work-os/ui'
import { Check, Download, FolderPlus, Package, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ipc, type RegistryDoc, type StagedPlugin } from '../lib/ipc'
import { store, usePlugins } from '../lib/store'

/** 插件管理（产品架构 §11）：Installed / Available / Developer */
export function PluginManager() {
  const loadPlugins = store.loadPlugins
  const plugins = usePlugins()
  const [busy, setBusy] = useState(false)
  const [staged, setStaged] = useState<StagedPlugin | null>(null)
  const [stagedPerms, setStagedPerms] = useState<string[]>([])
  const [installing, setInstalling] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = useCallback(() => {
    void loadPlugins()
  }, [loadPlugins])

  useEffect(() => {
    refresh()
  }, [refresh])

  const doInstallFile = async () => {
    void ipc.debugLog('UI: 点击「从本地安装」')
    setBusy(true)
    setMessage('')
    try {
      const s = await ipc.pluginPickAndValidate()
      void ipc.debugLog(`UI: 暂存 ${s.manifest.id} v${s.manifest.version}`)
      setStaged(s)
      setStagedPerms(s.manifest.permissions ?? [])
    } catch (e) {
      setMessage(String(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmInstall = async () => {
    void ipc.debugLog(`UI: 确认安装 ${staged?.manifest.id ?? ''} 权限=${stagedPerms.join(',')}`)
    if (!staged) return
    setInstalling(true)
    try {
      const r = await ipc.pluginInstallConfirmed(staged.stagedPath, stagedPerms)
      setMessage(`已安装 ${r.id} v${r.version}`)
      setStaged(null)
      refresh()
    } catch (e) {
      setMessage(String(e))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-5">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-[15px] font-semibold">插件</h1>
        <span className="text-[12px] text-app-fg-dim">共 {plugins.length} 个</span>
        {message && <span className="ml-auto truncate text-[12px] text-app-fg-dim">{message}</span>}
      </div>

      <Tabs defaultValue="installed">
        <TabsList>
          <TabsTrigger value="installed">已安装</TabsTrigger>
          <TabsTrigger value="available">可获取</TabsTrigger>
          <TabsTrigger value="developer">开发者</TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="mt-3 space-y-2">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void doInstallFile()}>
              <Download size={12} /> 从本地安装 .workos-plugin
            </Button>
          </div>
          {plugins.map((p) => (
            <Card key={p.row.id} className="flex items-center gap-3 p-3">
              <Package size={16} className="shrink-0 text-app-fg-dim" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{p.row.name}</span>
                  <Badge>{p.row.type}</Badge>
                  <span className="font-mono text-[11px] text-app-fg-dim">v{p.row.version}</span>
                  {p.row.source === 'dev' && <Badge tone="warn">dev</Badge>}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-app-fg-dim">
                  {p.row.id} · 权限：{p.permissions.length ? p.permissions.join('、') : '无'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch checked={p.row.enabled} onCheckedChange={(v) => void ipc.pluginSetEnabled(p.row.id, v).then(refresh)} />
                <Button variant="ghost" size="icon" title="卸载" onClick={() => void ipc.pluginUninstall(p.row.id).then(refresh)}>
                  <Trash2 size={13} />
                </Button>
              </div>
            </Card>
          ))}
          {plugins.length === 0 && <EmptyState title="尚未安装插件" hint="从「可获取」安装或本地安装 .workos-plugin 包" />}
        </TabsContent>

        <TabsContent value="available" className="mt-3">
          <AvailableTab onStage={(s) => { setStaged(s); setStagedPerms(s.manifest.permissions ?? []) }} />
        </TabsContent>

        <TabsContent value="developer" className="mt-3 space-y-3">
          <Card className="flex items-center justify-between p-3">
            <div>
              <p className="text-[13px] font-medium">加载本地开发插件</p>
              <p className="mt-0.5 text-[11px] text-app-fg-dim">选择包含 manifest.json 的开发目录（未打包直接运行，用于插件开发调试）</p>
            </div>
            <Button variant="outline" disabled={busy} onClick={() => void (async () => {
              setBusy(true)
              try {
                const r = await ipc.pluginInstallDev()
                setMessage(`已加载开发插件 ${r.id}`)
                refresh()
              } catch (e) {
                setMessage(String(e))
              } finally {
                setBusy(false)
              }
            })()}>
              <FolderPlus size={13} /> 选择目录
            </Button>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={staged !== null} onOpenChange={(o) => !o && setStaged(null)}>
        <DialogContent>
          {staged && (
            <>
              <DialogHeader
                title={`安装 ${staged.manifest.name}`}
                desc={`${staged.manifest.id} · v${staged.manifest.version} · ${(staged.size / 1024).toFixed(1)} KB · sha256 ${staged.sha256.slice(0, 12)}…`}
              />
              <div className="space-y-2">
                <p className="text-[12px] font-medium">该插件申请以下权限：</p>
                {(staged.manifest.permissions ?? []).length === 0 && <p className="text-[12px] text-app-fg-dim">无需任何权限</p>}
                {(staged.manifest.permissions ?? []).map((p) => (
                  <label key={p} className="flex items-center gap-2 rounded-app border border-app-border px-2 py-1.5 text-[12px]">
                    <Check size={12} className="text-app-success" />
                    <span className="font-mono">{p}</span>
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStaged(null)}>
                  取消
                </Button>
                <Button disabled={installing} onClick={() => void confirmInstall()}>
                  {installing ? <Spinner /> : <Download size={13} />} 确认安装
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AvailableTab({ onStage }: { onStage: (s: StagedPlugin) => void }) {
  const [urls, setUrls] = useState<string[]>([])
  const [newUrl, setNewUrl] = useState('')
  const [docs, setDocs] = useState<Record<string, RegistryDoc>>({})
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const plugins = usePlugins()

  const reload = useCallback(async () => {
    const list = await ipc.registryList()
    setUrls(list)
    setLoading(true)
    const next: Record<string, RegistryDoc> = {}
    for (const u of list) {
      try {
        next[u] = await ipc.registryFetch(u)
      } catch {
        setMsg(`无法读取源：${u}`)
      }
    }
    setDocs(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const addUrl = async () => {
    if (!newUrl.trim()) return
    const next = [...new Set([...urls, newUrl.trim()])]
    await ipc.registrySave(next)
    setNewUrl('')
    void reload()
  }

  const install = async (registryUrl: string, pluginId: string) => {
    setLoading(true)
    setMsg('')
    try {
      const staged = await ipc.pluginInstallRegistry(registryUrl, pluginId)
      onStage(staged)
    } catch (e) {
      setMsg(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <p className="mb-2 text-[12px] font-medium">插件源（静态 Registry）</p>
        {urls.map((u) => (
          <div key={u} className="mb-1 flex items-center gap-2 text-[12px]">
            <span className="truncate font-mono text-app-fg-dim">{u}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => void ipc.registrySave(urls.filter((x) => x !== u)).then(reload)}
            >
              移除
            </Button>
          </div>
        ))}
        <div className="mt-2 flex gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com/registry.json"
            className="h-8 flex-1 rounded-app border border-app-border bg-app-panel2 px-2 text-[12px] outline-none focus:border-app-accent"
          />
          <Button variant="outline" size="sm" onClick={() => void addUrl()}>
            添加
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void reload()}>
            <RefreshCw size={12} />
          </Button>
        </div>
      </Card>

      {msg && <p className="text-[12px] text-app-danger">{msg}</p>}
      {loading && <p className="flex items-center gap-2 text-[12px] text-app-fg-dim"><Spinner /> 加载中…</p>}

      {Object.entries(docs).flatMap(([url, doc]) =>
        doc.plugins.map((p) => {
          const installed = plugins.find((x) => x.row.id === p.id)
          const canUpdate = installed && installed.row.version !== p.version
          return (
            <Card key={`${url}:${p.id}`} className="flex items-center gap-3 p-3">
              <Package size={16} className="shrink-0 text-app-fg-dim" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{p.name || p.id}</span>
                  <Badge>{p.type}</Badge>
                  <span className="font-mono text-[11px] text-app-fg-dim">v{p.version}</span>
                  {installed && !canUpdate && <Badge tone="success">已安装</Badge>}
                  {canUpdate && <Badge tone="warn">可更新 → {p.version}</Badge>}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-app-fg-dim">{p.description ?? p.id}</p>
              </div>
              {!installed || canUpdate ? (
                <Button size="sm" disabled={loading} onClick={() => void install(url, p.id)}>
                  {canUpdate ? '更新' : '安装'}
                </Button>
              ) : null}
            </Card>
          )
        }),
      )}
    </div>
  )
}
