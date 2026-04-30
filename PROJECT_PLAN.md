# BiletKarşılaştır — Project Plan

## Goal

Build a Turkish ticket price comparison platform that automatically tracks and visualises how event ticket prices change over time across the four major platforms: **Biletix**, **Passo**, **Eventbrite**, and **Ticketmaster**.

Users can see at a glance:
- Which platform sells a ticket cheapest right now
- How the price has moved over the past 48 hours (or longer)
- Whether a platform has sold out
- Price trend alerts (planned)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React + Vite)         /biletkarsilastir  │
│  Deployed on Vercel                                  │
└────────────────────┬────────────────────────────────┘
                     │ REST API  http://localhost:3001
┌────────────────────▼────────────────────────────────┐
│  Backend (Node.js + Express)     /backend            │
│  Deployed on Railway                                 │
│                                                      │
│  ┌──────────┐  ┌──────────────────────────────────┐ │
│  │ node-cron│→ │ Scrapers                         │ │
│  │ (every 4h│  │  biletix.js  passo.js            │ │
│  │ by deflt)│  │  eventbrite.js  ticketmaster.js  │ │
│  └──────────┘  └──────────────┬───────────────────┘ │
│                               │                      │
│                ┌──────────────▼───────────────────┐  │
│                │  SQLite  (better-sqlite3)         │  │
│                │  biletkarsilastir.db              │  │
│                │                                   │  │
│                │  events                           │  │
│                │  platforms                        │  │
│                │  event_platform_links             │  │
│                │  price_snapshots  ← time-series  │  │
│                │  scrape_log                       │  │
│                └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## Phases

### Phase 1 — Frontend Proof of Concept ✅ COMPLETE

**Goal:** Validate the UI/UX with mock data before investing in infrastructure.

- [x] React + Vite app with GSAP animations
- [x] Price comparison cards across 4 platforms
- [x] Price history chart (Chart.js) — simulated 48-point data
- [x] Category filter bar (konser, tiyatro, festival, spor)
- [x] Status bar showing last fetch time and next refresh
- [x] localStorage-based price snapshot cache
- [x] Deployed to Vercel

---

### Phase 2 — Backend + Real Database 🔄 IN PROGRESS

**Goal:** Replace mock data with a real Node.js backend, SQLite database, and working scraper architecture.

#### 2a — Server & Database
- [x] Express server (`backend/src/server.js`)
- [x] SQLite schema via `better-sqlite3`
  - `platforms`, `events`, `event_platform_links`, `price_snapshots`, `scrape_log`
- [x] Seed script: migrates all 8 mock events into the DB with 48-hour simulated history
- [x] REST API routes:
  - `GET /api/events` (with price enrichment + cheapest platform)
  - `GET /api/events/:id`
  - `GET /api/events/:id/prices`
  - `GET /api/events/:id/history`
  - `GET /api/platforms`
  - `GET /api/health`
  - `GET /api/scrape/status` + `GET /api/scrape/logs`
  - `POST /api/scrape/trigger` (admin)

#### 2b — Scrapers
- [x] Scraper architecture and orchestrator (`scrapers/index.js`)
- [x] Biletix scraper stub (axios + cheerio)
- [x] Passo scraper stub (axios + cheerio)
- [x] Eventbrite scraper stub (public API + HTML fallback)
- [x] Ticketmaster scraper stub (Discovery API + HTML fallback)
- [ ] **Live selector validation** — visit each platform and confirm CSS selectors
- [ ] **Error rate monitoring** — alert if >50% of scrapes fail

#### 2c — Scheduler
- [x] `node-cron` price job (configurable interval, default 4 hours)
- [ ] Exponential back-off on scrape failure

#### 2d — Frontend Integration
- [ ] Replace `mockData.js` with API calls to the backend
- [ ] Update `usePriceData.js` hook to fetch from `GET /api/events`
- [ ] Update price chart to fetch from `GET /api/events/:id/history`
- [ ] Handle loading and error states from real API
- [ ] Display `last_updated` timestamp from real scraped data

---

### Phase 3 — Production Hardening

**Goal:** Make the system robust enough to run unattended.

- [ ] Deploy backend to Railway (or Render / Fly.io)
- [ ] Set environment variables in production (ADMIN_KEY, TICKETMASTER_API_KEY, etc.)
- [ ] Add rate-limit headers to scraper HTTP requests
- [ ] Rotate User-Agent strings to avoid bot detection
- [ ] Playwright fallback for JS-heavy pages (if cheerio fails)
- [ ] SQLite → PostgreSQL migration path (if multi-server needed)
- [ ] Automated DB backup (daily SQLite copy to object storage)
- [ ] `/api/health` monitoring via UptimeRobot or Better Uptime
- [ ] Data retention: purge `price_snapshots` older than 90 days

