/**
 * 加密 / 编码核心功能。
 *
 * - 哈希（MD5 / SHA-1 / SHA-256 / SHA-512）与 HMAC 为纯 TS 实现（无第三方依赖），
 *   用 RFC 1321 / FIPS 180 / RFC 4231 标准向量在 features.test.ts 中验证。
 * - 对称（AES-GCM + PBKDF2）与非对称（RSA-OAEP / RSA-PSS）基于浏览器 Web Crypto API。
 */

// ---------- 字节与文本工具 ----------

const utf8Encoder = new TextEncoder()
const utf8Decoder = new TextDecoder()

function utf8Bytes(text: string): Uint8Array<ArrayBuffer> {
  return utf8Encoder.encode(text)
}

function utf8Text(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes)
}

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, '0')
  return s
}

function rotl32(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n))
}

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

/** 填充到 N 字节对齐：0x80 + 0 填充 + 8 字节大端位长度（MD5 为小端，单独处理） */
function padded(msg: Uint8Array, chunkSize: number, lengthBytes: number): { buf: Uint8Array; dv: DataView } {
  const len = msg.length
  const total = Math.ceil((len + 1 + lengthBytes) / chunkSize) * chunkSize
  const buf = new Uint8Array(total)
  buf.set(msg)
  buf[len] = 0x80
  return { buf, dv: new DataView(buf.buffer) }
}

// ---------- MD5（RFC 1321，纯 TS） ----------

const MD5_K: readonly number[] = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]

const MD5_S: readonly number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

function md5Bytes(msg: Uint8Array): Uint8Array {
  const { buf, dv } = padded(msg, 64, 8)
  const total = buf.length
  const bitLen = msg.length * 8
  // MD5 位长度为小端 64 位
  dv.setUint32(total - 8, bitLen >>> 0, true)
  dv.setUint32(total - 4, Math.floor(bitLen / 4294967296), true)

  let a0 = 0x67452301 | 0
  let b0 = 0xefcdab89 | 0
  let c0 = 0x98badcfe | 0
  let d0 = 0x10325476 | 0
  const m = new Array<number>(16).fill(0)

  for (let off = 0; off < total; off += 64) {
    for (let j = 0; j < 16; j++) m[j] = dv.getUint32(off + j * 4, true)
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) & 15
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) & 15
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) & 15
      }
      const x = (f + a + MD5_K[i]! + m[g]!) | 0
      a = d
      d = c
      c = b
      b = (b + rotl32(x, MD5_S[i]!)) | 0
    }
    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const out = new Uint8Array(16)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, a0, true)
  odv.setUint32(4, b0, true)
  odv.setUint32(8, c0, true)
  odv.setUint32(12, d0, true)
  return out
}

// ---------- SHA-1（FIPS 180-4，纯 TS） ----------

function sha1Bytes(msg: Uint8Array): Uint8Array {
  const { buf, dv } = padded(msg, 64, 8)
  const total = buf.length
  const bitLen = msg.length * 8
  dv.setUint32(total - 8, Math.floor(bitLen / 4294967296), false)
  dv.setUint32(total - 4, bitLen >>> 0, false)

  let h0 = 0x67452301 | 0
  let h1 = 0xefcdab89 | 0
  let h2 = 0x98badcfe | 0
  let h3 = 0x10325476 | 0
  let h4 = 0xc3d2e1f0 | 0
  const w = new Array<number>(80).fill(0)

  for (let off = 0; off < total; off += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(off + j * 4, false)
    for (let j = 16; j < 80; j++) {
      const x = w[j - 3]! ^ w[j - 8]! ^ w[j - 14]! ^ w[j - 16]!
      w[j] = rotl32(x, 1)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }
      const t = (rotl32(a, 5) + f + e + k + w[i]!) | 0
      e = d
      d = c
      c = rotl32(b, 30)
      b = a
      a = t
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }

  const out = new Uint8Array(20)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, h0, false)
  odv.setUint32(4, h1, false)
  odv.setUint32(8, h2, false)
  odv.setUint32(12, h3, false)
  odv.setUint32(16, h4, false)
  return out
}

