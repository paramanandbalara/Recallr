import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, shell, desktopCapturer, screen, globalShortcut, dialog, systemPreferences, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
let tray: Tray | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let overlayOn: boolean | null = null
function setOverlay(on: boolean) {
  if (!win || overlayOn === on) return
  overlayOn = on
  win.setAlwaysOnTop(on, on ? 'screen-saver' : 'normal')
  win.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: on, skipTransformProcessType: true })
}

function createWindow() {
  overlayOn = null
  const isMac = process.platform === 'darwin'

  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 480,
    transparent: true,
    frame: false,
    hasShadow: false,
    skipTaskbar: true,
    x: 0,
    y: 0,

    // macOS: panel = non-activating NSPanel.
    ...(isMac ? { type: 'panel' as const } : {}),

    // ✅ acceptFirstMouse is a CONSTRUCTOR option, not a method.
    // macOS only; harmless elsewhere. Lets clicks land on the window even
    // when it isn't the active app — without activating the app.
    acceptFirstMouse: true,

    // Non-mac: prevent focus stealing by default.
    ...(!isMac ? { focusable: false } : {}),
  })

  win.once('ready-to-show', () => {
    setOverlay(true)
    win?.showInactive() // show WITHOUT activating the app
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.setContentProtection(true)

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

ipcMain.on('set-overlay', (_event, on: boolean) => {
  setOverlay(!!on)
})

ipcMain.on('set-window-size', (_event, width: number, height: number) => {
  win?.setSize(Math.round(width), Math.round(height), true)
})

// Flip focusable on while a text input has keyboard focus, off when it blurs.
ipcMain.on('set-focusable', (_event, on: boolean) => {
  if (!win) return
  win.setFocusable(!!on)
  if (on) {
    win.focus()
    win.webContents.focus()
  }
})

ipcMain.on('set-ignore-mouse', (_event, on: boolean) => {
  if (!win) return
  if (on) win.setIgnoreMouseEvents(true, { forward: true })
  else win.setIgnoreMouseEvents(false)
})

// Window dragging
let dragTimer: ReturnType<typeof setInterval> | null = null
const stopDrag = () => {
  if (dragTimer) clearInterval(dragTimer)
  dragTimer = null
}
ipcMain.on('window-drag', (_event, action: 'start' | 'stop') => {
  stopDrag()
  if (action !== 'start' || !win) return
  const cursor = screen.getCursorScreenPoint()
  const [winX, winY] = win.getPosition()
  const offset = { x: cursor.x - winX, y: cursor.y - winY }
  const startedAt = Date.now()
  dragTimer = setInterval(() => {
    if (!win || Date.now() - startedAt > 30000) return stopDrag()
    const point = screen.getCursorScreenPoint()
    win.setPosition(point.x - offset.x, point.y - offset.y)
  }, 8)
});

const SHORTCUT_MODIFIERS = process.platform === 'darwin' ? 'Control+Alt' : 'Control+Alt+Shift'
const SHORTCUTS: { key: string; action: string; focus?: boolean }[] = [
  { key: 'L', action: 'toggle-listening' },
  { key: 'A', action: 'focus-ask', focus: true },
  { key: 'R', action: 'regenerate' },
  { key: 'N', action: 'new-conversation', focus: true },
  { key: 'S', action: 'read-screen' },
]

function registerShortcuts() {
  for (const { key, action, focus } of SHORTCUTS) {
    const accelerator = `${SHORTCUT_MODIFIERS}+${key}`
    const ok = globalShortcut.register(accelerator, () => {
      if (focus) {
        win?.setFocusable(true)
        win?.show()
        win?.focus()
        win?.webContents.focus()
      }
      win?.webContents.send('shortcut', action)
    })
    if (!ok) console.warn(`Shortcut ${accelerator} is already used by another app`)
  }
}

app.on('will-quit', () => globalShortcut.unregisterAll())

// ---------- API keys ----------
// Encrypted by the OS (macOS Keychain, Windows DPAPI, the Linux keyring) and kept in the app's data folder,
// instead of as plain text in the page's localStorage. Without OS encryption the page keeps them itself.

type ApiKeys = { groqKey: string; openaiKey: string }
const keysFile = () => path.join(app.getPath('userData'), 'keys.json')

ipcMain.handle('keys:get', async () => {
  if (!safeStorage.isEncryptionAvailable()) return { available: false }
  try {
    const saved: Partial<Record<keyof ApiKeys, string>> = JSON.parse(await fs.readFile(keysFile(), 'utf8'))
    const decrypt = (value?: string) => (value ? safeStorage.decryptString(Buffer.from(value, 'base64')) : '')
    return { available: true, groqKey: decrypt(saved.groqKey), openaiKey: decrypt(saved.openaiKey) }
  } catch {
    return { available: true, groqKey: '', openaiKey: '' } // Nothing saved yet
  }
})

ipcMain.handle('keys:set', async (_event, keys: ApiKeys) => {
  if (!safeStorage.isEncryptionAvailable()) return false
  const encrypt = (value: string) => (value ? safeStorage.encryptString(value).toString('base64') : '')
  const file = keysFile()
  const temp = `${file}.${Date.now()}.tmp`
  await fs.writeFile(temp, JSON.stringify({ groqKey: encrypt(String(keys.groqKey || '')), openaiKey: encrypt(String(keys.openaiKey || '')) }))
  await fs.rename(temp, file)
  return true
})

// ---------- Session history ----------
interface SavedTurn { question?: string; answer?: string }
interface SavedSession { id: string; title: string; profileName: string; startedAt: number; updatedAt: number; turns: SavedTurn[]; review?: unknown }

const sessionsDir = () => path.join(app.getPath('userData'), 'sessions')
const sessionFile = (id: string) => {
  if (!/^[a-z0-9]{1,32}$/i.test(id)) throw new Error('Invalid session id')
  return path.join(sessionsDir(), `${id}.json`)
}

const readSession = async (file: string): Promise<SavedSession | null> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

ipcMain.handle('sessions:save', async (_event, incoming: SavedSession) => {
  const file = sessionFile(incoming.id)
  await fs.mkdir(sessionsDir(), { recursive: true })
  const existing = incoming.review ? null : await readSession(file)
  const session = existing?.review ? { ...incoming, review: existing.review } : incoming
  const temp = `${file}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  await fs.writeFile(temp, JSON.stringify(session))
  await fs.rename(temp, file)
})

ipcMain.handle('sessions:list', async (_event, query: string) => {
  const names = await fs.readdir(sessionsDir()).catch(() => [] as string[])
  const needle = String(query || '').trim().toLowerCase()
  const sessions = await Promise.all(names.filter(n => n.endsWith('.json')).map(n => readSession(path.join(sessionsDir(), n))))
  return sessions
    .filter((s): s is SavedSession => !!s && typeof s.id === 'string' && Array.isArray(s.turns))
    .filter(s => !needle || [s.title, s.profileName, ...s.turns.flatMap(t => [t.question, t.answer])]
      .some(text => typeof text === 'string' && text.toLowerCase().includes(needle)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ turns, review, ...summary }) => ({ ...summary, questionCount: turns.filter(t => t.answer).length, hasReview: !!review }))
})

ipcMain.handle('sessions:get', (_event, id: string) => readSession(sessionFile(id)))
ipcMain.handle('sessions:delete', (_event, id: string) => fs.rm(sessionFile(id), { force: true }))

ipcMain.handle('media-access', () => process.platform === 'darwin'
  ? { microphone: systemPreferences.getMediaAccessStatus('microphone'), screen: systemPreferences.getMediaAccessStatus('screen') }
  : { microphone: 'granted', screen: 'granted' })

const SCREENSHOT_MAX_PX = 1920

ipcMain.handle('capture-screens', async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen')
    if (status === 'denied' || status === 'restricted') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      return { error: 'permission' }
    }
  }
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: SCREENSHOT_MAX_PX, height: SCREENSHOT_MAX_PX },
  })
  const images = sources
    .filter(source => !source.thumbnail.isEmpty())
    .slice(0, 3)
    .map(source => `data:image/jpeg;base64,${source.thumbnail.toJPEG(85).toString('base64')}`)
  return images.length ? { images } : { error: 'empty' }
})

// ---------- Restore a backup ----------
// Returns the chosen file's text, or null if the user cancelled
const MAX_BACKUP_BYTES = 200 * 1024 * 1024

ipcMain.handle('backup:open', async () => {
  const options = { filters: [EXPORT_FILTERS.json], properties: ['openFile' as const] }
  const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (canceled || !filePaths[0]) return null
  if ((await fs.stat(filePaths[0])).size > MAX_BACKUP_BYTES) throw new Error('This file is too big to be a Recallr backup.')
  return fs.readFile(filePaths[0], 'utf8')
})

// ---------- Export ----------
const safeFileName = (name: string) => String(name).replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 100) || 'Interview'

const EXPORT_FILTERS = {
  md: { name: 'Markdown', extensions: ['md'] },
  pdf: { name: 'PDF', extensions: ['pdf'] },
  json: { name: 'Recallr backup', extensions: ['json'] },
}

ipcMain.handle('export:file', async (_event, { name, kind, content }: { name: string; kind: keyof typeof EXPORT_FILTERS; content: string }) => {
  const filter = EXPORT_FILTERS[kind] ?? EXPORT_FILTERS.md
  const options = {
    defaultPath: path.join(app.getPath('documents'), `${safeFileName(name)}.${filter.extensions[0]}`),
    filters: [filter],
  }
  const { canceled, filePath } = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return false

  if (kind !== 'pdf') {
    await fs.writeFile(filePath, String(content), 'utf8')
    return true
  }
  const page = path.join(os.tmpdir(), `recallr-export-${Date.now()}.html`)
  const printer = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
  try {
    await fs.writeFile(page, String(content), 'utf8')
    await printer.loadFile(page)
    const pdf = await printer.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.7, bottom: 0.7, left: 0.75, right: 0.75 },
    })
    await fs.writeFile(filePath, pdf)
  } finally {
    printer.destroy()
    fs.rm(page, { force: true }).catch(() => {})
  }
  return true
})

ipcMain.on('quit-app', () => { app.quit() })
ipcMain.on('hide-app', () => { win?.hide() })
ipcMain.on('open-external', (_event, url) => { shell.openExternal(url) })

app.whenReady().then(() => {
  app.dock?.hide()

  const allowed = new Set(['media', 'display-capture'])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowed.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => allowed.has(permission))

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(
      sources => callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {}),
      () => callback({}),
    )
  })

  createWindow()
  registerShortcuts()

  const iconPath = path.join(process.env.VITE_PUBLIC, 'icon.png')
  // Shown at its pixel size, so shrink the 256px app icon to menu bar / system tray size
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: process.platform === 'darwin' ? 18 : 16, quality: 'best' })
  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Recallr', click: () => win?.showInactive() },
    { label: 'Hide', click: () => win?.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.setToolTip('Recallr')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (win?.isVisible()) win.hide()
    else win?.showInactive()
  })
})