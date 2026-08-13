// Verifies the trigger-context detection primitives on this machine: clipboard
// formats (image / file-url) and the frontmost-window osascript. Run:
//   pnpm exec electron scripts/smoke-context.cjs
const { app, clipboard, nativeImage } = require('electron')
const { execFile } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { promisify } = require('node:util')

const execFileP = promisify(execFile)
const run = async (cmd, args, timeoutMs = 1500) => {
  try {
    const { stdout } = await execFileP(cmd, args, { encoding: 'utf8', timeout: timeoutMs })
    return stdout.trim() || null
  } catch (e) {
    return `ERR: ${e.message.split('\n')[0]}`
  }
}

app.whenReady().then(async () => {
  const out = { platform: process.platform }

  // Seed the clipboard with a known-valid PNG (the generated plugin logo).
  const logoPath = join(__dirname, '..', 'plugins', 'json-formatter', 'logo.png')
  const img = nativeImage.createFromBuffer(readFileSync(logoPath))
  clipboard.writeImage(img)

  try {
    const formats = clipboard.availableFormats()
    out.formats = formats
    out.hasImage = formats.some((f) => f.startsWith('image/'))
    if (out.hasImage) out.imageDataUrlBytes = clipboard.readImage().toDataURL().length
    out.hasFileUrl = formats.includes('public.file-url')
  } catch (e) {
    out.clipboardError = e.message
  }

  if (process.platform === 'darwin') {
    out.frontmostApp = await run('osascript', [
      '-e',
      'tell application "System Events" to get name of first application process whose frontmost is true'
    ])
    out.frontmostTitle = await run('osascript', [
      '-e',
      'tell application "System Events" to get title of front window of (first application process whose frontmost is true)'
    ])
  }

  console.log('SMOKE-CONTEXT', JSON.stringify(out, null, 2))
  const ok = out.hasImage === true && typeof out.imageDataUrlBytes === 'number'
  console.log('SMOKE-CONTEXT RESULT:', ok ? 'PASS' : 'FAIL', '(img detection;', out.frontmostApp && !out.frontmostApp.startsWith('ERR') ? 'window ok' : 'window needs Automation consent)')
  if (!ok) process.exitCode = 1
  app.quit()
})

