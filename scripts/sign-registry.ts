// Signs marketplace/registry.json with an Ed25519 private key and writes the
// signature + keyId back into the file. The verifier recomputes the same
// canonical message (see shared/plugin-kit/marketplace.ts).
//
//   WORKOS_SIGNING_KEY_ID=mykey WORKOS_SIGNING_KEY=<base64 pkcs8> pnpm sign:registry
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalRegistryMessage } from '../src/shared/plugin-kit/marketplace'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const regPath = resolve(root, 'marketplace/registry.json')

const keyId = process.env.WORKOS_SIGNING_KEY_ID
const privB64 = process.env.WORKOS_SIGNING_KEY
if (!keyId || !privB64) {
  console.error(
    'Set WORKOS_SIGNING_KEY_ID and WORKOS_SIGNING_KEY (run `pnpm keygen` to create a keypair).'
  )
  process.exit(1)
}

const reg = JSON.parse(readFileSync(regPath, 'utf8'))
// Sign over the unsigned content only (signature/keyId are recomputed below).
delete reg.signature
delete reg.keyId

const message = Buffer.from(canonicalRegistryMessage(reg), 'utf8')
const privateKey = createPrivateKey({
  key: Buffer.from(privB64, 'base64'),
  format: 'der',
  type: 'pkcs8'
})
const signature = sign(null, message, privateKey).toString('base64')

reg.keyId = keyId
reg.signature = signature
writeFileSync(regPath, JSON.stringify(reg, null, 2))
console.log(`[sign-registry] signed marketplace/registry.json with key "${keyId}"`)
