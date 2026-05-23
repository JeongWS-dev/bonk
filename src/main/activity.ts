import { powerMonitor } from 'electron'
import activeWin from 'active-win'

/**
 * Coarse activity contexts. Used by the break policy to decide whether
 * (and how loudly) to nudge the user.
 */
export type ActivityContext =
  | 'coding'
  | 'reading'
  | 'meeting'
  | 'browsing'
  | 'idle'
  | 'other'

export interface ActivityState {
  context: ActivityContext
  idleSeconds: number
  activeAppName: string | null
  activeWindowTitle: string | null
  minutesSinceLastBreak: number
}

// Poll fast in dev so we can see changes immediately. Move to 60s for production.
const POLL_INTERVAL_MS = 5_000

// More than this many seconds with no input = user is away, pause the timer.
const IDLE_THRESHOLD_SECONDS = 180

/**
 * Accumulated active time (in seconds) since the user last took (or skipped
 * far enough past) a break. Drives the "X min since last break" display and
 * eventually the break-nudge thresholds.
 */
let totalActiveSeconds = 0
let pollHandle: NodeJS.Timeout | null = null

/**
 * Classify the active window into a coarse context. V0 uses simple name +
 * title heuristics. Day 8+ we'll layer an LLM on top for harder cases.
 */
function classifyContext(
  appName: string | undefined,
  title: string | undefined
): ActivityContext {
  if (!appName) return 'other'
  const name = appName.toLowerCase()

  // Coding apps
  if (
    /cursor|code|vscode|webstorm|intellij|pycharm|rider|xcode|sublime|atom|neovim|vim|terminal|iterm|warp|windowsterminal|powershell|cmd/.test(
      name
    )
  ) {
    return 'coding'
  }

  // Meeting apps
  if (/zoom|meet|teams|webex|discord|slack/.test(name)) {
    return 'meeting'
  }

  // Browsers — split into reading vs browsing based on tab title
  if (/chrome|brave|firefox|edge|safari|arc|opera/.test(name)) {
    if (title) {
      const t = title.toLowerCase()
      if (
        /github\.com|stackoverflow|developer\.mozilla|docs\.|documentation|api reference|tutorial/.test(
          t
        )
      ) {
        return 'reading'
      }
      if (
        /twitter\.com|x\.com|youtube\.com|reddit\.com|netflix|tiktok|instagram|facebook/.test(
          t
        )
      ) {
        return 'browsing'
      }
    }
    return 'browsing'
  }

  return 'other'
}

/**
 * Start the polling loop. Returns a stop function.
 *
 * @param onUpdate Called on every tick with the latest activity state.
 */
export function startActivityTracking(
  onUpdate: (state: ActivityState) => void
): () => void {
  if (pollHandle) {
    console.warn('[activity] tracking is already running')
    return () => {}
  }

  const tick = async (): Promise<void> => {
    try {
      const idleSeconds = powerMonitor.getSystemIdleTime()

      // User is away — pause the active-time counter, report idle state.
      if (idleSeconds > IDLE_THRESHOLD_SECONDS) {
        onUpdate({
          context: 'idle',
          idleSeconds,
          activeAppName: null,
          activeWindowTitle: null,
          minutesSinceLastBreak: Math.floor(totalActiveSeconds / 60)
        })
        return
      }

      // User is active — accumulate time and classify the foreground window.
      totalActiveSeconds += POLL_INTERVAL_MS / 1000

      const win = await activeWin()
      const context = classifyContext(win?.owner?.name, win?.title)

      onUpdate({
        context,
        idleSeconds,
        activeAppName: win?.owner?.name ?? null,
        activeWindowTitle: win?.title ?? null,
        minutesSinceLastBreak: Math.floor(totalActiveSeconds / 60)
      })
    } catch (err) {
      console.error('[activity] tick error:', err)
    }
  }

  // Fire once immediately so the tray reflects state on launch instead of
  // sitting at "0 min" for the first poll interval.
  void tick()
  pollHandle = setInterval(tick, POLL_INTERVAL_MS)

  return () => {
    if (pollHandle) {
      clearInterval(pollHandle)
      pollHandle = null
    }
  }
}

/**
 * Reset the active-time counter. Called when the user accepts (or is forced
 * into) a break.
 */
export function resetBreakCounter(): void {
  totalActiveSeconds = 0
}
