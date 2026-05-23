import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  startActivityTracking,
  resetBreakCounter,
  type ActivityContext,
  type ActivityState
} from './activity'

// Module-scope references so the tray and window don't get garbage-collected.
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false
let stopActivityTracking: (() => void) | null = null

// Latest activity state. Updated on every poll tick; read when building
// the tray menu and tooltip.
let activity: ActivityState = {
  context: 'other',
  idleSeconds: 0,
  activeAppName: null,
  activeWindowTitle: null,
  minutesSinceLastBreak: 0
}
let isTrackingPaused = false

// Flip the quit flag whenever a real quit is requested, so the window's
// close handler knows to actually close instead of hiding to tray.
app.on('before-quit', () => {
  isQuitting = true
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false, // Bonk is a tray-first app — no window on startup.
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Do NOT auto-show on ready. The window opens only via tray menu.
  mainWindow.on('ready-to-show', () => {
    // intentionally empty
  })

  // Closing the window hides it to tray instead of quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Map an ActivityContext to a short user-facing label with an emoji.
 */
function contextLabel(state: ActivityState): string {
  if (isTrackingPaused) return '⏸  Tracking paused'

  const app = state.activeAppName ? ` (${state.activeAppName})` : ''
  const map: Record<ActivityContext, string> = {
    coding: `💻  Coding${app}`,
    reading: `📖  Reading${app}`,
    meeting: `📞  In a meeting${app}`,
    browsing: `🌐  Browsing${app}`,
    idle: `⏸  Away (${state.idleSeconds}s idle)`,
    other: `⚡  Active${app}`
  }
  return map[state.context]
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Bonk',
      enabled: false
    },
    { type: 'separator' },
    {
      label: `⏱  ${activity.minutesSinceLastBreak} min since last break`,
      enabled: false
    },
    {
      label: contextLabel(activity),
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Take a break now',
      click: () => {
        // Resets the counter for now. Day 11+ this will also open the
        // break-overlay window with the AI coach message + exercise GIF.
        resetBreakCounter()
        activity = { ...activity, minutesSinceLastBreak: 0 }
        refreshTray()
        console.log('[tray] Break counter reset')
      }
    },
    {
      label: isTrackingPaused ? 'Resume tracking' : 'Pause tracking',
      click: () => {
        isTrackingPaused = !isTrackingPaused
        refreshTray()
      }
    },
    { type: 'separator' },
    {
      label: 'Open settings...',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Bonk',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
}

function refreshTray(): void {
  if (!tray) return
  tray.setContextMenu(buildTrayMenu())
  tray.setToolTip(
    isTrackingPaused
      ? 'Bonk — paused'
      : `Bonk — ${activity.minutesSinceLastBreak} min since last break`
  )
}

function createTray(): void {
  // Use the bundled icon. Windows tray icons render best at 16x16.
  const trayImage = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayImage)

  tray.setToolTip('Bonk — starting...')
  tray.setContextMenu(buildTrayMenu())

  // Left-click opens the settings window.
  tray.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.bonk.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()
  createTray()

  // Start the activity polling loop. Every tick refreshes the tray.
  stopActivityTracking = startActivityTracking((state) => {
    if (isTrackingPaused) return
    activity = state
    refreshTray()
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopActivityTracking?.()
})

// Bonk lives in the tray, so don't quit when the (hidden) window is closed.
// The user quits explicitly via the tray menu.
app.on('window-all-closed', () => {
  // intentionally empty — tray keeps the app alive
})
