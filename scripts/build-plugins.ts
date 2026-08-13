import { build, type InlineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve, join } from 'node:path'
import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const pluginsDir = resolve(root, 'plugins')
const outDir = resolve(root, 'out', 'plugins')

const watch = process.argv.includes('--watch') || process.argv.includes('-w')

function listPlugins(): string[] {
  if (!existsSync(pluginsDir)) return []
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

/**
 * Vite only emits assets referenced by index.html. A plugin's manifest
 * (plugin.json) and logo are not referenced, so we must copy them — plus any
 * other top-level file — into the build output so the host can discover them.
 *
 * CRITICAL: do NOT copy index.html. Vite transforms the source entry
 * (which references the dev-server path /src/main.tsx) into a built entry that
 * points at the hashed ./assets/*.js bundle. Copying the source index.html
 * over Vite's output would resurrect the /src/main.tsx reference, which 404s
 * under file:// → the plugin loads as a blank page.
 */
function copyStaticFiles(pluginRoot: string, outRoot: string): void {
  for (const entry of readdirSync(pluginRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) continue
    if (entry.name === 'index.html') continue
    copyFileSync(join(pluginRoot, entry.name), join(outRoot, entry.name))
  }
}

function configFor(name: string): InlineConfig {
  return {
    root: resolve(pluginsDir, name),
    // Relative base is mandatory: plugins load from file:// in their own
    // WebContentsView, so absolute "/assets/..." paths would break.
    base: './',
    resolve: {
      alias: {
        '@wb/plugin-kit': resolve(root, 'src/shared/plugin-kit/index.ts')
      }
    },
    plugins: [react()],
    build: {
      outDir: resolve(outDir, name),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(pluginsDir, name, 'index.html')
      }
    },
    logLevel: 'info'
  }
}

async function main(): Promise<void> {
  const names = listPlugins()
  if (names.length === 0) {
    console.log('[build-plugins] no plugins found under plugins/')
    return
  }

  for (const name of names) {
    const config = configFor(name)
    if (watch && config.build) config.build.watch = {}
    console.log(`[build-plugins] ${watch ? 'watching' : 'building'} ${name}…`)
    await build(config)
    copyStaticFiles(resolve(pluginsDir, name), resolve(outDir, name))
  }

  if (!watch) console.log('[build-plugins] done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
