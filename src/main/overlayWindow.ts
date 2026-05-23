import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

/**
 * Manages the small frameless overlay that slides in from the bottom-right
 * when a nudge fires. Behaves like a richer, branded replacement for the
 * OS toast notification.
 *
 * Key UX rules baked in:
 * - Never steals focus (focusable: false)
 * - Always on top, including over fullscreen apps where possible
 * - Skips the taskbar — should feel ambient, not like another window
 * - Sized for "small enough to ignore, big enough to act on"
 */

const OVERLAY_WIDTH = 400
const OVERLAY_HEIGHT = 280
const SCREEN_MARGIN = 16

export type OverlayActionType = 'take' | 'snooze' | 'skip' | 'dismiss'

export interface OverlayAction {
  type: OverlayActionType
  reason?: string
}

export interface OverlayPayload {
  message: string
  minutesSinceLastBreak: number
  contextAppName: string | null
}

export interface OverlayCallbacks {
  onAction: (action: OverlayAction) => void
}

let overlayWindow: BrowserWindow | null = null
let callbacks: OverlayCallbacks | null = null
let actionListenerRegistered = false

function ensureActionListener(): void {
  if (actionListenerRegistered) return
  actionListenerRegistered = true

  ipcMain.on('bonk:overlay:action', (_event, action: OverlayAction) => {
    callbacks?.onAction(action)
    // Hide on every action — the renderer plays its slide-out animation
    // first, so by the time we get here the user has already seen the exit.
    overlayWindow?.hide()
  })
}

function computePosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { width, height, x: dx, y: dy } = display.workArea
  return {
    x: dx + width - OVERLAY_WIDTH - SCREEN_MARGIN,
    y: dy + height - OVERLAY_HEIGHT - SCREEN_MARGIN
  }
}

function createOverlayWindow(): BrowserWindow {
  const { x, y } = computePosition()

  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false, // never steal focus from the user's flow
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // alwaysOnTop above fullscreen apps too (best effort across platforms).
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Load the overlay HTML — different entry point than the settings window.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  return win
}

export function initOverlay(cb: OverlayCallbacks): void {
  callbacks = cb
  ensureActionListener()
}

export async function showOverlay(payload: OverlayPayload): Promise<void> {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    overlayWindow = createOverlayWindow()
    // Wait for the renderer to be ready before pushing the payload —
    // otherwise the message fires into the void on first show.
    await new Promise<void>((resolve) => {
      overlayWindow!.webContents.once('did-finish-load', () => resolve())
    })
  }

  // Reposition in case the user moved between displays since last show.
  const { x, y } = computePosition()
  overlayWindow.setPosition(x, y)

  overlayWindow.showInactive() // show without stealing focus
  overlayWindow.webContents.send('bonk:overlay:show', payload)
}

export function hideOverlay(): void {
  overlayWindow?.hide()
}

export function destroyOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}
