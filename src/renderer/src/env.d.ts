/// <reference types="vite/client" />
import type { MainApi } from '../../../shared/ipc/api'

declare global {
  interface Window {
    api: MainApi
    apiOn: (event: string, cb: (...args: unknown[]) => void) => () => void
    host: { platform: NodeJS.Platform }
  }
}

export {}
