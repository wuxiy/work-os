import { describe, expect, it } from 'vitest'
import {
  addCollection,
  addChild,
  appendQuery,
  applyPathVariables,
  base64ToBytes,
  bytesToBase64,
  emptyRequest,
  findNode,
  isDescendant,
  moveNode,
  parseCurl,
  prettyBody,
  removeNode,
  renameNode,
  renderTemplate,
  resolveRequest,
  toCurl,
  tokenizeShell,
  updateRequest,
  type CollectionNode,
  type WorkspaceTree,
} from './features'

const CURL_SAMPLE = `curl -X POST 'http://localhost:8080/echo' -H 'Content-Type: application/json' -d '{"a":1}'`

// ---------- cURL ----------

describe('parseCurl / toCurl（验收 H2）', () => {
  it('解析标准 POST 命令', () => {
    const r = parseCurl(CURL_SAMPLE)
    expect(r).toEqual({
      method: 'POST',
      url: 'http://localhost:8080/echo',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
      auth: undefined,
    })
  })

  it('无旗标时默认 GET', () => {
    expect(parseCurl('curl https://api.example.com/users')).toEqual({
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: {},
      body: null,
      auth: undefined,
    })
  })

  it('有 -d 无 -X 时推断 POST', () => {
    expect(parseCurl(`curl http://a.dev/api -d 'x=1'`).method).toBe('POST')
  })

  it('双引号与反斜杠转义', () => {
    const r = parseCurl(`curl -X PUT "http://a.dev/api" -d "{\\"x\\":\\"y\\"}"`)
    expect(r.method).toBe('PUT')
    expect(r.body).toBe('{"x":"y"}')
  })

  it('-u 解析 Basic 认证', () => {
    const r = parseCurl(`curl -u 'user:pass' http://a.dev/basic`)
    expect(r.auth).toEqual({ user: 'user', password: 'pass' })
  })

  it('--request= / -XPOST / --data-raw= 等价形式', () => {
    expect(parseCurl('curl --request=DELETE http://a.dev/1').method).toBe('DELETE')
    expect(parseCurl('curl -XPATCH http://a.dev/1').method).toBe('PATCH')
    expect(parseCurl(`curl http://a.dev --data-raw='k=v'`).body).toBe('k=v')
  })

  it('多个 -H 合并、忽略布尔旗标与续行', () => {
    const r = parseCurl(`curl -s -k -L \\\n  -H 'Accept: application/json' \\\n  -H 'X-Token: abc' \\\n  http://a.dev/api`)
    expect(r.headers).toEqual({ Accept: 'application/json', 'X-Token': 'abc' })
    expect(r.url).toBe('http://a.dev/api')
    expect(r.method).toBe('GET')
  })

  it('toCurl 往返语义等价', () => {
    const cases = [
      parseCurl(CURL_SAMPLE),
      parseCurl('curl https://api.example.com/users'),
      parseCurl(`curl -X PUT "http://a.dev/api" -d "{\\"x\\":\\"y\\"}"`),
      parseCurl(`curl -u 'user:pass' http://a.dev/basic`),
      { method: 'DELETE' as const, url: 'http://a.dev/it\'s', headers: { 'X-A': 'b' }, body: "a='1'", auth: undefined },
    ]
    for (const c of cases) {
      expect(parseCurl(toCurl(c))).toEqual(c)
    }
  })
})

describe('tokenizeShell', () => {
  it('单双引号与转义', () => {
    expect(tokenizeShell(`-H 'A: b c'`)).toEqual(['-H', 'A: b c'])
    expect(tokenizeShell(`-d "he said \\"hi\\""`)).toEqual(['-d', 'he said "hi"'])
    expect(tokenizeShell(`it\\'s`)).toEqual(["it's"])
  })
})

// ---------- 模板变量 ----------

describe('renderTemplate（验收 H2）', () => {
  it('渲染 {{baseUrl}}/{{token}}/{{userId}}', () => {
    const vars = { baseUrl: 'http://localhost:3000', token: 'abc', userId: '42' }
    const r = renderTemplate('{{baseUrl}}/users/{{userId}}?token={{token}}', vars)
    expect(r.text).toBe('http://localhost:3000/users/42?token=abc')
    expect(r.missing).toEqual([])
  })

  it('未定义变量原样保留并去重收集', () => {
    const r = renderTemplate('{{a}}/{{b}}/{{a}}/{{c}}', { a: '1' })
    expect(r.text).toBe('1/{{b}}/1/{{c}}')
    expect(r.missing).toEqual(['b', 'c'])
  })

  it('允许 {{ name }} 空白与无变量的文本', () => {
    expect(renderTemplate('{{ name }}!', { name: 'ok' }).text).toBe('ok!')
    expect(renderTemplate('plain text', {}).missing).toEqual([])
  })
})

