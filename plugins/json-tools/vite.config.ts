import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 插件以 .workos-plugin（ZIP）分发，经 workos-plugin:// 协议加载，必须使用相对路径 base
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
})
