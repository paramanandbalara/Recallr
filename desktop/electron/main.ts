import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, shell, desktopCapturer, screen, globalShortcut, dialog, systemPreferences, safeStorage } from 'electron'
import { setupUpdates } from './updater'
import path from 'node:path'
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'

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

// The window's size and place are remembered between runs, as long as they still fit on a screen
const MIN_SIZE = { width: 220, height: 120 }
const windowFile = () => path.join(app.getPath('userData'), 'window.json')
type Bounds = { x: number; y: number; width: number; height: number }

const loadBounds = (): Bounds | null => {
  try {
    const b = JSON.parse(readFileSync(windowFile(), 'utf8')) as Bounds
    if (![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null
    const area = screen.getDisplayMatching(b).workArea
    const visible = b.x < area.x + area.width && b.x + b.width > area.x && b.y < area.y + area.height && b.y + b.height > area.y
    return visible ? b : null
  } catch {
    return null
  }
}

let saveBoundsTimer: ReturnType<typeof setTimeout> | null = null
const saveBounds = () => {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    if (win && !win.isDestroyed()) fs.writeFile(windowFile(), JSON.stringify(win.getBounds())).catch(() => {})
  }, 500)
}

function createWindow() {
  overlayOn = null
  const isMac = process.platform === 'darwin'
  const saved = loadBounds()

  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    width: saved?.width ?? 420,
    height: saved?.height ?? 640,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    resizable: true,
    transparent: true,
    frame: false,
    hasShadow: false,
    skipTaskbar: true,
    x: saved?.x ?? 0,
    y: saved?.y ?? 0,

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

  win.on('resized', saveBounds)
  win.on('moved', saveBounds)

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
  win?.setSize(Math.max(MIN_SIZE.width, Math.round(width)), Math.max(MIN_SIZE.height, Math.round(height)), true)
  saveBounds()
})

// Glass style: the system blurs what's behind the window (macOS vibrancy, Windows 11 acrylic)
ipcMain.on('set-material', (_event, glass: boolean) => {
  if (!win) return
  if (process.platform === 'darwin') win.setVibrancy(glass ? 'hud' : null)
  else if (process.platform === 'win32') win.setBackgroundMaterial(glass ? 'acrylic' : 'none')
})

// The whole app bigger or smaller (Display → App size, or Ctrl/Cmd + and -)
ipcMain.on('set-zoom', (_event, factor: number) => {
  if (win && Number.isFinite(factor)) win.webContents.setZoomFactor(Math.min(2, Math.max(0.5, factor)))
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
  if (action !== 'start' || !win) {
    saveBounds()
    return
  }
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

// Window resizing from the app's own edges and corners: transparent frameless windows can't always be
// resized by the OS (not at all on Windows), so the main process follows the cursor like dragging
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
let resizeTimer: ReturnType<typeof setInterval> | null = null
const stopResize = () => {
  if (resizeTimer) clearInterval(resizeTimer)
  resizeTimer = null
}
ipcMain.on('window-resize', (_event, action: 'start' | 'stop', edge?: Edge) => {
  stopResize()
  if (action !== 'start' || !win || !edge) {
    saveBounds()
    return
  }
  const start = screen.getCursorScreenPoint()
  const from = win.getBounds()
  const startedAt = Date.now()
  resizeTimer = setInterval(() => {
    if (!win || Date.now() - startedAt > 60000) return stopResize()
    const point = screen.getCursorScreenPoint()
    const dx = point.x - start.x
    const dy = point.y - start.y
    let { x, y, width, height } = from
    if (edge.includes('e')) width = Math.max(MIN_SIZE.width, from.width + dx)
    if (edge.includes('s')) height = Math.max(MIN_SIZE.height, from.height + dy)
    if (edge.includes('w')) {
      width = Math.max(MIN_SIZE.width, from.width - dx)
      x = from.x + from.width - width
    }
    if (edge.includes('n')) {
      height = Math.max(MIN_SIZE.height, from.height - dy)
      y = from.y + from.height - height
    }
    win.setBounds({ x, y, width, height })
  }, 8)
})

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

// ---------- This computer ----------
// The server limits how many computers an account uses and gives one free trial per computer, so it needs an id
// that stays the same when the app is reinstalled: the OS's own machine id, hashed before it leaves the computer.

const run = (file: string, args: string[]) => new Promise<string>(resolve => {
  execFile(file, args, { timeout: 5000, windowsHide: true }, (error, stdout) => resolve(error ? '' : String(stdout)))
})

const machineId = async () => {
  if (process.platform === 'darwin') {
    return (await run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])).match(/"IOPlatformUUID" = "([^"]+)"/)?.[1] ?? ''
  }
  if (process.platform === 'win32') {
    return (await run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'])).match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1] ?? ''
  }
  return (await fs.readFile('/etc/machine-id', 'utf8').catch(() => '')).trim()
}

