// Generate an Ed25519 keypair for signing the marketplace registry.
// Pin the PUBLIC key in Work-OS Settings → Marketplace → Signature Trust.
// Keep the PRIVATE key secret. Run: pnpm keygen
import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' }
})

console.log('PUBLIC  (base64 SPKI) :', publicKey.toString('base64'))
console.log('PRIVATE (base64 PKCS8):', privateKey.toString('base64'))
console.log('\nNext:')
console.log('  1. Pin the PUBLIC key in Work-OS → Settings → Marketplace → Signature Trust.')
console.log('  2. Sign your registry:  WORKOS_SIGNING_KEY_ID=<id> WORKOS_SIGNING_KEY=<private> pnpm sign:registry')
