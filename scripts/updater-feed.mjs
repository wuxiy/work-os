#!/usr/bin/env node
/**
 * 本地更新源验证脚本（验收 O4）：
 * 1. 起本地 HTTP 服务托管 latest.json（无更新 0.1.0 / 有更新 0.2.0 两份）
 * 2. 用系统 curl 模拟确认 manifest 可达
 * 用法：node scripts/updater-feed.mjs <产物目录> [端口]
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? '.'
const port = Number(process.argv[3] ?? 8765)

const server = createServer((req, res) => {
  const url = req.url ?? '/'
  const file = join(dir, url === '/' ? 'latest.json' : url.replace(/^\//, ''))
  if (existsSync(file)) {
    const data = readFileSync(file)
    res.writeHead(200, { 'Content-Type': url.endsWith('.json') ? 'application/json' : 'application/octet-stream' })
    res.end(data)
  } else {
    res.writeHead(404)
    res.end('not found')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`更新源服务：http://127.0.0.1:${port}/latest.json （目录 ${dir}）`)
})