// ---------- SHA-256（FIPS 180-4，纯 TS） ----------

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function sha256Bytes(msg: Uint8Array): Uint8Array {
  const { buf, dv } = padded(msg, 64, 8)
  const total = buf.length
  const bitLen = msg.length * 8
  dv.setUint32(total - 8, Math.floor(bitLen / 4294967296), false)
  dv.setUint32(total - 4, bitLen >>> 0, false)

  const h = [
    0x6a09e667 | 0, 0xbb67ae85 | 0, 0x3c6ef372 | 0, 0xa54ff53a | 0,
    0x510e527f | 0, 0x9b05688c | 0, 0x1f83d9ab | 0, 0x5be0cd19 | 0,
  ]
  const w = new Array<number>(64).fill(0)

  for (let off = 0; off < total; off += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(off + j * 4, false)
    for (let j = 16; j < 64; j++) {
      const x = w[j - 15]!
      const y = w[j - 2]!
      const s0 = rotr32(x, 7) ^ rotr32(x, 18) ^ (x >>> 3)
      const s1 = rotr32(y, 17) ^ rotr32(y, 19) ^ (y >>> 10)
      w[j] = (w[j - 16]! + s0 + w[j - 7]! + s1) | 0
    }
    let a = h[0]!
    let b = h[1]!
    let c = h[2]!
    let d = h[3]!
    let e = h[4]!
    let f = h[5]!
    let g = h[6]!
    let hh = h[7]!
    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + SHA256_K[i]! + w[i]!) | 0
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      hh = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    h[0] = (h[0]! + a) | 0
    h[1] = (h[1]! + b) | 0
    h[2] = (h[2]! + c) | 0
    h[3] = (h[3]! + d) | 0
    h[4] = (h[4]! + e) | 0
    h[5] = (h[5]! + f) | 0
    h[6] = (h[6]! + g) | 0
    h[7] = (h[7]! + hh) | 0
  }

  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i]!, false)
  return out
}

// ---------- SHA-512（FIPS 180-4，64 位字用 BigInt，纯 TS） ----------

const M64 = 0xffffffffffffffffn

const SHA512_K: readonly bigint[] = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
  0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
  0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
  0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
  0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
  0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
]

function rotr64(x: bigint, n: number): bigint {
  return ((x >> BigInt(n)) | (x << BigInt(64 - n))) & M64
}

