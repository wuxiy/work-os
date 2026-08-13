// Generates simple solid-color logo PNGs for the built-in plugins.
// No external deps — uses Node's zlib (crc32 is available on Node 22+).
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function makePng(size, [r, g, b]) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const rowLen = 1 + size * 4
  const raw = Buffer.alloc(rowLen * size)
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const o = y * rowLen + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = 255
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const logos = [
  { file: 'plugins/json-formatter/logo.png', color: [245, 158, 11] },
  { file: 'plugins/websocket-tester/logo.png', color: [16, 185, 129] },
  { file: 'plugins/crypto-tools/logo.png', color: [139, 92, 246] }
]

for (const l of logos) {
  const p = resolve(root, l.file)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, makePng(64, l.color))
  console.log('wrote', l.file)
}

// App icon — electron-builder converts this single PNG to .icns / .ico.
const appIcon = resolve(root, 'build/icon.png')
mkdirSync(dirname(appIcon), { recursive: true })
writeFileSync(appIcon, makePng(1024, [59, 130, 246]))
console.log('wrote build/icon.png')