// ---------- Collection 树 ----------

function demoTree(): WorkspaceTree {
  let ws: WorkspaceTree = { collections: [] }
  ws = addCollection(ws, { id: 'c1', kind: 'collection', name: '示例服务', children: [] } satisfies CollectionNode)
  ws = addChild(ws, 'c1', { id: 'f1', kind: 'folder', name: '用户', children: [] })
  ws = addChild(ws, 'f1', { id: 'r1', kind: 'request', name: '获取用户', request: { ...emptyRequest(), url: 'http://a.dev/users/:id' } })
  ws = addChild(ws, 'c1', { id: 'r2', kind: 'request', name: '健康检查', request: emptyRequest() })
  return ws
}

describe('Collection 树操作（验收 H1/H2）', () => {
  it('增：Collection/Folder/Request 层级正确', () => {
    const ws = demoTree()
    expect(findNode(ws, 'c1')?.kind).toBe('collection')
    expect(findNode(ws, 'f1')?.kind).toBe('folder')
    expect(findNode(ws, 'r1')?.kind).toBe('request')
  })

  it('改：重命名与更新请求', () => {
    let ws = renameNode(demoTree(), 'f1', '用户模块')
    expect(findNode(ws, 'f1')?.name).toBe('用户模块')
    ws = updateRequest(ws, 'r1', { method: 'POST' })
    const n = findNode(ws, 'r1')
    expect(n?.kind).toBe('request')
    expect(n && n.kind === 'request' ? n.request.method : '').toBe('POST')
  })

  it('删：删除请求与整棵 Collection', () => {
    const ws = removeNode(demoTree(), 'c1')
    expect(findNode(ws, 'r1')).toBeNull()
    expect(ws.collections).toHaveLength(0)
  })

  it('移动：请求移入另一 Folder，且拒绝移入自身后代', () => {
    let ws = demoTree()
    ws = addCollection(ws, { id: 'c2', kind: 'collection', name: '备份', children: [] })
    ws = moveNode(ws, 'r2', 'f1')
    const f1 = findNode(ws, 'f1')
    expect(f1?.kind).toBe('folder')
    expect(f1 && f1.kind === 'folder' ? f1.children.map((c) => c.id) : []).toContain('r2')
    // f1 移入自己的后代 r1（请求不能当容器）→ 原样返回
    const before = JSON.stringify(ws)
    expect(JSON.stringify(moveNode(ws, 'f1', 'r1'))).toBe(before)
  })

  it('isDescendant 判定后代关系', () => {
    const ws = demoTree()
    expect(isDescendant(ws, 'c1', 'r1')).toBe(true)
    expect(isDescendant(ws, 'f1', 'r1')).toBe(true)
    expect(isDescendant(ws, 'r1', 'c1')).toBe(false)
  })
})

// ---------- 请求组装 ----------

describe('URL 组装', () => {
  it('applyPathVariables 替换 :id', () => {
    expect(applyPathVariables('http://a.dev/users/:id/orders/:oid', { id: '7', oid: '9' })).toBe('http://a.dev/users/7/orders/9')
    expect(applyPathVariables('http://a.dev:8080/users/:id', { id: '7' })).toBe('http://a.dev:8080/users/7')
  })

  it('appendQuery 拼接与编码', () => {
    expect(appendQuery('http://a.dev/x', [{ key: 'a', value: '1' }, { key: 'q', value: '中 文' }])).toBe('http://a.dev/x?a=1&q=%E4%B8%AD+%E6%96%87')
    expect(appendQuery('http://a.dev/x?z=0', [{ key: 'a', value: '1' }])).toBe('http://a.dev/x?z=0&a=1')
    expect(appendQuery('http://a.dev/x', [])).toBe('http://a.dev/x')
  })
})

