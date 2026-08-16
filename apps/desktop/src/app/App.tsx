import { listen } from '@tauri-apps/api/event'
import { useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { applyHtmlTheme, store, useRoute } from '../lib/store'
import { registerCoreCommands, syncPluginCommands } from '../lib/commands'
import { Layout } from './Layout'
import { Home } from '../workbench/Home'
import { Developer } from '../workbench/Developer'
import { PluginTool } from '../workbench/PluginTool'
import { PluginManager } from '../workbench/PluginManager'
import { Settings } from '../workbench/Settings'
import { ManualHub } from '../manuals/ManualHub'
import { ManualReader } from '../manuals/ManualReader'

export function App() {
  const route = useRoute()
  const navigate = store.navigate
  const loadPlugins = store.loadPlugins
  useEffect(() => {
    registerCoreCommands()
    void syncPluginCommands()
    void loadPlugins()
    void ipc.themeGet().then((t) => {
      store.initTheme(t.mode, t.resolved)
    })

    const unlisteners: Array<() => void> = []
    void listen<{ route: string }>('workos://navigate', (e) => {
      void ipc.debugLog(`navigate ${e.payload.route}`)
      navigate(e.payload.route)
    })
    void listen<{ pluginId: string; code?: string; payload?: unknown }>('workos://open-tool', (e) => {
      void ipc.debugLog(`open-tool ${e.payload.pluginId} code=${e.payload.code ?? '-'}`)
      navigate(`/t/${e.payload.pluginId}`, { code: e.payload.code, payload: e.payload.payload })
      void ipc.debugLog(`route now: ${store.getState().route.path}`)
    })
    void listen<string>('workos://theme', (e) => {
      store.applyResolved(e.payload as 'dark' | 'light')
    })
    Promise.all([]).then(() => unlisteners)
    return () => unlisteners.forEach((u) => u())
  }, [])

  return (
    <Layout>
      {renderRoute(route.path)}
    </Layout>
  )
}

function renderRoute(path: string) {
  if (path === '/home') return <Home />
  if (path === '/developer') return <Developer />
  if (path === '/plugins') return <PluginManager />
  if (path === '/settings') return <Settings />
  if (path === '/manuals') return <ManualHub />
  if (path.startsWith('/manuals/')) {
    const [, , sourceId = '', docId = ''] = path.split('/')
    return <ManualReader sourceId={sourceId} docId={docId} />
  }
  if (path.startsWith('/t/')) {
    const pluginId = path.slice('/t/'.length)
    return <PluginTool pluginId={pluginId} />
  }
  return <Home />
}
