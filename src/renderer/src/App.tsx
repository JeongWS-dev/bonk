function BonkLogo({ size = 96 }: { size?: number }): React.JSX.Element {
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

function App(): React.JSX.Element {
  return (
    <div className="bonk-app">
      <header className="bonk-header">
        <div className="bonk-logo-wrap">
          <BonkLogo size={96} />
        </div>
        <h1>Bonk</h1>
        <p className="tagline">
          A friendly bonk when you&apos;ve been coding too long.
        </p>
      </header>

      <section className="bonk-card">
        <h2>Today</h2>
        <div className="stats-grid">
          <div className="stat">
            <div className="stat-value">—</div>
            <div className="stat-label">min coding</div>
          </div>
          <div className="stat">
            <div className="stat-value">—</div>
            <div className="stat-label">breaks taken</div>
          </div>
          <div className="stat">
            <div className="stat-value">—</div>
            <div className="stat-label">stretches done</div>
          </div>
        </div>
        <p className="hint">
          Live stats are coming. For now Bonk just lives in your tray and nudges
          you when it&apos;s time.
        </p>
      </section>

      <section className="bonk-card">
        <h2>How Bonk works</h2>
        <ul className="how-list">
          <li>
            <span className="dot" /> Watches what app you&apos;re in (never what
            you type)
          </li>
          <li>
            <span className="dot" /> Pauses the timer when you step away
          </li>
          <li>
            <span className="dot" /> Stays quiet during meetings and deep
            debugging
          </li>
          <li>
            <span className="dot" /> Nudges you with a fresh AI-generated
            message — never the same line twice
          </li>
        </ul>
      </section>

      <footer className="bonk-footer">
        Building in public ·{' '}
        <a href="https://github.com/JeongWS-dev/bonk" target="_blank" rel="noreferrer">
          github.com/JeongWS-dev/bonk
        </a>
      </footer>
    </div>
  )
}

export default App
