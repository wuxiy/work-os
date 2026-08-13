import { createPublicKey, verify } from 'node:crypto'
import {
  canonicalRegistryMessage,
  type MarketplaceRegistry
} from '../../shared/plugin-kit/marketplace'

/**
 * Ed25519 registry signature verification. Pure node:crypto — no Electron — so
 * the same code runs in the main process, the signing tooling, and the smoke
 * test. Public keys are base64 DER (SPKI), pinned locally in settings.
 */
export interface VerifyResult {
  accepted: boolean
  reason?: string
}

export function verifyRegistrySignature(
  registry: MarketplaceRegistry,
  signatureB64: string,
  keyId: string,
  trustedKeys: Record<string, string>
): VerifyResult {
  const pubB64 = trustedKeys[keyId]
  if (!pubB64) return { accepted: false, reason: `Unknown signing key: "${keyId}"` }

  let publicKey
  try {
    publicKey = createPublicKey({
      key: Buffer.from(pubB64, 'base64'),
      format: 'der',
      type: 'spki'
    })
  } catch {
    return { accepted: false, reason: `Invalid public key for "${keyId}"` }
  }

  const message = Buffer.from(canonicalRegistryMessage(registry), 'utf8')
  let ok: boolean
  try {
    ok = verify(null, message, publicKey, Buffer.from(signatureB64, 'base64'))
  } catch {
    return { accepted: false, reason: 'Malformed signature' }
  }
  return ok ? { accepted: true } : { accepted: false, reason: 'Invalid signature (tampered or wrong key)' }
}