function sha512Bytes(msg: Uint8Array): Uint8Array {
  const len = msg.length
  const total = Math.ceil((len + 1 + 16) / 128) * 128
  const buf = new Uint8Array(total)
  buf.set(msg)
  buf[len] = 0x80
  const dv = new DataView(buf.buffer)
  const bitLen = BigInt(len) * 8n
  // 128 位大端位长度（高 64 位在前；消息长度不会超过 2^64 位，高位恒为 0）
  dv.setUint32(total - 16, 0, false)
  dv.setUint32(total - 12, 0, false)
  dv.setUint32(total - 8, Number((bitLen >> 32n) & 0xffffffffn), false)
  dv.setUint32(total - 4, Number(bitLen & 0xffffffffn), false)

  const h: bigint[] = [
    0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
  ]
  const w = new Array<bigint>(80).fill(0n)

  for (let off = 0; off < total; off += 128) {
    for (let j = 0; j < 16; j++) {
      let v = 0n
      for (let b = 0; b < 8; b++) v = (v << 8n) | BigInt(buf[off + j * 8 + b]!)
      w[j] = v
    }
    for (let j = 16; j < 80; j++) {
      const x = w[j - 15]!
      const y = w[j - 2]!
      const s0 = rotr64(x, 1) ^ rotr64(x, 8) ^ (x >> 7n)
      const s1 = rotr64(y, 19) ^ rotr64(y, 61) ^ (y >> 6n)
      w[j] = (w[j - 16]! + s0 + w[j - 7]! + s1) & M64
    }
    let a = h[0]!
    let b = h[1]!
    let c = h[2]!
    let d = h[3]!
    let e = h[4]!
    let f = h[5]!
    let g = h[6]!
    let hh = h[7]!
    for (let i = 0; i < 80; i++) {
      const S1 = rotr64(e, 14) ^ rotr64(e, 18) ^ rotr64(e, 41)
      const ch = (e & f) ^ (e ^ M64) & g
      const t1 = (hh + S1 + ch + SHA512_K[i]! + w[i]!) & M64
      const S0 = rotr64(a, 28) ^ rotr64(a, 34) ^ rotr64(a, 39)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) & M64
      hh = g
      g = f
      f = e
      e = (d + t1) & M64
      d = c
      c = b
      b = a
      a = (t1 + t2) & M64
    }
    h[0] = (h[0]! + a) & M64
    h[1] = (h[1]! + b) & M64
    h[2] = (h[2]! + c) & M64
    h[3] = (h[3]! + d) & M64
    h[4] = (h[4]! + e) & M64
    h[5] = (h[5]! + f) & M64
    h[6] = (h[6]! + g) & M64
    h[7] = (h[7]! + hh) & M64
  }

  const out = new Uint8Array(64)
  const odv = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) {
    const v = h[i]!
    odv.setUint32(i * 8, Number((v >> 32n) & 0xffffffffn), false)
    odv.setUint32(i * 8 + 4, Number(v & 0xffffffffn), false)
  }
  return out
}

// ---------- 公开哈希 / HMAC 接口（hex 小写） ----------

export type HashAlgo = 'md5' | 'sha1' | 'sha256' | 'sha512'

const HASHES: Record<HashAlgo, { fn: (m: Uint8Array) => Uint8Array; block: number }> = {
  md5: { fn: md5Bytes, block: 64 },
  sha1: { fn: sha1Bytes, block: 64 },
  sha256: { fn: sha256Bytes, block: 64 },
  sha512: { fn: sha512Bytes, block: 128 },
}

/** MD5（RFC 1321），输入按 UTF-8 字节，输出 32 位小写 hex */
export function md5(text: string): string {
  return bytesToHex(md5Bytes(utf8Bytes(text)))
}

/** SHA-1（FIPS 180-4），输出 40 位小写 hex */
export function sha1(text: string): string {
  return bytesToHex(sha1Bytes(utf8Bytes(text)))
}

/** SHA-256（FIPS 180-4），输出 64 位小写 hex */
export function sha256(text: string): string {
  return bytesToHex(sha256Bytes(utf8Bytes(text)))
}

/** SHA-512（FIPS 180-4），输出 128 位小写 hex */
export function sha512(text: string): string {
  return bytesToHex(sha512Bytes(utf8Bytes(text)))
}

/** 通用 HMAC（RFC 2104），key 与 text 按 UTF-8 字节，输出小写 hex */
export function hmac(algo: HashAlgo, key: string, text: string): string {
  return bytesToHex(hmacBytes(algo, utf8Bytes(key), utf8Bytes(text)))
}

export function hmacBytes(algo: HashAlgo, key: Uint8Array, msg: Uint8Array): Uint8Array {
  const { fn, block } = HASHES[algo]
  const k = key.length > block ? fn(key) : key
  const iKey = new Uint8Array(block)
  const oKey = new Uint8Array(block)
  for (let i = 0; i < block; i++) {
    const b = i < k.length ? k[i]! : 0
    iKey[i] = b ^ 0x36
    oKey[i] = b ^ 0x5c
  }
  const inner = new Uint8Array(block + msg.length)
  inner.set(iKey)
  inner.set(msg, block)
  const innerHash = fn(inner)
  const outer = new Uint8Array(block + innerHash.length)
  outer.set(oKey)
  outer.set(innerHash, block)
  return fn(outer)
}

