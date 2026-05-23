import { app } from 'electron'
import type { ActivityState } from './activity'

/**
 * AI break coach — generates a fresh, context-aware nudge message every
 * time, instead of cycling through a hardcoded pool.
 *
 * V0 uses Google Gemini 3.1 Flash Lite because its free-tier quota
 * (15 RPM / 500 RPD) is the most generous tier currently allocated.
 * Swap to Claude Haiku (or whatever) once revenue justifies it — the
 * prompt and fallback logic stay identical.
 *
 * Localization: messages are generated in the user's OS language. If
 * the API call fails for any reason (no key, network, rate limit, empty
 * response) we fall back to a small hand-written pool in the same
 * language family (Korean or English for now; English for everything else).
 */

const FALLBACK_MESSAGES_EN = [
  "You've been at it {min} min straight. Quick 2-min break?",
  '{min} min of focus. Your shoulders are asking for a stretch.',
  'Hey — {min} min in. How about a 30-second walk?',
  '{min} min straight. Eyes deserve a sec on something far away.',
  'You and the keyboard had a {min}-min date. Stretch break?'
]

const FALLBACK_MESSAGES_KO = [
  '{min}분 연속이에요. 잠깐 쉬어가요?',
  '{min}분 집중 중! 어깨 한번 돌려볼래요?',
  '쉴 시간이에요. {min}분 됐어요. 30초만 어때요?',
  '{min}분 동안 쭉! 잠깐 먼 곳 한 번 봐주세요.',
  '{min}분 연속 코딩이네요. 스트레칭 30초!'
]

/**
 * Map an OS locale to the language directive we'll feed into the prompt,
 * plus the fallback pool to use if the API call fails.
 */
function getLanguageInfo(): {
  code: string
  promptDirective: string
  fallbackPool: string[]
} {
  const locale = app.getLocale() // e.g. "ko-KR", "en-US", "ja"
  const lang = locale.split('-')[0].toLowerCase()

  switch (lang) {
    case 'ko':
      return {
        code: 'ko',
        promptDirective:
          'Respond in Korean (한국어). Casual friendly tone — like a thoughtful friend. ' +
          '친근한 반말 or 친근한 존댓말 both fine, whichever feels more natural for the message.',
        fallbackPool: FALLBACK_MESSAGES_KO
      }
    case 'ja':
      return {
        code: 'ja',
        promptDirective: 'Respond in Japanese (日本語). Casual but polite tone.',
        fallbackPool: FALLBACK_MESSAGES_EN
      }
    case 'zh':
      return {
        code: 'zh',
        promptDirective: 'Respond in Chinese (中文). Casual friendly tone.',
        fallbackPool: FALLBACK_MESSAGES_EN
      }
    case 'es':
      return {
        code: 'es',
        promptDirective: 'Respond in Spanish. Casual friendly tone.',
        fallbackPool: FALLBACK_MESSAGES_EN
      }
    case 'fr':
      return {
        code: 'fr',
        promptDirective: 'Respond in French. Casual friendly tone.',
        fallbackPool: FALLBACK_MESSAGES_EN
      }
    case 'de':
      return {
        code: 'de',
        promptDirective: 'Respond in German. Casual friendly tone.',
        fallbackPool: FALLBACK_MESSAGES_EN
      }
    default:
      return {
        code: 'en',
        promptDirective: 'Respond in English. Casual friendly tone.',
        fallbackPool: FALLBACK_MESSAGES_EN
      }
  }
}

function pickFallback(min: number, pool: string[]): string {
  const template = pool[Math.floor(Math.random() * pool.length)]
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

function buildPrompt(state: ActivityState, languageDirective: string): string {
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
- ${languageDirective}
- Maximum 60 characters.
- Friendly, never naggy or preachy.
- Reference the situation (the time, the duration, the activity) when it makes the line better.
- No emojis. No quotation marks. No prefixes like "Bonk:".
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
  const lang = getLanguageInfo()
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.warn('[aiCoach] GEMINI_API_KEY not set — using fallback')
    return pickFallback(state.minutesSinceLastBreak, lang.fallbackPool)
  }

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(state, lang.promptDirective) }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 120,
          topP: 0.95
        }
      })
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error(`[aiCoach] HTTP ${response.status}: ${errText.slice(0, 200)}`)
      return pickFallback(state.minutesSinceLastBreak, lang.fallbackPool)
    }

    const data = (await response.json()) as GeminiResponse
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!text) {
      console.warn('[aiCoach] Empty response — using fallback', data.error)
      return pickFallback(state.minutesSinceLastBreak, lang.fallbackPool)
    }

    // Strip stray quotes/newlines just in case the model misbehaves.
    text = text.replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0]

    // Track for de-dupe.
    recentMessages.unshift(text)
    if (recentMessages.length > RECENT_HISTORY_SIZE) {
      recentMessages.length = RECENT_HISTORY_SIZE
    }

    console.log(`[aiCoach] Generated (${lang.code}): ${text}`)
    return text
  } catch (err) {
    console.error('[aiCoach] Generation failed:', err)
    return pickFallback(state.minutesSinceLastBreak, lang.fallbackPool)
  }
}
