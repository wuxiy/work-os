import { z } from 'zod'

/** 插件类型（技术架构 §8） */
export const PLUGIN_TYPES = ['ui', 'manual', 'system'] as const
export type PluginType = (typeof PLUGIN_TYPES)[number]

/** V0.1 权限集（技术架构 §13）。高危权限（filesystem/shell）刻意不存在。 */
export const V01_PERMISSIONS = [
  'clipboard.read',
  'clipboard.write',
  'storage.read',
  'storage.write',
  'network.request',
  'secret.read',
  'secret.write',
  'dialog.open',
  'dialog.save',
  'notification.show',
] as const
export type Permission = (typeof V01_PERMISSIONS)[number]

export const permissionSchema = z.enum(V01_PERMISSIONS)

export const pluginCommandSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9.-_]*$/i, '命令 id 仅允许字母数字与 . - _'),
  title: z.string().min(1),
  keywords: z.array(z.string()).optional(),
  /** 进入插件时携带的 action code，缺省与 id 一致 */
  code: z.string().optional(),
})
export type PluginCommand = z.infer<typeof pluginCommandSchema>

export const manualPluginConfigSchema = z.object({
  provider: z.literal('static'),
  index: z.string(),
  database: z.string().optional(),
  content: z.string(),
})
export type ManualPluginConfig = z.infer<typeof manualPluginConfigSchema>

/** 插件清单（技术架构 §9） */
export const pluginManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, '插件 id 形如 dev.workos.tool.json-tools'),
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, '版本号须为 semver x.y.z'),
    type: z.enum(PLUGIN_TYPES),
    apiVersion: z.string().regex(/^\d+$/, 'apiVersion 为数字字符串，如 "1"'),
    entry: z.string().optional(),
    permissions: z.array(permissionSchema).optional(),
    commands: z.array(pluginCommandSchema).optional(),
    manual: manualPluginConfigSchema.optional(),
    description: z.string().optional(),
    author: z.string().optional(),
    icon: z.string().optional(),
  })
  .superRefine((m, ctx) => {
    if (m.type === 'manual') {
      if (!m.manual) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'manual 类型插件必须声明 manual 配置' })
      }
    } else {
      if (!m.entry) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${m.type} 类型插件必须声明 entry` })
      }
      if (m.entry && (m.entry.includes('..') || m.entry.startsWith('/'))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'entry 必须是包内相对路径' })
      }
    }
    const ids = new Set<string>()
    for (const c of m.commands ?? []) {
      if (ids.has(c.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `命令 id 重复：${c.id}` })
      }
      ids.add(c.id)
    }
  })
export type PluginManifest = z.infer<typeof pluginManifestSchema>

export interface ManifestError {
  field: string
  message: string
}

/** 校验 manifest，返回结构化错误（E2） */
export function validateManifest(input: unknown): { ok: true; manifest: PluginManifest } | { ok: false; errors: ManifestError[] } {
  const res = pluginManifestSchema.safeParse(input)
  if (res.success) return { ok: true, manifest: res.data }
  return {
    ok: false,
    errors: res.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
  }
}
