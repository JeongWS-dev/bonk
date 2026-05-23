# Bonk

> A friendly bonk when you've been coding too long.

**Bonk** is a break reminder app for Windows developers that actually knows when you're debugging — so it shuts up at the right time.

## Status

🛠️ **In active development.** Building in public.

Follow the journey: [@JeongWSDev](https://x.com/JeongWSDev)

## Why Bonk?

Most break apps:
- Are Mac-only
- Don't know what you're doing
- Interrupt you mid-debug
- Give the same boring "look away" prompt every time

Bonk:
- Windows-first (Mac coming later)
- Knows when you're in flow vs reading docs vs idle
- Defers breaks during active debugging
- AI-generated, never-the-same coach messages

## Roadmap

- [ ] Week 1: Activity tracking + system tray + notification system
- [ ] Week 2: AI coach + break overlay + exercise library
- [ ] Week 3: Payment + landing page + launch

## Tech Stack

- **Electron** + **React** + **TypeScript** (via electron-vite)
- **active-win** + **desktop-idle** for cross-platform activity tracking
- **better-sqlite3** for local activity logs
- **Claude Haiku** for AI coach messages (via Cloudflare Worker proxy)
- **Lemonsqueezy** for payments

## Development

### Prerequisites

- Node.js v20+ (v22 LTS recommended)

### Setup

```bash
git clone https://github.com/JeongWS-dev/bonk.git
cd bonk
npm install
npm run dev
```

### Build

```bash
# Windows
npm run build:win

# macOS (coming later)
npm run build:mac
```

## Privacy

Bonk never logs what you type. It only counts *that* you type. All activity data stays on your machine. AI calls send only aggregated counts (e.g. "user has been coding 90 minutes"), never window titles or file names.

## License

MIT
