import React from 'react'
import ReactDOM from 'react-dom/client'
import { definePlugin, type WorkosApi } from '@work-os/plugin-sdk'
import { App } from './App'
import './style.css'

// 插件注册：挂载 window.workos，监听进入/主题事件；App 复用同一实例
export const workos: WorkosApi = definePlugin({
  activate(ctx) {
    ctx.workos.lifecycle.onPluginEnter((e) => {
      window.dispatchEvent(new CustomEvent('workos-enter', { detail: e }))
    })
    ctx.workos.theme.onChange((t) => {
      document.documentElement.classList.toggle('light', t === 'light')
    })
    void ctx.workos.theme.get().then((t) => {
      document.documentElement.classList.toggle('light', t === 'light')
    })
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