// ---------- Base64 / URL / Hex / Unicode 编码 ----------

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

let b64Rev: Map<string, number> | null = null
function b64Reverse(): Map<string, number> {
  if (!b64Rev) {
    b64Rev = new Map()
    for (let i = 0; i < 64; i++) b64Rev.set(B64_ALPHABET[i]!, i)
  }
  return b64Rev
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : undefined
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : undefined
    out += B64_ALPHABET[b0 >> 2]
    out += B64_ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : B64_ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : B64_ALPHABET[b2 & 63]
  }
  return out
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = b64.replace(/\s+/g, '')
  if (s.length % 4 === 1) throw new Error('非法 Base64：长度不合法')
  let end = s.length
  if (s.endsWith('==')) end -= 2
  else if (s.endsWith('=')) end -= 1
  if (/=/.test(s.slice(0, end))) throw new Error('非法 Base64：填充符只能在末尾')
  const rest = end % 4
  const outLen = Math.floor(end / 4) * 3 + (rest === 2 ? 1 : rest === 3 ? 2 : 0)
  const out = new Uint8Array(outLen)
  const rev = b64Reverse()
  let p = 0
  let acc = 0
  let bits = 0
  for (let i = 0; i < end; i++) {
    const ch = s[i]!
    const v = rev.get(ch)
    if (v === undefined) throw new Error(`非法 Base64 字符：${ch}`)
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[p] = (acc >> bits) & 0xff
      p++
    }
  }
  return out
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  let t = s.replace(/-/g, '+').replace(/_/g, '/')
  while (t.length % 4 !== 0) t += '='
  return base64ToBytes(t)
}

/** Base64 编码（UTF-8 安全，中文 / emoji 无损） */
export function base64Encode(text: string): string {
  return bytesToBase64(utf8Bytes(text))
}

/** Base64 解码（容忍换行与空白，缺省容错） */
export function base64Decode(b64: string): string {
  return utf8Text(base64ToBytes(b64))
}

/** URL 编码（encodeURIComponent 语义） */
export function urlEncode(text: string): string {
  return encodeURIComponent(text)
}

/** URL 解码 */
export function urlDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    throw new Error('非法 URL 编码字符串')
  }
}

/** UTF-8 字节 → 小写十六进制 */
export function hexEncode(text: string): string {
  return bytesToHex(utf8Bytes(text))
}

/** 十六进制 → 文本（容忍空白与大小写） */
export function hexDecode(hex: string): string {
  const s = hex.replace(/\s+/g, '')
  if (s.length === 0) return ''
  if (s.length % 2 !== 0) throw new Error('非法 Hex：长度必须为偶数')
  if (!/^[0-9a-fA-F]+$/.test(s)) throw new Error('非法 Hex：包含非十六进制字符')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return utf8Text(out)
}

/** 文本 → \uXXXX 转义（按 UTF-16 码元，emoji 输出代理对） */
export function unicodeEncode(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    out += '\\u' + text.charCodeAt(i).toString(16).padStart(4, '0')
  }
  return out
}

/** \uXXXX 转义 → 文本（非转义序列原样保留） */
export function unicodeDecode(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
}

// ---------- JWT 解析（不校验签名） ----------

export type JwtStatus = 'valid' | 'expired' | 'not-yet-valid'

export interface JwtDecoded {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  /** 第三段原文（base64url），未解签名 */
  signature: string
  headerJson: string
  payloadJson: string
  status: JwtStatus
  expAt: number | null
  nbfAt: number | null
}

function parseJwtPart(part: string, name: string): Record<string, unknown> {
  let text: string
  try {
    text = utf8Text(base64UrlToBytes(part))
  } catch {
    throw new Error(`非法 JWT：${name} 不是合法 base64url`)
  }
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error(`非法 JWT：${name} 不是合法 JSON`)
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new Error(`非法 JWT：${name} 不是 JSON 对象`)
  }
  return obj as Record<string, unknown>
}

