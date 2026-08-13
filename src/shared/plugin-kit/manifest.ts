import { z } from 'zod'

/**
 * Plugin manifest schema — the contract every plugin must satisfy.
 * Modelled on u-tools' `plugin.json` (the most expressive, well-specified contract
 * among the reference apps). `features[].cmds` is the trigger grammar the launcher
 * match engine evaluates against the current input/clipboard/selection.
 *
 * MVP implements text / regex / over matchers fully; img / files / window are
 * declared so third-party manifests parse, but only stub-matched.
 */

export const textCmdSchema = z.string()

export const regexCmdSchema = z.object({
  type: z.literal('regex'),
  label: z.string().optional(),
  match: z.string(), // regex source, e.g. "^https?://"
  flags: z.string().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional()
})

export const overCmdSchema = z.object({
  type: z.literal('over'),
  label: z.string().optional(),
  exclude: z.string().optional(), // regex source; matching text is excluded
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional()
})

export const imgCmdSchema = z.object({
  type: z.literal('img'),
  label: z.string().optional()
})

export const filesCmdSchema = z.object({
  type: z.literal('files'),
  label: z.string().optional(),
  fileType: z.enum(['file', 'directory']).optional(),
  extensions: z.array(z.string()).optional(),
  match: z.string().optional(),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional()
})

export const windowCmdSchema = z.object({
  type: z.literal('window'),
  label: z.string().optional(),
  match: z
    .object({
      app: z.array(z.string()).optional(),
      title: z.string().optional(),
      class: z.array(z.string()).optional()
    })
    .optional()
})

export const cmdSchema = z.union([
  textCmdSchema,
  regexCmdSchema,
  overCmdSchema,
  imgCmdSchema,
  filesCmdSchema,
  windowCmdSchema
])
export type Cmd = z.infer<typeof cmdSchema>

export type CmdType =
  | 'text'
  | 'regex'
  | 'over'
  | 'img'
  | 'files'
  | 'window'

export const featureSchema = z.object({
  code: z.string(),
  explain: z.string().optional(),
  icon: z.string().optional(),
  cmds: z.array(cmdSchema).min(1),
  platform: z.array(z.enum(['darwin', 'win32', 'linux'])).optional()
})
export type Feature = z.infer<typeof featureSchema>

/** A whole feature list, for runtime validation of dynamic setFeatures payloads. */
export const featureArraySchema = z.array(featureSchema)

export const pluginSettingSchema = z.object({
  single: z.boolean().optional(),
  height: z.number().optional()
})

export const pluginManifestSchema = z.object({
  pluginName: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  logo: z.string(),
  main: z.string().optional(),
  preload: z.string().optional(),
  features: z.array(featureSchema).min(1),
  pluginSetting: pluginSettingSchema.optional()
})
export type PluginManifest = z.infer<typeof pluginManifestSchema>

/**
 * A plugin as known to the host process: the parsed manifest plus its resolved
 * location on disk and runtime state.
 */
export interface PluginRecord {
  id: string
  manifest: PluginManifest
  rootDir: string
  mainPath: string
  logoPath: string
  enabled: boolean
  builtin: boolean
}

/**
 * The renderer-facing projection of a plugin. `logo` is a data URL so the
 * (http-served, in dev) launcher can render it without cross-origin/CSP pain.
 */
export interface PluginSummary {
  id: string
  name: string
  version: string
  description: string
  logo: string
  features: Feature[]
  builtin: boolean
  enabled: boolean
}