let deviceInfo: Promise<{ fingerprint: string; name: string; platform: string; appVersion: string }> | null = null
ipcMain.handle('device:info', () => {
  deviceInfo ??= (async () => {
    // Without a machine id, the computer's name and hardware (stable enough to count devices)
    const id = (await machineId()) || [os.hostname(), os.arch(), os.cpus()[0]?.model, os.totalmem()].join('|')
    return {
      fingerprint: crypto.createHash('sha256').update(`recallr-device:${id}`).digest('hex'),
      name: os.hostname().replace(/\.local$/, '') || 'Computer',
      platform: process.platform,
      appVersion: app.getVersion(),
    }
  })()
  return deviceInfo
})

// ---------- Sign-in token ----------
// Encrypted by the OS (macOS Keychain, Windows DPAPI, the Linux keyring) and kept in the app's data folder,
// instead of as plain text in the page's localStorage. Without OS encryption the page keeps it itself.

const tokenFile = () => path.join(app.getPath('userData'), 'auth.json')

ipcMain.handle('token:get', async () => {
  if (!safeStorage.isEncryptionAvailable()) return { available: false }
  // Older versions kept the user's own AI keys here; the server holds the keys now
  fs.rm(path.join(app.getPath('userData'), 'keys.json'), { force: true }).catch(() => {})
  try {
    const saved: { token?: string } = JSON.parse(await fs.readFile(tokenFile(), 'utf8'))
    return { available: true, token: saved.token ? safeStorage.decryptString(Buffer.from(saved.token, 'base64')) : '' }
  } catch {
    return { available: true, token: '' } // Not signed in yet
  }
})

ipcMain.handle('token:set', async (_event, token: string) => {
  if (!safeStorage.isEncryptionAvailable()) return false
  const file = tokenFile()
  const temp = `${file}.${Date.now()}.tmp`
  await fs.writeFile(temp, JSON.stringify({ token: token ? safeStorage.encryptString(String(token)).toString('base64') : '' }))
  await fs.rename(temp, file)
  return true
})

// ---------- Session history ----------
interface SavedTurn { question?: string; answer?: string }
interface SavedSession { id: string; title: string; profileName: string; startedAt: number; updatedAt: number; turns: SavedTurn[]; review?: unknown; replay?: unknown }

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
  // The review and the answer replay are written later, on their own: kept when the conversation is saved without them
  const existing = incoming.review && incoming.replay ? null : await readSession(file)
  const session = {
    ...incoming,
    ...(!incoming.review && existing?.review ? { review: existing.review } : {}),
    ...(!incoming.replay && existing?.replay ? { replay: existing.replay } : {}),
  }
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
    .map(({ turns, review, ...summary }) => ({ ...summary, replay: undefined, questionCount: turns.filter(t => t.answer).length, hasReview: !!review }))
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

setupUpdates(() => win)

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

  // macOS: a black "template" image the menu bar colours for light or dark mode (trayTemplate@2x.png is picked up
  // for sharp screens). Windows and Linux: the coloured logo at tray size.
  const trayIcon = process.platform === 'darwin'
    ? nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC, 'trayTemplate.png'))
    : nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC, 'tray.png')).resize({ width: 16, quality: 'best' })
  if (process.platform === 'darwin') trayIcon.setTemplateImage(true)
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