/** 拆解 JWT 的 header / payload（base64url 解码 + pretty JSON），按 exp/nbf 判断时效；不校验签名 */
export function decodeJwt(token: string, now: number = Date.now()): JwtDecoded {
  const parts = token.trim().split('.')
  if (parts.length !== 3) throw new Error('非法 JWT：需要 header.payload.signature 三段')
  const header = parseJwtPart(parts[0]!, 'header')
  const payload = parseJwtPart(parts[1]!, 'payload')
  const signature = parts[2] ?? ''

  const nowSec = Math.floor(now / 1000)
  const expAt = typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null
  const nbfAt = typeof payload.nbf === 'number' && Number.isFinite(payload.nbf) ? payload.nbf : null
  let status: JwtStatus = 'valid'
  if (expAt !== null && nowSec >= expAt) status = 'expired'
  else if (nbfAt !== null && nowSec < nbfAt) status = 'not-yet-valid'

  return {
    header,
    payload,
    signature,
    headerJson: JSON.stringify(header, null, 2),
    payloadJson: JSON.stringify(payload, null, 2),
    status,
    expAt,
    nbfAt,
  }
}

// ---------- Web Crypto（AES / RSA） ----------

function webCrypto(): Crypto {
  const c = globalThis.crypto
  if (!c || !c.subtle) throw new Error('当前环境不支持 Web Crypto')
  return c
}

const PBKDF2_ITERATIONS = 100_000
const AES_IV_LEN = 12
const AES_SALT_LEN = 16

async function deriveAesKey(s: SubtleCrypto, salt: Uint8Array<ArrayBuffer>, passphrase: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const mat = await s.importKey('raw', utf8Bytes(passphrase), 'PBKDF2', false, ['deriveKey'])
  return s.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    mat,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}

/** AES-256-GCM 加密：PBKDF2(SHA-256, 10 万次) 派生密钥，输出 base64(iv(12) + salt(16) + 密文) */
export async function aesEncrypt(text: string, passphrase: string): Promise<string> {
  const c = webCrypto()
  if (!passphrase) throw new Error('请输入密码')
  const iv = c.getRandomValues(new Uint8Array(AES_IV_LEN))
  const salt = c.getRandomValues(new Uint8Array(AES_SALT_LEN))
  const key = await deriveAesKey(c.subtle, salt, passphrase, ['encrypt'])
  const ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8Bytes(text)))
  const out = new Uint8Array(iv.length + salt.length + ct.length)
  out.set(iv)
  out.set(salt, iv.length)
  out.set(ct, iv.length + salt.length)
  return bytesToBase64(out)
}

/** 解密 aesEncrypt 的自包含密文；密码错误或数据损坏抛出中文错误 */
export async function aesDecrypt(payload: string, passphrase: string): Promise<string> {
  const c = webCrypto()
  if (!passphrase) throw new Error('请输入密码')
  let data: Uint8Array<ArrayBuffer>
  try {
    data = base64ToBytes(payload.trim())
  } catch {
    throw new Error('非法密文：不是有效的 Base64')
  }
  if (data.length < AES_IV_LEN + AES_SALT_LEN + 16) throw new Error('密文长度不合法')
  const iv = data.slice(0, AES_IV_LEN)
  const salt = data.slice(AES_IV_LEN, AES_IV_LEN + AES_SALT_LEN)
  const ct = data.slice(AES_IV_LEN + AES_SALT_LEN)
  const key = await deriveAesKey(c.subtle, salt, passphrase, ['decrypt'])
  try {
    const plain = await c.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return utf8Text(new Uint8Array(plain))
  } catch {
    throw new Error('解密失败：密码错误或数据损坏')
  }
}

// ---------- RSA（OAEP 加密 / PSS 签名，Web Crypto） ----------