---

### Phase 4 — User Features

**Goal:** Add user-facing value beyond simple price comparison.

- [ ] Price-drop alerts (email / push notification when price drops X%)
- [ ] Price prediction indicator ("likely to rise / fall")
- [ ] Event discovery — auto-detect new events from platform listings
- [ ] Multi-city support (Ankara, İzmir, Bursa)
- [ ] Mobile-responsive redesign / PWA
- [ ] Wishlist / saved events (localStorage → user accounts)
- [ ] Share link for a specific event comparison

---

## Tech Stack

| Layer        | Technology                          | Why                                      |
|--------------|-------------------------------------|------------------------------------------|
| Frontend     | React 18 + Vite                     | Fast dev experience, Vercel-ready        |
| Animations   | GSAP                                | Smooth chart and card transitions        |
| Charts       | Chart.js                            | Lightweight, works well with React       |
| Backend      | Node.js + Express                   | Minimal overhead, same language as frontend |
| Database     | SQLite (better-sqlite3)             | Zero-config, fast reads, no infra needed |
| Scraping     | axios + cheerio (+ Playwright TODO) | Lightweight HTML parsing                 |
| Scheduler    | node-cron                           | Simple in-process cron, no Redis needed  |
| Hosting (FE) | Vercel                              | Free tier, auto-deploy from git          |
| Hosting (BE) | Railway                             | Persistent filesystem for SQLite         |

---

## Environment Variables

| Variable                  | Description                              | Default          |
|---------------------------|------------------------------------------|------------------|
| `PORT`                    | Express server port                      | `3001`           |
| `NODE_ENV`                | `development` or `production`            | `development`    |
| `DB_PATH`                 | Path to SQLite file                      | `./data/biletkarsilastir.db` |
| `SCRAPE_INTERVAL_HOURS`   | How often to scrape (hours)              | `4`              |
| `ADMIN_KEY`               | Secret key for `/api/scrape/trigger`     | *(open in dev)*  |
| `TICKETMASTER_API_KEY`    | Ticketmaster Discovery API key (free)    | *(HTML fallback)*|
| `HISTORY_DAYS`            | Days of price history to retain          | `90`             |

---

## Repository Structure

```
bizden-demesi/
├── biletkarsilastir/          Frontend React app (Phase 1)
│   ├── src/
│   │   ├── data/mockData.js   Will be replaced by API calls in Phase 2d
│   │   ├── hooks/usePriceData.js
│   │   └── components/
│   └── package.json
│
├── backend/                   Backend API (Phase 2+)
│   ├── src/
│   │   ├── server.js          Express entry point
│   │   ├── db/
│   │   │   ├── database.js    SQLite connection + schema
│   │   │   └── seed.js        One-time data population
│   │   ├── routes/
│   │   │   ├── events.js
│   │   │   ├── prices.js
│   │   │   ├── platforms.js
│   │   │   └── admin.js
│   │   ├── scrapers/
│   │   │   ├── index.js       Orchestrator
│   │   │   ├── biletix.js
│   │   │   ├── passo.js
│   │   │   ├── eventbrite.js
│   │   │   └── ticketmaster.js
│   │   └── jobs/
│   │       └── priceJob.js    node-cron scheduler
│   ├── API_ENDPOINTS.md
│   ├── package.json
│   └── .env.example
│
└── PROJECT_PLAN.md            ← this file
```

---

## Getting Started (Development)

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Copy environment file and configure
cp .env.example .env

# 3. Seed the database with initial data
npm run seed

# 4. Start the API server
npm run dev
# → http://localhost:3001/api/health

# 5. In another terminal, start the frontend
cd ../biletkarsilastir
npm install
npm run dev
# → http://localhost:5173
```

---

## Immediate Next Steps

1. **Validate scraper selectors** — open Biletix and Passo in a browser, inspect the ticket price elements, and update the CSS selectors in `backend/src/scrapers/biletix.js` and `passo.js`.
2. **Wire frontend to API** — update `usePriceData.js` to call `GET /api/events` instead of importing from `mockData.js`.
3. **Deploy backend** — create a Railway project, add the repo, set env vars, and expose the API URL to the frontend via `VITE_API_URL`.
