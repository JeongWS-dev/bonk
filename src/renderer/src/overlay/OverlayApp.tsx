import { useEffect, useMemo, useState } from 'react'
import { getStrings } from './i18n'

type Stage = 'card' | 'skip-reason'

export type SkipReason = 'in-flow' | 'just-took' | 'bad-timing' | 'annoyed'

interface OverlayPayload {
  message: string
  minutesSinceLastBreak: number
  contextAppName: string | null
}

interface BonkOverlayApi {
  onShow: (handler: (payload: OverlayPayload) => void) => () => void
  take: () => void
  snooze: () => void
  skip: (reason: SkipReason) => void
  dismiss: () => void
}

declare global {
  interface Window {
    bonkOverlay?: BonkOverlayApi
  }
}

function BonkLogo({ size = 28 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="1024" height="1024" rx="218" fill="#C77F5A" />
      <text
        x="512"
        y="737"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
        fontSize="628"
        fontWeight="800"
        fill="#FFF8E7"
        textAnchor="middle"
      >
        B
      </text>
      <circle cx="771" cy="314" r="41" fill="#FFF8E7" />
    </svg>
  )
}

// Order matters — this is the order the user sees the choices.
const SKIP_ORDER: SkipReason[] = ['in-flow', 'just-took', 'bad-timing', 'annoyed']

function OverlayApp(): React.JSX.Element | null {
  const [payload, setPayload] = useState<OverlayPayload | null>(null)
  const [stage, setStage] = useState<Stage>('card')
  const [visible, setVisible] = useState(false)

  // Resolved once on mount — OS language won't change mid-session.
  const t = useMemo(() => getStrings(), [])

  useEffect(() => {
    const api = window.bonkOverlay
    if (!api) {
      // Standalone preview when running outside Electron — useful for dev.
      setPayload({
        message: 'Preview mode — open this through Bonk to see real data.',
        minutesSinceLastBreak: 12,
        contextAppName: 'Cursor'
      })
      setVisible(true)
      return
    }

    const unsubscribe = api.onShow((next) => {
      setPayload(next)
      setStage('card')
      setVisible(true)
    })

    return unsubscribe
  }, [])

  if (!payload) return null

  const dismissWithFade = (action: () => void): void => {
    setVisible(false)
    // Let the slide-out animation play before telling main to close.
    window.setTimeout(action, 220)
  }

  const onTake = (): void => {
    dismissWithFade(() => window.bonkOverlay?.take())
  }

  const onSnooze = (): void => {
    dismissWithFade(() => window.bonkOverlay?.snooze())
  }

  const onSkipClick = (): void => {
    setStage('skip-reason')
  }

  const onSkipReason = (reason: SkipReason): void => {
    dismissWithFade(() => window.bonkOverlay?.skip(reason))
  }

  const metaText = payload.contextAppName
    ? t.metaWithApp(payload.minutesSinceLastBreak, payload.contextAppName)
    : t.metaWithoutApp(payload.minutesSinceLastBreak)

  return (
    <div className={`overlay-card ${visible ? 'is-visible' : ''}`}>
      <div className="overlay-header">
        <BonkLogo size={28} />
        <div className="overlay-title">
          <div className="overlay-app-name">Bonk</div>
          <div className="overlay-meta">{metaText}</div>
        </div>
        <button className="overlay-x" aria-label={t.dismissAria} onClick={onSnooze}>
          ✕
        </button>
      </div>

      {stage === 'card' && (
        <>
          <p className="overlay-message">{payload.message}</p>

          <div className="overlay-exercise">
            <div className="overlay-exercise-dot" />
            <div>
              <div className="overlay-exercise-title">{t.exerciseTitle}</div>
              <div className="overlay-exercise-sub">{t.exerciseSub}</div>
            </div>
          </div>

          <div className="overlay-actions">
            <button className="btn btn-primary" onClick={onTake}>
              {t.take}
            </button>
            <button className="btn btn-secondary" onClick={onSnooze}>
              {t.snooze}
            </button>
            <button className="btn btn-ghost" onClick={onSkipClick}>
              {t.skip}
            </button>
          </div>
        </>
      )}

      {stage === 'skip-reason' && (
        <div className="overlay-skip">
          <div className="overlay-skip-q">{t.skipWhy}</div>
          <div className="overlay-skip-options">
            {SKIP_ORDER.map((id) => (
              <button
                key={id}
                className="btn-skip-option"
                onClick={() => onSkipReason(id)}
              >
                {t.skipOptions[id]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default OverlayApp