export interface RsaKeyPair {
  publicPem: string
  privatePem: string
}

export type RsaUsage = 'encrypt' | 'sign'

function toPem(der: Uint8Array, label: string): string {
  const lines = bytesToBase64(der).match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

function pemToBytes(pem: string, label: string): Uint8Array<ArrayBuffer> {
  const m = new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`).exec(pem)
  if (!m || !m[1]) throw new Error(`PEM 格式错误：缺少 -----BEGIN ${label}----- 段`)
  try {
    return base64ToBytes(m[1].replace(/\s+/g, ''))
  } catch {
    throw new Error(`PEM 格式错误：${label} 正文不是合法 Base64`)
  }
}

/**
 * 生成 RSA-2048 密钥对并导出 PEM（spki / pkcs8）。
 * usage=encrypt → RSA-OAEP(SHA-256)；usage=sign → RSA-PSS(SHA-256)。
 */
export async function rsaGenerateKeyPair(usage: RsaUsage = 'encrypt'): Promise<RsaKeyPair> {
  const s = webCrypto().subtle
  const algo: RsaHashedKeyGenParams = {
    name: usage === 'sign' ? 'RSA-PSS' : 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }
  const usages: KeyUsage[] = usage === 'sign' ? ['sign', 'verify'] : ['encrypt', 'decrypt']
  const pair = await s.generateKey(algo, true, usages)
  const spki = new Uint8Array(await s.exportKey('spki', pair.publicKey))
  const pkcs8 = new Uint8Array(await s.exportKey('pkcs8', pair.privateKey))
  return { publicPem: toPem(spki, 'PUBLIC KEY'), privatePem: toPem(pkcs8, 'PRIVATE KEY') }
}

/** RSA-OAEP 加密（公钥 PEM），输出 Base64 */
export async function rsaEncrypt(text: string, publicPem: string): Promise<string> {
  const s = webCrypto().subtle
  const key = await s.importKey('spki', pemToBytes(publicPem, 'PUBLIC KEY'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
  const ct = new Uint8Array(await s.encrypt({ name: 'RSA-OAEP' }, key, utf8Bytes(text)))
  return bytesToBase64(ct)
}

/** RSA-OAEP 解密（私钥 PEM） */
export async function rsaDecrypt(payload: string, privatePem: string): Promise<string> {
  const s = webCrypto().subtle
  let data: Uint8Array<ArrayBuffer>
  try {
    data = base64ToBytes(payload.trim())
  } catch {
    throw new Error('非法密文：不是有效的 Base64')
  }
  const key = await s.importKey('pkcs8', pemToBytes(privatePem, 'PRIVATE KEY'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'])
  try {
    const plain = await s.decrypt({ name: 'RSA-OAEP' }, key, data)
    return utf8Text(new Uint8Array(plain))
  } catch {
    throw new Error('RSA 解密失败：密钥不匹配或数据损坏')
  }
}

/** RSA-PSS(SHA-256, saltLength 32) 签名（私钥 PEM），输出 Base64 */
export async function rsaSign(text: string, privatePem: string): Promise<string> {
  const s = webCrypto().subtle
  const key = await s.importKey('pkcs8', pemToBytes(privatePem, 'PRIVATE KEY'), { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await s.sign({ name: 'RSA-PSS', saltLength: 32 }, key, utf8Bytes(text)))
  return bytesToBase64(sig)
}

/** RSA-PSS 验签（公钥 PEM）；输入不合法一律返回 false，不抛错 */
export async function rsaVerify(text: string, signatureB64: string, publicPem: string): Promise<boolean> {
  const s = webCrypto().subtle
  try {
    const sig = base64ToBytes(signatureB64.trim())
    const key = await s.importKey('spki', pemToBytes(publicPem, 'PUBLIC KEY'), { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['verify'])
    return s.verify({ name: 'RSA-PSS', saltLength: 32 }, key, sig, utf8Bytes(text))
  } catch {
    return false
  }
}
