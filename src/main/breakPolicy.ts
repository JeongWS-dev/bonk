import { Notification } from 'electron'
import type { ActivityState } from './activity'

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

// Will be replaced by Claude Haiku-generated messages in Day 8+. For now,
// pick from a small pool to avoid the "same message every time" problem.
const NUDGE_MESSAGES = [
  "You've been at it {min} min straight. Quick 2-min break?",
  '{min} min of focus. Your shoulders are asking for a stretch.',
  'Hey — {min} min in. How about a 30-second walk?',
  "{min} min straight. Eyes deserve a sec on something far away.",
  'You and the keyboard had a {min}-min date. Stretch break?'
]

let lastNudgeAt: number | null = null

function pickMessage(min: number): string {
  const template = NUDGE_MESSAGES[Math.floor(Math.random() * NUDGE_MESSAGES.length)]
  return template.replace('{min}', String(min))
}

export interface BreakPolicyCallbacks {
  /** Fired when the user clicks the notification (interpreted as "Take"). */
  onTakeBreak: () => void
}

/**
 * Inspect the current activity state and fire a nudge if the policy allows.
 * Safe to call on every poll tick — it's idempotent.
 */
export function checkAndMaybeFireNudge(
  state: ActivityState,
  callbacks: BreakPolicyCallbacks
): void {
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

  // Fire.
  lastNudgeAt = Date.now()

  const notification = new Notification({
    title: 'Bonk',
    body: pickMessage(state.minutesSinceLastBreak),
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
}

/**
 * Clear the cooldown timestamp. Call this whenever the user voluntarily
 * starts a fresh break — otherwise the next nudge would be artificially
 * delayed by the cooldown that the user already "satisfied".
 */
export function resetNudgeCooldown(): void {
  lastNudgeAt = null
}
