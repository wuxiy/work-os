// Verifies the Ed25519 registry signing logic (happy path + tamper + unknown
// key). Pure node:crypto — no Electron — exercises the real verifyRegistrySignature.
// Run: pnpm smoke:sign
import { generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  canonicalRegistryMessage,
  type MarketplaceRegistry
} from '../src/shared/plugin-kit/marketplace'
import { verifyRegistrySignature } from '../src/main/plugin/signing'

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error('assertion failed: ' + msg)
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
const trusted = { k1: pubB64 }

const registry: MarketplaceRegistry = {
  name: 'Test',
  updated: '2026-01-01T00:00:00Z',
  plugins: [{ id: 'demo', name: 'Demo', version: '1.0.0', download: 'plugins/demo.zip', sha256: 'abc123' }]
}

const signature = sign(null, Buffer.from(canonicalRegistryMessage(registry), 'utf8'), privateKey).toString('base64')

// 1. valid signature is accepted
const ok = verifyRegistrySignature(registry, signature, 'k1', trusted)
assert(ok.accepted === true, 'valid signature accepted')
console.log('SMOKE-SIGN valid signature: accepted ✓')

// 2. tampered content is rejected
const tampered: MarketplaceRegistry = {
  ...registry,
  plugins: [{ ...registry.plugins[0], sha256: 'deadbeef' }]
}
const bad = verifyRegistrySignature(tampered, signature, 'k1', trusted)
assert(bad.accepted === false, 'tampered registry rejected')
console.log('SMOKE-SIGN tampered registry: rejected ✓')

// 3. unknown key id is rejected
const unknown = verifyRegistrySignature(registry, signature, 'someone-else', trusted)
assert(unknown.accepted === false, 'unknown key rejected')
console.log('SMOKE-SIGN unknown keyId: rejected ✓')

// 4. canonical message is stable / deterministic
const again = canonicalRegistryMessage(registry)
assert(again === canonicalRegistryMessage({ ...registry, signature: 'x', keyId: 'y' }), 'canonical ignores signature/keyId')
console.log('SMOKE-SIGN canonical stable ✓')

// 5. round-trip the REAL marketplace/registry.json through sign → verify
const realPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'marketplace', 'registry.json')
if (existsSync(realPath)) {
  const real = JSON.parse(readFileSync(realPath, 'utf8')) as MarketplaceRegistry
  delete real.signature
  delete real.keyId
  const realSig = sign(null, Buffer.from(canonicalRegistryMessage(real), 'utf8'), privateKey).toString('base64')
  const realOk = verifyRegistrySignature(real, realSig, 'k1', trusted)
  assert(realOk.accepted === true, 'real registry verifies')
  const realTampered = { ...real, plugins: [{ ...(real.plugins[0] as object), sha256: 'tampered' }] }
  const realBad = verifyRegistrySignature(realTampered as MarketplaceRegistry, realSig, 'k1', trusted)
  assert(realBad.accepted === false, 'real registry tamper rejected')
  console.log(`SMOKE-SIGN real registry (${real.plugins.length} plugins) round-trip ✓`)
} else {
  console.log('SMOKE-SIGN real registry: skipped (run pnpm build:marketplace)')
}

console.log('SMOKE-SIGN RESULT: PASS')
