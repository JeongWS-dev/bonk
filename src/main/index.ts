import 'dotenv/config'

import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  NativeImage
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import iconCalm from '../../resources/icon-calm.png?asset'
import iconNotice from '../../resources/icon-notice.png?asset'
import iconAlert from '../../resources/icon-alert.png?asset'
import iconUrgent from '../../resources/icon-urgent.png?asset'
import {
  startActivityTracking,
  resetBreakCounter,
  type ActivityContext,
  type ActivityState
} from './activity'
import { checkAndMaybeFireNudge, resetNudgeCooldown } from './breakPolicy'

/**
 * Thresholds for the L1 "whisper" color escalation. The tray icon shifts
 * color as time-since-break grows, giving the user an ambient cue *before*
 * any actual notification fires. Keep these in lockstep with the nudge
 * threshold in breakPolicy.ts — color should escalate visibly BEFORE the
 * audible nudge so people can break voluntarily.
 *
 * ⚠️ TEST VALUES — 1/2/3 min so all states are visible within ~3 minutes.
 * Before launch, restore to 5/10/15 (and bump breakPolicy's NUDGE_THRESHOLD
 * back to 10).
 */
type TrayLevel = 'calm' | 'notice' | 'alert' | 'urgent'

function pickTrayLevel(min: number): TrayLevel {
  if (min < 1) return 'calm'
  if (min < 2) return 'notice'
  if (min < 3) return 'alert'
  return 'urgent'
}

// Module-scope references so the tray and window don't get garbage-collected.
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false
let stopActivityTracking: (() => void) | null = null

// Pre-resized 16x16 tray icons, indexed by level. Built once at startup so
// every poll-tick refresh is just a pointer swap.
let trayImages: Record<TrayLevel, NativeImage> | null = null

// Remember the last level we painted so we only call setImage on actual
// transitions — avoids needless Win32 syscalls every 5 seconds.
let lastTrayLevel: TrayLevel | null = null

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
    width: 720,
    height: 720,
    title: 'Bonk',
    show: false, // Bonk is a tray-first app — no window on startup.
    autoHideMenuBar: true,
    icon, // explicit icon for all platforms (in dev Windows still uses electron.exe's icon, but at least Mac/Linux are right)
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
        resetNudgeCooldown()
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

  // L1 whisper: tint the tray icon based on time-since-break. While paused
  // or away, force the calm color so the user doesn't see a stale "urgent"
  // icon when the timer isn't actually running.
  if (trayImages) {
    const level: TrayLevel =
      isTrackingPaused || activity.context === 'idle'
        ? 'calm'
        : pickTrayLevel(activity.minutesSinceLastBreak)

    if (level !== lastTrayLevel) {
      console.log(
        `[tray] color change: ${lastTrayLevel ?? 'init'} → ${level} ` +
          `(${activity.minutesSinceLastBreak} min)`
      )
      tray.setImage(trayImages[level])
      lastTrayLevel = level
    }
  }
}

function createTray(): void {
  // Build all four tinted variants up front. 16x16 is what Windows tray
  // actually renders at; rescaling on every tick would burn CPU for no gain.
  trayImages = {
    calm: nativeImage.createFromPath(iconCalm).resize({ width: 16, height: 16 }),
    notice: nativeImage.createFromPath(iconNotice).resize({ width: 16, height: 16 }),
    alert: nativeImage.createFromPath(iconAlert).resize({ width: 16, height: 16 }),
    urgent: nativeImage.createFromPath(iconUrgent).resize({ width: 16, height: 16 })
  }

  tray = new Tray(trayImages.calm)
  lastTrayLevel = 'calm'

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

  // Start the activity polling loop. Every tick refreshes the tray and
  // gives the break policy a chance to fire a nudge (async — the AI call
  // happens in the background, never blocking the next poll).
  stopActivityTracking = startActivityTracking((state) => {
    if (isTrackingPaused) return
    activity = state
    refreshTray()

    void checkAndMaybeFireNudge(state, {
      onTakeBreak: () => {
        resetBreakCounter()
        resetNudgeCooldown()
        activity = { ...activity, minutesSinceLastBreak: 0 }
        refreshTray()
      }
    })
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
