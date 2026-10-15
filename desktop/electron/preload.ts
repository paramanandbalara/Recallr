import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
  // Global keyboard shortcuts; returns a function that stops listening
  onShortcut(listener: (action: string) => void) {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => listener(action)
    ipcRenderer.on('shortcut', handler)
    return () => { ipcRenderer.off('shortcut', handler) }
  },
  // Download progress of an update installing inside the app
  onUpdateStatus(listener: (status: unknown) => void) {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => listener(status)
    ipcRenderer.on('update-status', handler)
    return () => { ipcRenderer.off('update-status', handler) }
  },
})
