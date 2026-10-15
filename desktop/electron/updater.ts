import { app, ipcMain, type BrowserWindow } from 'electron'
import updaterPackage from 'electron-updater'

const { autoUpdater } = updaterPackage

// Updates download and install inside the app. The server says where they are (Admin → Settings → Update files
// address): a folder with the installers and the latest.yml / latest-mac.yml files electron-builder makes.
// electron-updater checks each download's checksum before installing it.

export type UpdateStatus =
  | { state: 'downloading'; percent: number; version?: string }
  | { state: 'ready'; version: string }
  | { state: 'none' }
  | { state: 'error'; message: string }

const feedFrom = (input: string) => {
  try {
    const url = new URL(input)
    // HTTPS only (plain http just for a local test server)
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.toString()
  } catch {
    // Not an address
  }
  return null
}

export const setupUpdates = (getWindow: () => BrowserWindow | null) => {
  let downloading: Promise<UpdateStatus> | null = null
  let ready: string | null = null
  let progress: { percent: number; version?: string } = { percent: 0 }
  const send = (status: UpdateStatus) => getWindow()?.webContents.send('update-status', status)

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true // A downloaded update installs on the next quit even without "Restart"
  autoUpdater.on('download-progress', p => {
    progress = { ...progress, percent: Math.floor(p.percent) }
    send({ state: 'downloading', ...progress })
  })
  autoUpdater.on('error', () => {}) // Reported by the call below

  const download = async (feedUrl: string): Promise<UpdateStatus> => {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
    const result = await autoUpdater.checkForUpdates()
    if (!result?.isUpdateAvailable) return { state: 'none' }
    progress = { percent: 0, version: result.updateInfo.version }
    send({ state: 'downloading', ...progress })
    await autoUpdater.downloadUpdate()
    ready = result.updateInfo.version
    return { state: 'ready', version: ready }
  }

  // Starts the download (or reports the one already going); resolves when it's finished
  ipcMain.handle('update:start', async (_event, feedInput: string): Promise<UpdateStatus> => {
    if (ready) return { state: 'ready', version: ready }
    if (!app.isPackaged) return { state: 'error', message: 'Updates install only in the installed app.' }
    const feedUrl = feedFrom(String(feedInput ?? ''))
    if (!feedUrl) return { state: 'error', message: 'The update address isn’t set up.' }
    downloading ??= download(feedUrl)
      .catch((error: Error): UpdateStatus => ({ state: 'error', message: error.message || 'The download stopped.' }))
      .finally(() => { downloading = null })
    const status = await downloading
    send(status)
    return status
  })

  ipcMain.handle('update:install', () => {
    if (!ready) return false
    // Closes the app, installs, and opens the new version
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return true
  })
}
