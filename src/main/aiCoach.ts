import type { ActivityState } from './activity'

/**
 * AI break coach — generates a fresh, context-aware nudge message every
 * time, instead of cycling through a hardcoded pool.
 *
 * V0 uses Google Gemini 1.5 Flash because the free tier covers far more
 * traffic than a Day-1 indie app will ever produce. Swap to Claude Haiku
 * (or whatever) once revenue justifies it — the prompt and fallback logic
 * stay identical.
 *
 * If the API call fails for any reason (no key, network down, rate limit,
 * empty response) we fall back to a small hand-written pool. The user
 * should never see a missing notification.
 */

const FALLBACK_MESSAGES = [
  "You've been at it {min} min straight. Quick 2-min break?",
  '{min} min of focus. Your shoulders are asking for a stretch.',
  'Hey — {min} min in. How about a 30-second walk?',
  '{min} min straight. Eyes deserve a sec on something far away.',
  'You and the keyboard had a {min}-min date. Stretch break?'
]

function pickFallback(min: number): string {
  const template = FALLBACK_MESSAGES[Math.floor(Math.random() * FALLBACK_MESSAGES.length)]
  return template.replace('{min}', String(min))
}

// Remember the last few generated messages so we can ask the model not to
// repeat itself. Keeps notifications from feeling robotic.
const recentMessages: string[] = []
const RECENT_HISTORY_SIZE = 5

// Gemini 3.1 Flash Lite — verified the most generous free-tier quota on
// this account dashboard (15 RPM / 500 RPD). Google migrated free-tier
// allocation away from the 2.x series in early 2026; the 3.x lite models
// are now the sweet spot for indie use.
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent'

function buildPrompt(state: ActivityState): string {
  const now = new Date()
  const timeOfDay = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })

  const recentBlock =
    recentMessages.length > 0
      ? `\nRecent messages you've already sent (DO NOT repeat or paraphrase any of these):\n${recentMessages
          .map((m, i) => `${i + 1}. ${m}`)
          .join('\n')}\n`
      : ''

  return `You are Bonk — a break coach for developers. You speak like a thoughtful friend, not a corporate wellness app.

Current context:
- The user has been actively working for ${state.minutesSinceLastBreak} minutes since their last break.
- They are currently using: ${state.activeAppName ?? 'an unknown app'} (classified as: ${state.context}).
- Time of day: ${timeOfDay}.
${recentBlock}
Write ONE short break-suggestion message. Rules:
- Maximum 60 characters.
- Friendly, never naggy or preachy.
- Reference the situation (the time, the duration, the activity) when it makes the line better.
- Casual English. No emojis. No quotation marks. No prefixes like "Bonk:".
- Return ONLY the message text, nothing else.`
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  error?: { message?: string }
}

export async function generateBreakMessage(state: ActivityState): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.warn('[aiCoach] GEMINI_API_KEY not set — using fallback')
    return pickFallback(state.minutesSinceLastBreak)
  }

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(state) }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 80,
          topP: 0.95
        }
      })
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error(`[aiCoach] HTTP ${response.status}: ${errText.slice(0, 200)}`)
      return pickFallback(state.minutesSinceLastBreak)
    }

    const data = (await response.json()) as GeminiResponse
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!text) {
      console.warn('[aiCoach] Empty response — using fallback', data.error)
      return pickFallback(state.minutesSinceLastBreak)
    }

    // Strip stray quotes/newlines just in case the model misbehaves.
    text = text.replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0]

    // Track for de-dupe.
    recentMessages.unshift(text)
    if (recentMessages.length > RECENT_HISTORY_SIZE) {
      recentMessages.length = RECENT_HISTORY_SIZE
    }

    console.log(`[aiCoach] Generated: ${text}`)
    return text
  } catch (err) {
    console.error('[aiCoach] Generation failed:', err)
    return pickFallback(state.minutesSinceLastBreak)
  }
}
