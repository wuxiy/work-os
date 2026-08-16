/**
 * workos-cli 库逻辑：manual pack 等（技术架构 §20）
 * bin/workos.mjs 是 CLI 入口，此处为可测试的实现。
 */
import { zipSync } from 'fflate'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'

/** 递归收集目录下所有文件（相对路径） */
export function collectFiles(dir: string, base = dir): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = []
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store' || name === '.git') continue
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      out.push(...collectFiles(abs, base))
    } else {
      out.push({ rel: relative(base, abs), abs })
    }
  }
  return out
}

export interface PackResult {
  file: string
  entries: number
  sha256: string
}

/** 打包手册仓库为 .workos-plugin（ZIP：manifest.json + dist/） */
export function packManual(repoDir: string, outPath?: string): PackResult {
  const manifestPath = join(repoDir, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error(`缺少 manifest.json：${manifestPath}`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { id: string; version: string; manual?: { index: string } }
  const distDir = join(repoDir, 'dist')
  if (!existsSync(distDir)) throw new Error('缺少 dist/ 目录（先执行 build）')
  const indexFile = manifest.manual?.index ?? 'dist/index.json'
  if (!existsSync(join(repoDir, indexFile))) throw new Error(`缺少 ${indexFile}（先执行 build）`)

  const files: Record<string, Uint8Array> = {
    'manifest.json': new Uint8Array(readFileSync(manifestPath)),
  }
  let count = 0
  for (const f of collectFiles(distDir)) {
    files[join('dist', f.rel)] = new Uint8Array(readFileSync(f.abs))
    count++
  }
  const zipped = zipSync(files, { level: 9 })
  const out = outPath ?? join(repoDir, 'dist', `${basename(manifest.id.split('.').pop() ?? 'manual')}-manual.workos-plugin`)
  writeFileSync(out, zipped)
  const sha256 = createHash('sha256').update(zipped).digest('hex')
  return { file: out, entries: count, sha256 }
}
