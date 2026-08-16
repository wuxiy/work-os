#!/usr/bin/env node
/**
 * 构建全部内置插件并打包为 .workos-plugin，复制到 apps/desktop/src-tauri/plugins/
 * （技术架构 §32：第一方工具与第三方走同一分发格式）
 */
import { zipSync } from 'fflate'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pluginsDir = join(root, 'plugins')
const outDir = join(root, 'apps/desktop/src-tauri/plugins')

function collect(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store' || name === 'node_modules' || name === '.git') continue
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) out.push(...collect(abs, base))
    else out.push({ rel: relative(base, abs), abs })
  }
  return out
}

const skipBuild = process.env.WORKOS_SKIP_PLUGIN_BUILD === '1'
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : readdirSync(pluginsDir).filter((d) => statSync(join(pluginsDir, d)).isDirectory())

mkdirSync(outDir, { recursive: true })
// 清理旧包（保留 placeholder）
for (const f of readdirSync(outDir)) {
  if (f.endsWith('.workos-plugin') && f !== 'placeholder.workos-plugin') rmSync(join(outDir, f))
}

const summary = []
for (const name of targets) {
  const dir = join(pluginsDir, name)
  if (!existsSync(join(dir, 'manifest.json'))) continue
  if (!skipBuild) {
    execSync(`pnpm --filter @work-os/plugin-${name} build`, { stdio: 'inherit', cwd: root })
  }
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  const files = { 'manifest.json': new Uint8Array(readFileSync(join(dir, 'manifest.json'))) }
  const distDir = join(dir, 'dist')
  if (!existsSync(distDir)) {
    console.error(`✗ ${name}: 缺少 dist/（构建失败？）`)
    process.exit(1)
  }
  let count = 0
  for (const f of collect(distDir)) {
    files[join('dist', f.rel)] = new Uint8Array(readFileSync(f.abs))
    count++
  }
  const zipped = zipSync(files, { level: 9 })
  const out = join(outDir, `${name}.workos-plugin`)
  writeFileSync(out, zipped)
  const sha = createHash('sha256').update(zipped).digest('hex')
  summary.push({ name, id: manifest.id, version: manifest.version, file: out, files: count, sha256: sha })
}

for (const s of summary) {
  console.log(`✓ ${s.name} (${s.id} v${s.version}) → ${relative(root, s.file)} [${s.files} files, sha256 ${s.sha256.slice(0, 12)}…]`)
}
// 输出 registry 片段（可拼入静态 registry.json）
const registry = { plugins: summary.map((s) => ({ id: s.id, name: s.name, version: s.version, type: 'ui', download: `plugins/${s.name}.workos-plugin`, sha256: s.sha256 })) }
writeFileSync(join(outDir, 'builtin-registry.json'), JSON.stringify(registry, null, 2))
console.log(`✓ builtin-registry.json 已生成（${summary.length} 个内置插件）`)
