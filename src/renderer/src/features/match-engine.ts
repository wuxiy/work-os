import type { Cmd, CmdType, Feature, PluginSummary } from '@wb/plugin-kit'
import type { TriggerContext } from '../../../shared/ipc/api'

export interface MatchResult {
  pluginId: string
  pluginName: string
  logo: string
  feature: Feature
  type: CmdType
  /** lower = higher relevance */
  priority: number
}

function safeRegex(source: string, flags = ''): RegExp | null {
  try {
    return new RegExp(source, flags)
  } catch {
    return null
  }
}

function matchCmd(
  cmd: Cmd,
  text: string,
  ctx?: TriggerContext
): { type: CmdType; priority: number } | null {
  // text command (bare string)
  if (typeof cmd === 'string') {
    if (!cmd) return null
    if (!text) return { type: 'text', priority: 10 } // show entry when input empty
    const c = cmd.toLowerCase()
    const t = text.toLowerCase()
    if (c === t) return { type: 'text', priority: 0 }
    if (c.includes(t)) return { type: 'text', priority: 1 }
    if (t.includes(c)) return { type: 'text', priority: 2 }
    return null
  }

  // On empty input, text-like typed commands (regex/over) still surface as
  // entries; context commands (img/files/window) are gated on the live context.
  if (!text && (cmd.type === 'regex' || cmd.type === 'over')) {
    return { type: cmd.type, priority: 10 }
  }

  switch (cmd.type) {
    case 'regex': {
      if (!text) return null
      const re = safeRegex(cmd.match, cmd.flags)
      if (!re) return null
      if (cmd.minLength && text.length < cmd.minLength) return null
      if (cmd.maxLength && text.length > cmd.maxLength) return null
      return re.test(text) ? { type: 'regex', priority: 3 } : null
    }
    case 'over': {
      if (!text) return null
      if (cmd.exclude) {
        const ex = safeRegex(cmd.exclude)
        if (ex?.test(text)) return null
      }
      if (cmd.minLength && text.length < cmd.minLength) return null
      if (cmd.maxLength && text.length > cmd.maxLength) return null
      return { type: 'over', priority: 4 }
    }
    case 'img':
      return ctx?.hasImage ? { type: 'img', priority: 6 } : null
    case 'files': {
      if (!ctx || ctx.files.length === 0) return null
      const exts = (cmd.extensions ?? [])
        .map((e) => e.toLowerCase().replace(/^\./, ''))
      const matched = ctx.files.some((f) => {
        const name = f.split('/').pop() || f
        const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
        if (exts.length > 0 && !exts.includes(ext)) return false
        if (cmd.match) {
          const re = safeRegex(cmd.match)
          if (!re || !re.test(name)) return false
        }
        return true
      })
      if (cmd.minLength && ctx.files.length < cmd.minLength) return null
      if (cmd.maxLength && ctx.files.length > cmd.maxLength) return null
      return matched ? { type: 'files', priority: 6 } : null
    }
    case 'window': {
      if (!ctx?.window) return null
      const m = cmd.match
      if (!m || ((!m.app || m.app.length === 0) && !m.title)) {
        return { type: 'window', priority: 6 }
      }
      const appOk =
        !m.app || m.app.length === 0 || m.app.some((a) => ctx.window!.app.toLowerCase().includes(a.toLowerCase()))
      let titleOk = true
      if (m.title) {
        const re = safeRegex(m.title)
        titleOk = !!re && re.test(ctx.window!.title ?? '')
      }
      return appOk && titleOk ? { type: 'window', priority: 6 } : null
    }
    default:
      return null
  }
}

/**
 * Evaluate every enabled plugin's features against the current input + live
 * trigger context, and rank the matches. Empty input lists each text-like
 * feature as an entry, plus any img/files/window cmds whose context matches.
 */
export function matchFeatures(
  summaries: PluginSummary[],
  input: string,
  ctx?: TriggerContext
): MatchResult[] {
  const text = input.trim()
  const platform = window.host?.platform
  const results: MatchResult[] = []

  for (const plugin of summaries) {
    for (const feature of plugin.features) {
      if (
        feature.platform &&
        platform &&
        !feature.platform.includes(platform as 'darwin' | 'win32' | 'linux')
      ) {
        continue
      }
      let best: { type: CmdType; priority: number } | null = null
      for (const cmd of feature.cmds) {
        const m = matchCmd(cmd, text, ctx)
        if (m && (!best || m.priority < best.priority)) best = m
      }
      if (best) {
        results.push({
          pluginId: plugin.id,
          pluginName: plugin.name,
          logo: plugin.logo,
          feature,
          type: best.type,
          priority: best.priority
        })
      }
    }
  }

  return results.sort((a, b) => a.priority - b.priority || a.pluginName.localeCompare(b.pluginName))
}
