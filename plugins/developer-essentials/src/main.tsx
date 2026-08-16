import React from 'react'
import ReactDOM from 'react-dom/client'
import { definePlugin } from '@work-os/plugin-sdk'
import { App } from './App'
import './style.css'

// 插件注册：挂载 window.workos（验收 E3/E4），监听进入事件 / 主题切换
export const plugin = definePlugin({
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
    <App api={plugin} />
  </React.StrictMode>,
)
