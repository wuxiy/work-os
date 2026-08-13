import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Shared alias to the plugin SDK so main / preload / renderer / plugins all
// import the same typed surface (`@wb/plugin-kit`). Single source of truth —
// see native-feel skill ref 04 (the IPC contract is the spine).
const pluginKit = resolve(__dirname, 'src/shared/plugin-kit/index.ts')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@wb/plugin-kit': pluginKit } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@wb/plugin-kit': pluginKit } },
    build: {
      // Sandbox preloads must be CommonJS (ESM preload isn't supported under
      // sandbox:true). Force CJS output with a .cjs extension.
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/app.ts'),
          plugin: resolve(__dirname, 'src/preload/plugin.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@wb/plugin-kit': pluginKit
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } }
    }
  }
})
