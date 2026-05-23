import { Notification } from 'electron'
import type { ActivityState } from './activity'
import { generateBreakMessage } from './aiCoach'

/**
 * V0 break policy: a single "nudge" threshold + cooldown. Eventually this
 * grows into a 3-level pressure system (whisper -> nudge -> block) and
 * learns from skip reasons. Keep it dumb-and-clear for now.
 */

// Lowered for development so we don't have to sit and wait 30 minutes to
// see a notification. Bump to 30 before the public launch.
const NUDGE_THRESHOLD_MIN = 1

// After a nudge fires, don't fire again for this long even if the user
// ignores it. Prevents the app from becoming the very thing we hate.
const COOLDOWN_AFTER_NUDGE_MIN = 1

let lastNudgeAt: number | null = null

// Re-entrancy guard: never start a second AI generation while one is still
// in flight. The polling loop runs every 5s and the API call may take longer.
let nudgeInFlight = false

export interface BreakPolicyCallbacks {
  /** Fired when the user clicks the notification (interpreted as "Take"). */
  onTakeBreak: () => void
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

    const notification = new Notification({
      title: 'Bonk',
      body: message,
      silent: true // UX rule: never make a sound by default
    })

    notification.on('click', () => {
      console.log('[break] User clicked notification — counting as Take')
      callbacks.onTakeBreak()
    })

    notification.show()
    console.log(
      `[break] Nudge fired at ${state.minutesSinceLastBreak} min (${state.context})`
    )
  } finally {
    nudgeInFlight = false
  }
}

/**
 * Clear the cooldown timestamp. Call this whenever the user voluntarily
 * starts a fresh break — otherwise the next nudge would be artificially
 * delayed by the cooldown that the user already "satisfied".
 */
export function resetNudgeCooldown(): void {
  lastNudgeAt = null
}
