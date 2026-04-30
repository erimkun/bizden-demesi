# Phase 3 — Real Scraping Design

**Date:** 2026-04-30
**Status:** Approved by user, ready for implementation plan
**Builds on:** Phase 2 (Vercel serverless + Neon Postgres)

---

## Goal

Replace the seeded placeholder events with real Turkish ticketing data. For a curated list of events, scrape Biletix and Passo for live prices, and call the Eventbrite + Ticketmaster public APIs for the rare Turkish event that surfaces there.

## Non-goals

- Discovery (auto-finding new events on listing pages). This is curated-list-only.
- International events outside Turkey.
- Headless-browser scraping (Puppeteer / Playwright). Stays as an escalation path if static scraping gets blocked.
- Admin UI for adding events. Edits happen via JSON in the repo.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions runner — every 4h, free, no Vercel timeout   │
│                                                             │
│  scrape/run.js                                              │
│    1. Read events-to-track.json                             │
│    2. For each event, run 4 collectors in parallel:         │
│       - scrape/collectors/biletix.js     (axios + cheerio)  │
│       - scrape/collectors/passo.js       (axios + cheerio)  │
│       - scrape/collectors/eventbrite.js  (REST API)         │
│       - scrape/collectors/ticketmaster.js (Discovery API)   │
│    3. POST batched results to /api/scrape/ingest            │
│       with HMAC-SHA256 signature                            │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌─────────────────────────────────────────────────────────────┐
│ Vercel API (read-heavy, no third-party calls)               │
│                                                             │
│  POST /api/scrape/ingest  (HMAC-validated)                  │
│    → write to price_snapshots                               │
│    → update event_platform_links.last_status                │
│    → write row to scrape_log                                │
│                                                             │
│  GET  /api/events  (unchanged — serves frontend)            │
└─────────────────────────────────────────────────────────────┘
                              ↓
                          Neon Postgres
