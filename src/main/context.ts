import { clipboard } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { TriggerContext } from '../shared/ipc/api'

const execFileP = promisify(execFile)

function fileUriToPath(uri: string): string {
  if (!uri) return ''
  try {
    const u = new URL(uri)
    if (u.protocol === 'file:') return decodeURIComponent(u.pathname)
  } catch {
    /* not a URI — treat as a raw path */
  }
  return uri
}

async function run(cmd: string, args: string[], timeoutMs = 1500): Promise<string | undefined> {
  try {
    const { stdout } = await execFileP(cmd, args, { encoding: 'utf8', timeout: timeoutMs })
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

/** Frontmost app + window title. macOS via osascript (may need Accessibility); Windows best-effort. */
async function getFrontmostWindow(): Promise<{ app: string; title?: string } | undefined> {
  if (process.platform === 'darwin') {
    const app = await run('osascript', [
      '-e',
      'tell application "System Events" to get name of first application process whose frontmost is true'
    ])
    if (!app) return undefined
    const title = await run('osascript', [
      '-e',
      'tell application "System Events" to get title of front window of (first application process whose frontmost is true)'
    ])
    return { app, title }
  }
  if (process.platform === 'win32') {
    const ps = `Add-Type @"
      using System; using System.Runtime.InteropServices; using System.Text;
      public class W { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); }
"@ -PassThru
$h = [W]::GetForegroundWindow(); $s = New-Object Text.StringBuilder 512; [void][W]::GetWindowText($h,$s,512); $s.ToString()`
    const title = await run('powershell', ['-NoProfile', '-Command', ps], 2500)
    return title ? { app: title, title } : undefined
  }
  return undefined
}

/**
 * Gather the live trigger context: clipboard image / files + the frontmost
 * window. Used to evaluate img/files/window cmds. All best-effort — a detection
 * that fails (e.g. missing Accessibility consent) simply yields nothing.
 */
export async function getTriggerContext(): Promise<TriggerContext> {
  const ctx: TriggerContext = { hasImage: false, files: [] }

  try {
    const formats = clipboard.availableFormats()
    const isMac = process.platform === 'darwin'
    const isWin = process.platform === 'win32'

    if (formats.some((f) => f.startsWith('image/'))) {
      ctx.hasImage = true
      try {
        ctx.image = clipboard.readImage().toDataURL()
      } catch {
        /* skip payload */
      }
    }

    const hasFiles =
      (isMac && formats.includes('public.file-url')) ||
      (isWin && (formats.includes('FileName') || formats.includes('UniformResourceLocator')))
    if (hasFiles) {
      const raw = clipboard.read(isMac ? 'public.file-url' : 'FileName')
      const p = fileUriToPath(raw.trim())
      if (p) ctx.files = [p]
    }
  } catch {
    /* clipboard read failed — leave defaults */
  }

  ctx.window = await getFrontmostWindow()
  return ctx
}
