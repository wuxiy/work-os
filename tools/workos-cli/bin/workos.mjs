#!/usr/bin/env node
/**
 * workos CLI（技术架构 §20）
 * 用法：
 *   workos manual pack [--dir <repoDir>] [--out <file>]
 *   workos manual init <dir>
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { packManual } from '../src/index.ts'

const [cmd, sub, ...rest] = process.argv.slice(2)

function arg(name, fallback) {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : fallback
}

async function main() {
  if (cmd === 'manual' && sub === 'pack') {
    const dir = resolve(arg('dir', '.'))
    const out = arg('out', undefined)
    const r = packManual(dir, out ? resolve(out) : undefined)
    console.log(`✓ 已打包：${r.file}（${r.entries} 个文件）`)
    console.log(`  sha256: ${r.sha256}`)
    return
  }
  if (cmd === 'manual' && sub === 'init') {
    const dir = resolve(rest[0] ?? '.')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const files = {
      'source/upstream.json': JSON.stringify({ repo: 'https://github.com/jaywcjlove/linux-command', ref: 'master', commands: [] }, null, 2),
      'metadata/categories.yaml': '',
      'metadata/aliases.yaml': '',
      'metadata/tags.yaml': '',
    }
    for (const [f, content] of Object.entries(files)) {
      const p = join(dir, f)
      mkdirSync(join(p, '..'), { recursive: true })
      if (!existsSync(p)) writeFileSync(p, content)
    }
    console.log(`✓ 手册仓库已初始化：${dir}`)
    return
  }
  console.log('用法：workos manual pack [--dir <repoDir>] [--out <file>] | workos manual init <dir>')
}

main().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
