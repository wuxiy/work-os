import React from 'react'
import ReactDOM from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { LauncherApp } from './LauncherApp'
import '../styles.css'

// 全局错误上报（验收取证 + 开发诊断）
window.addEventListener('error', (e) => {
  void invoke('debug_log', { msg: `JS ERROR: ${e.message} @ ${(e.filename ?? '').split('/').pop()}:${e.lineno}` }).catch(() => {})
})
window.addEventListener('unhandledrejection', (e) => {
  void invoke('debug_log', { msg: `JS REJECT: ${String(e.reason)}` }).catch(() => {})
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LauncherApp />
  </React.StrictMode>,
)
