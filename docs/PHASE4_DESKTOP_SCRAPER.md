# Phase 4 - Desktop Scraper

## Goal

Add a local scraper that runs on the user's Windows machine and collects Biletix and Passo prices with a real browser session. The cloud runner remains API-only for Eventbrite and Ticketmaster.

## Why Desktop

Biletix and Passo are JavaScript-heavy and may depend on browser state, cookies, queue pages, or authenticated sessions. A local Playwright runner can reuse a normal Chrome profile, wait for the rendered ticket widgets, and post normalized results to the existing `/api/scrape/ingest` endpoint.

## Architecture

```text
events-to-track.json
  eventbrite_id / ticketmaster_id  -> GitHub Actions cloud scraper
  biletix_url / passo_url          -> desktop-scraper on local PC

desktop-scraper/run.js
  -> opens Playwright persistent Chrome profile
  -> visits Biletix and Passo URLs
  -> extracts cheapest available ticket
  -> signs payload with INGEST_SECRET
  -> POSTs to APP_URL/api/scrape/ingest
```

## Folder Layout

```text
desktop-scraper/
  package.json
  .env.example
  README.md
  run.js
  collectors/
    biletix.js
    passo.js
  lib/
    browser.js
    normalize.js
    sign.js
```

## Data Contract

Input comes from `events-to-track.json`.

```json
{
  "internal_name": "event-slug",
  "biletix_url": "https://www.biletix.com/etkinlik/...",
  "passo_url": "https://www.passo.com.tr/..."
}
```

Output uses the same ingest shape as the cloud runner.

```json
{
  "internal_name": "event-slug",
  "results": [
    {
      "platform_id": "biletix",
      "status": "ok",
      "amount": 750,
      "available": true,
      "category": "Genel Satis",
      "raw_url": "https://www.biletix.com/etkinlik/..."
    }
  ]
}
```

## Implementation Plan

1. Create `desktop-scraper/package.json` with `playwright`, `axios`, and `dotenv`.
2. Add `desktop-scraper/lib/sign.js` matching the existing HMAC signing logic.
3. Add `desktop-scraper/lib/browser.js` to launch a persistent Chromium/Chrome context.
4. Build `collectors/biletix.js`:
   - wait for network idle
   - close cookie or notification overlays when present
   - collect visible price text candidates
   - parse TRY/TL amounts
   - return cheapest available ticket
5. Build `collectors/passo.js` with the same normalized return contract.
6. Build `run.js`:
   - load `../events-to-track.json`
   - skip events without desktop URLs
   - enrich metadata once when available
   - post signed scrape payloads to the API
   - support `--dry-run`, `--headed`, and `--event <internal_name>`
7. Add `desktop-scraper/README.md` with setup and Windows Task Scheduler instructions.

## Environment

```text
APP_URL=https://your-app.vercel.app
INGEST_SECRET=same-secret-as-api
CHROME_USER_DATA_DIR=C:\Users\<you>\AppData\Local\Google\Chrome\User Data
CHROME_PROFILE=Default
```

## Local Usage

```bash
cd desktop-scraper
npm install
npm run scrape -- --headed
npm run scrape -- --dry-run --event measurecamp-istanbul-2026
```

## Scheduling

Use Windows Task Scheduler to run:

```text
Program: node
Arguments: C:\path\to\repo\desktop-scraper\run.js
Start in: C:\path\to\repo\desktop-scraper
```

Run every 4 hours while the PC is awake. The cloud runner continues on GitHub Actions independently.

## Open Questions Before Build

- Which Chrome profile should be reused for Biletix and Passo?
- Should the first desktop version launch headed by default for easier login/debugging?
- Do we want screenshots saved on failures for selector debugging?
- Should Biletix/Passo event URLs be added to the current Eventbrite-tracked rows or tracked as separate rows until matching is confirmed?
