import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, shell, desktopCapturer, screen, globalShortcut, dialog, systemPreferences } from 'electron'
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

// Overlay mode: float above every app, including full-screen ones, on every desktop/Space.
// On macOS the app runs without a Dock icon (see app.whenReady), so Electron doesn't need to switch the
// process type on every change, which is what made macOS log "SetApplicationIsDaemon ... paramErr".
let overlayOn: boolean | null = null
function setOverlay(on: boolean) {
  if (!win || overlayOn === on) return
  overlayOn = on
  win.setAlwaysOnTop(on, on ? 'screen-saver' : 'normal')
  win.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: on, skipTransformProcessType: true })
}

function createWindow() {
  overlayOn = null
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    show: false, // Show only once the page has rendered (avoids a blank window on launch)
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Bypass CORS / avoid OPTIONS preflight requests
    },
    width: 420,
    height: 640,
    minWidth: 360,
    minHeight: 480,
    transparent: true, // Transparent background
    frame: false,      // No window frame/titlebar
    hasShadow: false,
    skipTaskbar: true, // Hide from the taskbar
    x: 0, // Position on screen (we can make this dragable later)
    y: 0,
  })

  win.once('ready-to-show', () => {
    setOverlay(true)
    win?.show()
  })

  // Open target="_blank" links in the system browser instead of a new app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // GHOST MODE: hide the window from screenshots and screen sharing
  win.setContentProtection(true);

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Toggle overlay mode from the pin button
ipcMain.on('set-overlay', (_event, on: boolean) => {
  setOverlay(!!on)
});

// Roomy window for setup, compact one for the live transcript
ipcMain.on('set-window-size', (_event, width: number, height: number) => {
  win?.setSize(Math.round(width), Math.round(height), true)
});

// Window dragging: while the header is held down, move the window with the cursor.
// (CSS drag regions get rewritten by the CSS build and aren't reliable here.)
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
    // Safety net in case the release event never arrives
    if (!win || Date.now() - startedAt > 30000) return stopDrag()
    const point = screen.getCursorScreenPoint()
    win.setPosition(point.x - offset.x, point.y - offset.y)
  }, 8)
});

// Global shortcuts work even while the video call has focus. Actions that need typing
// or a confirmation bring the window to the front first.
// Modifiers other apps rarely use, since a global shortcut takes the keys away from every app:
// Control+Option on macOS; Ctrl+Alt+Shift elsewhere (Ctrl+Alt alone is AltGr, used for typing characters).
// Keep in sync with SHORTCUTS in src/components/DisplayMenu.tsx
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
        win?.show()
        win?.focus()
      }
      win?.webContents.send('shortcut', action)
    })
    if (!ok) console.warn(`Shortcut ${accelerator} is already used by another app`)
  }
}

app.on('will-quit', () => globalShortcut.unregisterAll())

// ---------- Session history ----------
// Each conversation is a JSON file in the app's data folder (no size limit, unlike localStorage)

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
  // The live conversation is saved without its review; keep a review written earlier
  const existing = incoming.review ? null : await readSession(file)
  const session = existing?.review ? { ...incoming, review: existing.review } : incoming
  // Write to a temporary file first so a crash never leaves a half-written session
  const temp = `${file}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  await fs.writeFile(temp, JSON.stringify(session))
  await fs.rename(temp, file)
})

// Newest first; `query` matches the title or anything asked or answered
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

// Permission state for the pre-interview check ('granted' on systems that don't ask)
ipcMain.handle('media-access', () => process.platform === 'darwin'
  ? { microphone: systemPreferences.getMediaAccessStatus('microphone'), screen: systemPreferences.getMediaAccessStatus('screen') }
  : { microphone: 'granted', screen: 'granted' })

// ---------- Read a question from the screen ----------
// Screenshots of every screen (at most 3), sized so text stays readable without huge uploads.
// Recallr's own window is left out of captures by setContentProtection.
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

// ---------- Export ----------

const safeFileName = (name: string) => String(name).replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 100) || 'Interview'

// Markdown is written as is; for PDF, `content` is a printable HTML page
ipcMain.handle('export:file', async (_event, { name, kind, content }: { name: string; kind: 'md' | 'pdf'; content: string }) => {
  const extension = kind === 'pdf' ? 'pdf' : 'md'
  const options = {
    defaultPath: path.join(app.getPath('documents'), `${safeFileName(name)}.${extension}`),
    filters: [kind === 'pdf' ? { name: 'PDF', extensions: ['pdf'] } : { name: 'Markdown', extensions: ['md'] }],
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

// Allow React to quit the app
ipcMain.on('quit-app', () => {
  app.quit();
});

// Allow React to minimize/hide the window
ipcMain.on('hide-app', () => {
  win?.hide();
});

// Open links in the system's default browser
ipcMain.on('open-external', (_event, url) => {
  shell.openExternal(url);
});

app.whenReady().then(() => {
  // No Dock icon: Recallr lives in the menu bar (tray), like it stays off the taskbar on Windows
  app.dock?.hide()

  // Automatically grant microphone and system-audio capture permission
  const allowed = new Set(['media', 'display-capture'])
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowed.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => allowed.has(permission))

  // System audio: getDisplayMedia() in the renderer gets the computer's audio output (loopback),
  // i.e. what the other people in the call say, without the user's microphone.
  // Chromium requires a video source too; the renderer keeps it tiny and ignores it.
  // macOS 14.2+ uses the CoreAudio Tap API and asks for "System Audio Recording" permission once.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(
      sources => callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {}),
      () => callback({}),
    )
  })

  createWindow()
  registerShortcuts()

  // Create tray icon
  const iconPath = path.join(process.env.VITE_PUBLIC, 'icon.png')
  // Using nativeImage helps on some platforms
  const trayIcon = nativeImage.createFromPath(iconPath)
  tray = new Tray(trayIcon)
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Recallr', click: () => win?.show() },
    { label: 'Hide', click: () => win?.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  
  tray.setToolTip('Recallr')
  tray.setContextMenu(contextMenu)
  
  // Clicking the tray icon toggles show/hide
  tray.on('click', () => {
    if (win?.isVisible()) {
      win.hide()
    } else {
      win?.show()
    }
  })
})