describe('resolveRequest（验收 H3）', () => {
  it('完整组装：模板 + 路径 + Query + Cookie + Bearer + JSON Body', () => {
    const spec = {
      ...emptyRequest(),
      method: 'POST' as const,
      url: '{{baseUrl}}/users/:id/posts',
      query: [{ key: 'lang', value: 'zh', enabled: true }],
      pathVars: [{ key: 'id', value: '{{userId}}', enabled: true }],
      headers: [{ key: 'X-Trace', value: 't1', enabled: true }],
      cookies: [{ key: 'sid', value: 's1', enabled: true }],
      bodyType: 'json' as const,
      bodyText: '{"title":"{{title}}"}',
      auth: { ...emptyRequest().auth, type: 'bearer' as const, bearerToken: '{{token}}' },
    }
    const r = resolveRequest(spec, { baseUrl: 'http://a.dev', userId: '7', title: '你好', token: 'tk' })
    expect(r.url).toBe('http://a.dev/users/7/posts?lang=zh')
    expect(r.headers['X-Trace']).toBe('t1')
    expect(r.headers['Cookie']).toBe('sid=s1')
    expect(r.headers['Authorization']).toBe('Bearer tk')
    expect(r.headers['Content-Type']).toBe('application/json')
    expect(r.body).toEqual({ kind: 'json', content: '{"title":"你好"}' })
    expect(r.missing).toEqual([])
  })

  it('未定义变量统一收集（URL/Header/Body/Auth）', () => {
    const spec = {
      ...emptyRequest(),
      url: '{{baseUrl}}/x',
      headers: [{ key: 'X-K', value: '{{token}}', enabled: true }],
      bodyType: 'text' as const,
      bodyText: '{{userId}}',
    }
    const r = resolveRequest(spec, {})
    expect(r.missing).toEqual(['baseUrl', 'token', 'userId'])
  })

  it('Basic Auth 拼 base64、API Key 自定义 Header 名', () => {
    const basic = resolveRequest(
      { ...emptyRequest(), auth: { ...emptyRequest().auth, type: 'basic', basicUser: 'u', basicPassword: 'p' } },
      {},
    )
    expect(basic.headers['Authorization']).toBe(`Basic ${btoa('u:p')}`)
    const apiKey = resolveRequest(
      { ...emptyRequest(), auth: { ...emptyRequest().auth, type: 'apikey', apiKeyName: 'X-Key', apiKeyValue: 'v1' } },
      {},
    )
    expect(apiKey.headers['X-Key']).toBe('v1')
  })

  it('Body 类型：urlencoded 编码、multipart 边界、binary base64', () => {
    const ue = resolveRequest(
      { ...emptyRequest(), bodyType: 'urlencoded', bodyForm: [{ key: 'a', value: '1', enabled: true }, { key: 'b', value: 'x y', enabled: true }] },
      {},
    )
    expect(ue.body).toEqual({ kind: 'text', content: 'a=1&b=x+y' })
    expect(ue.headers['Content-Type']).toBe('application/x-www-form-urlencoded')

    const mp = resolveRequest({ ...emptyRequest(), bodyType: 'form', bodyForm: [{ key: 'f', value: 'v', enabled: true }] }, {})
    expect(mp.body.content).toContain('Content-Disposition: form-data; name="f"')
    expect(mp.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/)

    const bin = resolveRequest({ ...emptyRequest(), bodyType: 'binary', bodyB64: 'QUJD' }, {})
    expect(bin.body).toEqual({ kind: 'binary_b64', content: 'QUJD' })
  })

  it('禁用行与空 Key 被忽略', () => {
    const r = resolveRequest(
      {
        ...emptyRequest(),
        query: [{ key: 'a', value: '1', enabled: false }, { key: '', value: 'x', enabled: true }],
        headers: [{ key: 'X-Off', value: '1', enabled: false }],
      },
      {},
    )
    expect(r.url).toBe('')
    expect(r.headers).toEqual({})
  })
})

// ---------- 工具 ----------

describe('工具函数', () => {
  it('base64 编解码往返（含中文）', () => {
    const bytes = new TextEncoder().encode('hello 中文')
    const back = base64ToBytes(bytesToBase64(bytes))
    expect(new TextDecoder().decode(back)).toBe('hello 中文')
  })

  it('prettyBody JSON 美化，非 JSON 原样', () => {
    expect(prettyBody('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyBody('plain')).toBe('plain')
  })
})
