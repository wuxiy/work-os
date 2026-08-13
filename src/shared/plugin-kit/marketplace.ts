import { z } from 'zod'

/**
 * Remote plugin marketplace registry format. A static JSON document served over
 * HTTP(S); the host resolves `download`/`logo` as absolute URLs or paths
 * relative to the registry URL. SHA-256 is optional integrity verification.
 */
export const marketplaceEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  logo: z.string().optional(),
  download: z.string(),
  sha256: z.string().optional()
})
export type MarketplaceEntry = z.infer<typeof marketplaceEntrySchema>

export const marketplaceRegistrySchema = z.object({
  name: z.string().optional(),
  updated: z.string().optional(),
  plugins: z.array(marketplaceEntrySchema),
  // Optional Ed25519 signature over canonicalRegistryMessage(this), made by the
  // registry operator's key. `keyId` names which trusted public key to use.
  signature: z.string().optional(),
  keyId: z.string().optional()
})
export type MarketplaceRegistry = z.infer<typeof marketplaceRegistrySchema>

/**
 * Deterministic string a registry signature covers. Pure string ops (no crypto)
 * so this is safe to import anywhere, including the renderer. The signing tool
 * and the verifier MUST use this identical function — it is the contract.
 *
 * Covers: registry name/updated + each plugin's id|version|sha256. Signature
 * and keyId are intentionally excluded (they're over the rest).
 */
export function canonicalRegistryMessage(reg: {
  name?: string
  updated?: string
  plugins?: Array<{ id: string; version: string; sha256?: string }>
  signature?: string
  keyId?: string
}): string {
  const lines = (reg.plugins ?? []).map(
    (p) => `${p.id}|${p.version}|${p.sha256 ?? ''}`
  )
  return `${reg.name ?? ''}\n${reg.updated ?? ''}\n${lines.join('\n')}`
}
