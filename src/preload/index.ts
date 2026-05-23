import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for the main settings window. Reserved for future use
// (today's stats, settings updates, etc.).
const api = {}

/**
 * IPC surface for the break overlay window. Kept small and explicit so the
 * renderer can't reach into arbitrary main-process channels.
 */
const bonkOverlay = {
  onShow: (handler: (payload: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      handler(payload)
    }
    ipcRenderer.on('bonk:overlay:show', listener)
    return () => {
      ipcRenderer.removeListener('bonk:overlay:show', listener)
    }
  },
  take: (): void => {
    ipcRenderer.send('bonk:overlay:action', { type: 'take' })
  },
  snooze: (): void => {
    ipcRenderer.send('bonk:overlay:action', { type: 'snooze' })
  },
  skip: (reason: string): void => {
    ipcRenderer.send('bonk:overlay:action', { type: 'skip', reason })
  },
  dismiss: (): void => {
    ipcRenderer.send('bonk:overlay:action', { type: 'dismiss' })
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('bonkOverlay', bonkOverlay)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.bonkOverlay = bonkOverlay
}
