import { Menu, Tray, app, nativeImage, type BrowserWindow } from 'electron'

let tray: Tray | null = null

/** Build a simple template tray icon at runtime — no binary asset shipped yet. */
function buildIcon(): Electron.NativeImage {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  const r = 6.5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const dx = x - c
      const dy = y - c
      const inside = dx * dx + dy * dy <= r * r
      buf[i] = 0
      buf[i + 1] = 0
      buf[i + 2] = 0
      buf[i + 3] = inside ? 255 : 0
    }
  }
  const img = nativeImage.createFromBuffer(buf, { width: size, height: size })
  img.setTemplateImage(true)
  return img
}

export function createTray(parent: BrowserWindow): Tray {
  tray = new Tray(buildIcon())
  tray.setToolTip('Work-OS')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Work-OS',
      click: () => {
        parent.show()
        parent.focus()
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.setContextMenu(menu)
  tray.on('click', () => {
    if (parent.isVisible()) parent.hide()
    else {
      parent.show()
      parent.focus()
    }
  })

  return tray
}