```

The big shift versus Phase 2: scraping moves entirely off Vercel. Vercel only stores what the runner sends it. This solves the 10-second function timeout problem and isolates the messy third-party-website logic in one place.

---

## Components

### Scrape worker (new top-level `scrape/` directory)

| File | Responsibility |
|------|----------------|
| `scrape/run.js` | Entry point. Reads JSON, orchestrates collectors, batches results, POSTs to ingest. |
| `scrape/collectors/biletix.js` | Static-HTML scraper for Biletix event pages. |
| `scrape/collectors/passo.js` | Static-HTML scraper for Passo event pages. |
| `scrape/collectors/eventbrite.js` | Eventbrite Public API client. |
| `scrape/collectors/ticketmaster.js` | Ticketmaster Discovery API client. |
| `scrape/lib/http.js` | Shared `axios` instance with rate limiting + retry + UA. |
| `scrape/lib/sign.js` | HMAC-SHA256 signing for ingest payloads. |

Every collector exports the same shape:
```js
async function collect({ url, apiId, eventName }) → {
  amount: number | null,        // lira, integer
  available: boolean,
  category: string | null,      // seat category
  raw_url: string,              // direct buy URL on that platform
  status: 'ok' | 'unavailable' | 'blocked' | 'not_found',
  error?: string                // present only when status !== 'ok'
}
```

Same interface across all four → easy to test, easy to add a new platform later.

### Vercel API additions

- **`POST /api/scrape/ingest`** — accepts:
  ```json
  {
    "internal_name": "sezen-aksu-mar-2026",
    "results": [
      { "platform_id": "biletix", "amount": 1250, "available": true, "category": "Genel Alan", "url": "...", "status": "ok" },
      { "platform_id": "passo",   "amount": 1190, "available": true, "category": "Genel Alan", "url": "...", "status": "ok" },
      { "platform_id": "eventbrite",   "status": "not_found" },
      { "platform_id": "ticketmaster", "status": "not_found" }
    ],
    "signature": "hex-hmac-sha256"
  }
  ```
  Validates HMAC against `INGEST_SECRET` env var, looks up event by `internal_name`, writes one `price_snapshots` row per result, updates `event_platform_links.last_status`, writes one `scrape_log` row. Fast (<2s), no external calls.

- **`POST /api/scrape/enrich-metadata`** — internal endpoint hit by `scrape/run.js` on first run for a new event. Receives scraped Biletix metadata (title, venue, date, og:image) and updates the `events` row. HMAC-protected.

- **`/api/scrape/trigger` and `api/cron/scrape.js` get deleted.** Scraping no longer runs on Vercel.

### Event list (`events-to-track.json` at repo root)

```json
[
  {
    "internal_name": "sezen-aksu-mar-2026",
    "biletix_url": "https://www.biletix.com/event/...",
    "passo_url": "https://www.passo.com.tr/...",
    "eventbrite_id": null,
    "ticketmaster_id": null
  }
]
```

Just identifiers — display name, venue, date, image come from scraping the Biletix page on first run (Biletix is the most reliable source for Turkish event metadata). User can edit this file at any time and the next runner pass picks up changes.

---

## Schema changes

All migrations are idempotent (`IF NOT EXISTS`).

### `events` — add columns
- `internal_name TEXT UNIQUE` — stable key matching the JSON file.
- `last_enriched_at TIMESTAMPTZ` — when metadata was last re-pulled.

### `event_platform_links` — add columns
- `platform_event_id TEXT` — Eventbrite/Ticketmaster API ID (NULL for Biletix/Passo where we use `external_url`).
- `last_status TEXT` — most recent collector status (`ok` / `unavailable` / `blocked` / `not_found`).
- `last_status_at TIMESTAMPTZ` — when that status was set.

### Existing tables unchanged
`platforms`, `price_snapshots`, `scrape_log`.

### Initial data migration
- Wipe the 8 fake seeded events.
- User provides 3-5 real Turkish event URLs as the starting dataset.

---

## Error handling

**Per-platform failure (HTTP 403, selector miss, JSON parse error)**
- Collector returns `{ status: 'blocked' | 'not_found' }`.
- Ingest endpoint records the status; does NOT write a price snapshot for that platform.
- Previous snapshot remains the latest known price.
- UI shows "fiyat alınamadı" badge instead of a number.

**Per-event failure (all 4 collectors error)**
- One row written to `scrape_log` with status `error` and the joined error messages.
- Other events in the batch continue normally.

**Whole-run failure (network down, INGEST_SECRET missing, ingest 5xx)**
- GitHub Actions step exits non-zero → workflow marked failed → email notification.
- Next 4-hour run retries from scratch.

**Stale-data UI hint**
- Each event card already surfaces `last_updated` per platform.
- If `last_updated` is older than 12 hours, the UI grays out the price.

**Anti-bot policy**
- Start polite: 1 req/sec/platform, realistic browser User-Agent string, no cookies stored.
- If a platform starts returning 403 / CAPTCHA on >50% of requests in a 24h window:
  1. First escalation — randomized 2-5s delays between requests on that platform.
  2. Second escalation — swap that collector for a Puppeteer-based one (heavier, only if needed).
- We do NOT build #2 up front. Start simple, escalate only when warranted.

---

## Testing

**Unit tests — `scrape/collectors/__tests__/`**
- For each collector, given a saved HTML fixture (or mock API response), parse correctly.
- Run via existing GitHub Actions CI on every push.
- Fixtures committed to repo so tests are deterministic.

**Integration test for ingest endpoint**
- POST a sample valid payload → assert `price_snapshots` rows written.
- POST with bad HMAC → assert 401.
- POST referencing unknown `internal_name` → assert 404.

**Manual smoke test**
- `node scrape/run.js --dry-run` runs the pipeline locally without POSTing to ingest. Used when adding new events to confirm the JSON entry produces sensible output.

**Out of scope:** browser e2e tests for the frontend.

---

## Secrets / configuration

| Secret | Where | Purpose |
|--------|-------|---------|
| `INGEST_SECRET` | Vercel env vars + GitHub Actions secret | HMAC key for ingest endpoint. |
| `EVENTBRITE_TOKEN` | GitHub Actions secret | Eventbrite Public API auth. |
| `TICKETMASTER_API_KEY` | GitHub Actions secret | Ticketmaster Discovery API auth. |
| `APP_URL` | GitHub Actions secret | Already exists from previous workflow. |

`DATABASE_URL` and `ADMIN_KEY` already configured in Vercel — no change needed.

---

## Migration / rollout plan

1. Create the `scrape/` directory and collectors (with stub data and unit tests).
2. Add the new ingest endpoint + DB migration. Deploy to Vercel.
3. Update GitHub Actions workflow to run `scrape/run.js` instead of curling the old trigger endpoint.
4. Add 3 real events to `events-to-track.json`. Run the workflow manually via "workflow_dispatch".
5. Verify rows appear in Neon, frontend shows real prices.
6. Wipe the old fake-event rows from Neon (one-off SQL).
7. Delete the now-unused `api/cron/scrape.js` and `/api/scrape/trigger` route.

---

## Out of scope (future phases)

- Auto-discovery of events from listing pages.
- Eventbrite/Ticketmaster events outside Turkey.
- Admin UI for managing the event list.
- Headless-browser scrapers.
- Price-alert emails (separate Phase 4 idea).
- Multi-currency support.
