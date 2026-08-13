import { create } from 'zustand'
import type { PluginSummary } from '@wb/plugin-kit'
import type { TriggerContext } from '../../../shared/ipc/api'
import { matchFeatures, type MatchResult } from '../features/match-engine'

type Mode = 'launcher' | 'plugin'

interface SubInput {
  enabled: boolean
  placeholder?: string
  value: string
}

interface AppState {
  ready: boolean
  summaries: PluginSummary[]
  query: string
  results: MatchResult[]
  selectedIndex: number
  mode: Mode
  activePluginName: string
  subInput: SubInput
  ctx: TriggerContext | null

  init: () => Promise<void>
  refresh: () => Promise<void>
  refreshContext: () => Promise<void>
  setQuery: (q: string) => void
  moveSelection: (delta: number) => void
  activateSelected: () => Promise<void>
  exitPlugin: () => Promise<void>
  typeSubInput: (value: string) => void
}

function recompute(
  summaries: PluginSummary[],
  query: string,
  ctx: TriggerContext | null
): MatchResult[] {
  return matchFeatures(summaries, query, ctx ?? undefined)
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  summaries: [],
  query: '',
  results: [],
  selectedIndex: 0,
  mode: 'launcher',
  activePluginName: '',
  subInput: { enabled: false, value: '' },
  ctx: null,

  init: async () => {
    const summaries = await window.api.listPlugins()
    const ctx = await window.api.getTriggerContext().catch(() => null)
    set({ summaries, ctx, results: recompute(summaries, '', ctx), ready: true })

    window.apiOn('plugins-changed', async () => {
      const fresh = await window.api.listPlugins()
      set({ summaries: fresh, results: recompute(fresh, get().query, get().ctx), selectedIndex: 0 })
    })
    window.apiOn('plugin-out', () =>
      set({ mode: 'launcher', query: '', activePluginName: '', subInput: { enabled: false, value: '' }, results: recompute(get().summaries, '', get().ctx) })
    )
    window.apiOn('sub-input', (s) => {
      const payload = s as { enabled: boolean; placeholder?: string; value?: string }
      set({ subInput: { enabled: payload.enabled, placeholder: payload.placeholder, value: payload.value ?? '' } })
    })
  },

  refresh: async () => {
    const fresh = await window.api.listPlugins()
    set({ summaries: fresh, results: recompute(fresh, get().query, get().ctx) })
  },

  refreshContext: async () => {
    const ctx = await window.api.getTriggerContext().catch(() => null)
    set({ ctx, results: recompute(get().summaries, get().query, ctx) })
  },

  setQuery: (q) => {
    set({ query: q, results: recompute(get().summaries, q, get().ctx), selectedIndex: 0 })
  },

  moveSelection: (delta) => {
    const { results, selectedIndex } = get()
    if (results.length === 0) return
    const next = (selectedIndex + delta + results.length) % results.length
    set({ selectedIndex: next })
  },

  activateSelected: async () => {
    const { results, selectedIndex, query, mode, ctx } = get()
    if (mode !== 'launcher') return
    const result = results[selectedIndex]
    if (!result) return
    // Build the enter payload from the trigger type: text-like cmds get the
    // typed query; context cmds get the matched clipboard/window data.
    let payload: unknown = query
    if (result.type === 'img') payload = ctx?.image ?? null
    else if (result.type === 'files') payload = ctx?.files ?? []
    else if (result.type === 'window') payload = ctx?.window ?? null

    await window.api.activatePlugin(result.pluginId, result.feature.code, result.type, payload)
    set({ mode: 'plugin', activePluginName: result.pluginName })
  },

  exitPlugin: async () => {
    await window.api.exitPlugin()
    set({ mode: 'launcher', query: '', activePluginName: '', subInput: { enabled: false, value: '' }, results: recompute(get().summaries, '', get().ctx) })
  },

  typeSubInput: (value) => {
    set({ subInput: { ...get().subInput, value } })
    void window.api.subInputTyping(value)
  }
}))
