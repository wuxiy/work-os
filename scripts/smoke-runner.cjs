// Smoke test: exercises the plugin activation path (WebContentsView + addChildView
// + loadFile + plugin preload injection) against the real Electron binary, plus
// the sub-input callback wiring and the detach (separate-window) load pattern.
// No GUI interaction. Run: pnpm exec electron scripts/smoke-runner.cjs
const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron')
const path = require('node:path')

let setFeaturesPayload = null
ipcMain.on('wb:set-features', (_e, features) => {
  setFeaturesPayload = features
})

const results = []
const check = (name, cond) => {
  results.push({ name, ok: !!cond })
  console.log(`SMOKE ${cond ? 'ok' : 'FAIL'} — ${name}`)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 760, height: 520 })
  const pluginHtml = path.join(__dirname, '..', 'out', 'plugins', 'json-formatter', 'index.html')
  const preload = path.join(__dirname, '..', 'out', 'preload', 'plugin.cjs')

  const view = new WebContentsView({
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 56, width: 760, height: 460 })

  const failLoad = (code, desc) => {
    check('plugin view loads', false)
    console.log('SMOKE did-fail-load', code, desc)
    finish()
  }
  view.webContents.on('did-fail-load', (_e, code, desc) => failLoad(code, desc))

  view.webContents.once('did-finish-load', async () => {
    try {
      const exec = (js) => view.webContents.executeJavaScript(js)

      // 1. core surface
      const type = await exec('typeof window.workbench')
      check('window.workbench injected', type === 'object')
      check('workbench.db present', (await exec('typeof window.workbench.db')) === 'object')
      check('workbench.onPluginEnter present', (await exec('typeof window.workbench.onPluginEnter')) === 'function')

      // 2. new SDK surface (sub-input + detach)
      check('workbench.setSubInput is fn', (await exec('typeof window.workbench.setSubInput')) === 'function')
      check('workbench.removeSubInput is fn', (await exec('typeof window.workbench.removeSubInput')) === 'function')
      check('workbench.setSubInputValue is fn', (await exec('typeof window.workbench.setSubInputValue')) === 'function')
      check('workbench.detachPlugin is fn', (await exec('typeof window.workbench.detachPlugin')) === 'function')

      // 3. sub-input callback delivery (preload forwards wb:sub-input → plugin cb)
      await exec('window.__si = null; window.workbench.setSubInput((v) => { window.__si = v })')
      view.webContents.send('wb:sub-input', 'typed-text')
      await new Promise((r) => setTimeout(r, 100))
      check('sub-input callback receives forwarded value', (await exec('window.__si')) === 'typed-text')

      // 3b. dynamic features (wb.setFeatures → wb:set-features reaches main)
      await exec(
        'window.workbench.setFeatures([{ code: "dyn", explain: "Dynamic", cmds: ["dyn-key"] }])'
      )
      await new Promise((r) => setTimeout(r, 100))
      check(
        'setFeatures delivers feature to main',
        Array.isArray(setFeaturesPayload) &&
          setFeaturesPayload[0] &&
          setFeaturesPayload[0].code === 'dyn' &&
          setFeaturesPayload[0].cmds[0] === 'dyn-key'
      )

      // 4. detach pattern: a separate BrowserWindow loading the plugin (with the
      //    plugin preload) gets a working window.workbench, exactly as runner.detach produces.
      const detWin = new BrowserWindow({
        show: false,
        width: 760,
        height: 460,
        webPreferences: { preload, sandbox: true, contextIsolation: true }
      })
      await new Promise((resolve) => {
        detWin.webContents.once('did-finish-load', resolve)
        detWin.webContents.once('did-fail-load', () => resolve())
        detWin.loadFile(pluginHtml)
      })
      const detType = await detWin.webContents.executeJavaScript('typeof window.workbench')
      check('detached window injects window.workbench', detType === 'object')
      detWin.destroy()
    } catch (err) {
      check('no exception during checks', false)
      console.log('SMOKE exception:', err && err.message)
    }
    finish()
  })

  view.webContents.loadFile(pluginHtml)
  setTimeout(() => {
    console.log('SMOKE timeout')
    finish()
  }, 10000)

  function finish() {
    const ok = results.length > 0 && results.every((r) => r.ok)
    console.log('SMOKE RESULT:', ok ? 'PASS' : 'FAIL')
    if (!ok) process.exitCode = 1
    app.quit()
  }
})
