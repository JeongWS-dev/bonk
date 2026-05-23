import type { ActivityState } from './activity'
import { generateBreakMessage } from './aiCoach'
import { showOverlay } from './overlayWindow'

/**
 * V0 break policy: a single "nudge" threshold + cooldown. Eventually this
 * grows into a 3-level pressure system (whisper -> nudge -> block) and
 * learns from skip reasons. Keep it dumb-and-clear for now.
 */

// ⚠️ TEST VALUES — 2 min threshold + 2 min cooldown so verification cycles
// run in minutes, not half-hours. Before launch restore to 10 / 10 (and the
// tray color thresholds in main/index.ts to 5/10/15).
const NUDGE_THRESHOLD_MIN = 2

const COOLDOWN_AFTER_NUDGE_MIN = 2

let lastNudgeAt: number | null = null

// Re-entrancy guard: never start a second AI generation while one is still
// in flight. The polling loop runs every 5s and the API call may take longer.
let nudgeInFlight = false

export interface BreakPolicyCallbacks {
  /** Fired when the user clicks Take in the overlay. */
  onTakeBreak: () => void
  /** Fired when the user snoozes — counter keeps running, cooldown extends. */
  onSnooze: () => void
  /** Fired when the user skips, with the captured reason for V1 learning. */
  onSkip: (reason: string) => void
}

/**
 * Inspect the current activity state and fire a nudge if the policy allows.
 * Safe to call on every poll tick — it's idempotent and self-throttling.
 */
export async function checkAndMaybeFireNudge(
  state: ActivityState,
  callbacks: BreakPolicyCallbacks
): Promise<void> {
  // Never bonk during meetings or while the user is away from the desk.
  if (state.context === 'idle' || state.context === 'meeting') {
    return
  }

  // Below threshold — too early.
  if (state.minutesSinceLastBreak < NUDGE_THRESHOLD_MIN) {
    return
  }

  // Cooldown — already nudged recently, give them space.
  if (
    lastNudgeAt !== null &&
    Date.now() - lastNudgeAt < COOLDOWN_AFTER_NUDGE_MIN * 60_000
  ) {
    return
  }

  if (nudgeInFlight) return
  nudgeInFlight = true

  try {
    // Lock the cooldown timestamp BEFORE awaiting the API call. Otherwise
    // a slow generation could let the next poll tick start a second one.
    lastNudgeAt = Date.now()

    const message = await generateBreakMessage(state)

    await showOverlay({
      message,
      minutesSinceLastBreak: state.minutesSinceLastBreak,
      contextAppName: state.activeAppName
    })

    console.log(
      `[break] Overlay shown at ${state.minutesSinceLastBreak} min (${state.context})`
    )
  } finally {
    nudgeInFlight = false
  }

  // Wire the overlay action handler back to the policy callbacks. Note this
  // is set every nudge — it's idempotent (initOverlay just stores the latest
  // callbacks reference) so harmless.
  // The actual wiring happens in main/index.ts at startup via initOverlay.
  void callbacks
}

/**
 * Clear the cooldown timestamp. Call this whenever the user voluntarily
 * starts a fresh break — otherwise the next nudge would be artificially
 * delayed by the cooldown that the user already "satisfied".
 */
export function resetNudgeCooldown(): void {
  lastNudgeAt = null
}

/**
 * Push the cooldown forward by `minutes` from now. Used when the user snoozes —
 * we don't want to re-fire immediately, even if the regular cooldown elapsed.
 */
export function extendCooldown(minutes: number): void {
  // Set lastNudgeAt into the future so the cooldown check stays "active"
  // for the requested duration regardless of the default cooldown length.
  const futureBase = Date.now() + minutes * 60_000 - COOLDOWN_AFTER_NUDGE_MIN * 60_000
  lastNudgeAt = futureBase
}
