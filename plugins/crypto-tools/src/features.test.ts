import { describe, expect, it } from 'vitest'
import {
  base64Decode,
  base64Encode,
  decodeJwt,
  hexDecode,
  hexEncode,
  hmac,
  md5,
  sha1,
  sha256,
  sha512,
  unicodeDecode,
  unicodeEncode,
  urlDecode,
  urlEncode,
} from './features'

describe('哈希标准向量（J2：MD5 RFC 1321 / SHA FIPS 180）', () => {
  it('MD5：RFC 1321 官方向量', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0')
    expect(md5('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b')
    expect(md5('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')).toBe('d174ab98d277d9f5a5611c2c9f419d9f')
    expect(md5('1234567890'.repeat(8))).toBe('57edf4a22be3c955ac49da2e2107b67a')
  })

  it('MD5：UTF-8 中文与跨块长输入', () => {
    expect(md5('你好')).toBe('7eca689f0d3389d9dea66ae112e5cfd7')
    expect(md5('a'.repeat(1000))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8')
    expect(md5('Work-OS 加密工具 🎉 123')).toBe('43afc8514604e350b7806b2241e8b29c')
  })

  it('SHA-1：FIPS 180-2 官方向量', () => {
    expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(sha1('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1')
    expect(sha1('The quick brown fox jumps over the lazy dog')).toBe('2fd4e1c67a2d28fced849ee1bb76e7391b93eb12')
  })

  it('SHA-1：中文与长输入', () => {
    expect(sha1('Work-OS 加密工具 🎉 123')).toBe('4da6117be4fea064359e0ca78f63ba4972426fde')
    expect(sha1('a'.repeat(1000))).toBe('291e9a6c66994949b57ba5e650361e98fc36b1ba')
  })

  it('SHA-256：FIPS 180-2 官方向量', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
    expect(sha256('The quick brown fox jumps over the lazy dog')).toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592')
  })

  it('SHA-256：中文与长输入', () => {
    expect(sha256('Work-OS 加密工具 🎉 123')).toBe('845e53e38635779541ec31c4707394a3f5cb36c823e83864d405563791d063dd')
    expect(sha256('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
  })

  it('SHA-512：FIPS 180-2 官方向量', () => {
    expect(sha512('')).toBe('cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e')
    expect(sha512('abc')).toBe('ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f')
    expect(sha512('The quick brown fox jumps over the lazy dog')).toBe('07e547d9586f6a73f73fbac0435ed76951218fb7d0c8d788a309d785436bbb642e93a252a954f23912547d1e8a3b5ed6e1bfd7097821233fa0538f3db854fee6')
  })

  it('SHA-512：中文与长输入', () => {
    expect(sha512('你好')).toBe('5232181bc0d9888f5c9746e410b4740eb461706ba5dacfbc93587cecfc8d068bac7737e92870d6745b11a25e9cd78b55f4ffc706f73cfcae5345f1b53fb8f6b5')
    expect(sha512('a'.repeat(1000))).toBe('67ba5535a46e3f86dbfbed8cbbaf0125c76ed549ff8b0b9e03e0c88cf90fa634fa7b12b47d77b694de488ace8d9a65967dc96df599727d3292a8d9d447709c97')
  })

  it('输出均为小写 hex 且长度正确', () => {
    expect(md5('abc')).toMatch(/^[0-9a-f]{32}$/)
    expect(sha1('abc')).toMatch(/^[0-9a-f]{40}$/)
    expect(sha256('abc')).toMatch(/^[0-9a-f]{64}$/)
    expect(sha512('abc')).toMatch(/^[0-9a-f]{128}$/)
  })
})

describe('HMAC：RFC 2202 / RFC 4231 标准向量', () => {
  const key1 = '\x0b'.repeat(20) // RFC 4231 TC1：20 字节 0x0b
  const tc2Key = 'Jefe'
  const tc2Data = 'what do ya want for nothing?'

  it('HMAC-SHA-1（RFC 2202 TC1 / TC2）', () => {
    expect(hmac('sha1', key1, 'Hi There')).toBe('b617318655057264e28bc0b6fb378c8ef146be00')
    expect(hmac('sha1', tc2Key, tc2Data)).toBe('effcdf6ae5eb2fa2d27416d5f184df9c259a7c79')
  })

  it('HMAC-SHA-256（RFC 4231 TC1 / TC2）', () => {
    expect(hmac('sha256', key1, 'Hi There')).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7')
    expect(hmac('sha256', tc2Key, tc2Data)).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })

  it('HMAC-SHA-512（RFC 4231 TC1 / TC2）', () => {
    expect(hmac('sha512', key1, 'Hi There')).toBe('87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854')
    expect(hmac('sha512', tc2Key, tc2Data)).toBe('164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737')
  })

  it('密钥超过块大小（131 字节 > SHA-256 块长 64）需先哈希', () => {
    expect(hmac('sha256', '\x0b'.repeat(131), 'Hi There')).toBe('03f731975a2104815e7a646158f58799eb40a54f41c0243d1540e8d2517a13cb')
  })

  it('HMAC-MD5（RFC 1321 家族，RFC 2202 TC1）', () => {
    expect(hmac('md5', key1, 'Hi There')).toBe('5ccec34ea9656392457fa1ac27f08fbc')
  })
})

describe('编码 / 解码往返一致（J1）', () => {
  const samples = ['', 'hello work-os', '你好，世界 🎉', 'a b&c=1?q=/中#文', 'line1\nline2\ttab']

  it('Base64：标准向量与 UTF-8 往返', () => {
    expect(base64Encode('abc')).toBe('YWJj')
    expect(base64Encode('a')).toBe('YQ==')
    expect(base64Encode('ab')).toBe('YWI=')
    expect(base64Encode('你好')).toBe('5L2g5aW9')
    expect(base64Encode('🎉 Work-OS 中文')).toBe('8J+OiSBXb3JrLU9TIOS4reaWhw==')
    expect(base64Decode('YWJj')).toBe('abc')
    expect(base64Decode('5L2g5aW9')).toBe('你好')
    for (const s of samples) expect(base64Decode(base64Encode(s))).toBe(s)
  })

  it('Base64：容错与非法输入', () => {
    expect(base64Decode('YWJ j\n')).toBe('abc') // 容忍空白
    expect(() => base64Decode('a')).toThrow() // 长度 % 4 === 1
    expect(() => base64Decode('YW=j')).toThrow() // 填充符位置非法
    expect(() => base64Decode('YW*!')).toThrow() // 非法字符
  })

  it('URL 编码往返', () => {
    expect(urlEncode('a b&c=1')).toBe('a%20b%26c%3D1')
    expect(urlDecode('a%20b%26c%3D1')).toBe('a b&c=1')
    for (const s of samples) expect(urlDecode(urlEncode(s))).toBe(s)
    expect(() => urlDecode('%ZZ')).toThrow()
  })

  it('Hex 编码往返', () => {
    expect(hexEncode('abc')).toBe('616263')
    expect(hexEncode('你好')).toBe('e4bda0e5a5bd')
    expect(hexDecode('616263')).toBe('abc')
    expect(hexDecode('E4BDA0E5A5BD')).toBe('你好') // 容忍大写
    for (const s of samples) expect(hexDecode(hexEncode(s))).toBe(s)
    expect(() => hexDecode('abc')).toThrow() // 奇数长度
    expect(() => hexDecode('zz')).toThrow() // 非 hex 字符
  })

  it('Unicode \\uXXXX 编码往返（含 emoji 代理对）', () => {
    expect(unicodeEncode('A中')).toBe('\\u0041\\u4e2d')
    expect(unicodeDecode('\\u0041\\u4e2d')).toBe('A中')
    expect(unicodeEncode('😀')).toBe('\\ud83d\\ude00')
    expect(unicodeDecode('\\ud83d\\ude00')).toBe('😀')
    for (const s of samples) expect(unicodeDecode(unicodeEncode(s))).toBe(s)
    // 非转义内容原样保留
    expect(unicodeDecode('plain \\u0041')).toBe('plain A')
  })
})

describe('JWT 解析（J4：不校验签名，判定时效）', () => {
  const b64url = (s: string): string =>
    base64Encode(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const NOW = 1_700_000_000_000 // 固定"当前时间"，保证测试确定性

  function token(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }): string {
    return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`
  }

  it('有效 token：拆出 header / payload，状态 valid', () => {
    const t = token({ sub: '1234567890', name: 'Work OS', admin: true, exp: NOW / 1000 + 3600 })
    const d = decodeJwt(t, NOW)
    expect(d.status).toBe('valid')
    expect(d.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(d.payload.sub).toBe('1234567890')
    expect(d.payload.name).toBe('Work OS')
    expect(d.signature).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')
    expect(d.headerJson).toContain('"alg": "HS256"')
    expect(d.payloadJson).toContain('"admin": true')
    expect(d.expAt).toBe(NOW / 1000 + 3600)
  })

  it('已过期：exp 早于当前时间', () => {
    expect(decodeJwt(token({ exp: NOW / 1000 - 1 }), NOW).status).toBe('expired')
    expect(decodeJwt(token({ exp: NOW / 1000 }), NOW).status).toBe('expired') // 边界：等于即过期
  })

  it('尚未生效：nbf 晚于当前时间', () => {
    expect(decodeJwt(token({ nbf: NOW / 1000 + 60 }), NOW).status).toBe('not-yet-valid')
  })

  it('无 exp / nbf 字段视为 valid', () => {
    expect(decodeJwt(token({ sub: 'x' }), NOW).status).toBe('valid')
  })

  it('非法 token 抛错', () => {
    expect(() => decodeJwt('', NOW)).toThrow()
    expect(() => decodeJwt('abc.def', NOW)).toThrow() // 不是三段
    expect(() => decodeJwt('abc.def.ghi.jkl', NOW)).toThrow()
    expect(() => decodeJwt('!!!.e30.x', NOW)).toThrow() // header 非法 base64url
    expect(() => decodeJwt(b64url('not-json') + '.e30.x', NOW)).toThrow() // header 非法 JSON
    expect(() => decodeJwt(b64url(JSON.stringify({ alg: 'HS256' })) + '.' + b64url('[1,2]') + '.x', NOW)).toThrow() // payload 是数组
  })
})
