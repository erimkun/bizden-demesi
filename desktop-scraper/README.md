# Desktop Scraper

Local Playwright runner for Biletix and Passo. It reads `../events-to-track.json`, visits `biletix_url` and `passo_url`, extracts the cheapest visible TRY/TL price, then posts signed results to `/api/scrape/ingest`.

## Setup

```bash
cd desktop-scraper
npm install
copy .env.example .env
```

Set `APP_URL` and `INGEST_SECRET` in `.env`.

By default the runner uses `desktop-scraper/.browser-profile`. Run once with `--headed`, log in to Biletix/Passo if needed, then close the browser. Future runs reuse that local browser profile.

You can also set `CHROME_USER_DATA_DIR` and `CHROME_PROFILE` to reuse your real Chrome profile. Close Chrome first, because Chrome locks active profiles.

## Run

```bash
npm run scrape:headed
npm run scrape:dry -- --event some-internal-name
npm run scrape
```

## Add Desktop URLs

Add Biletix/Passo URLs to existing rows in `../events-to-track.json`.

```json
{
  "internal_name": "some-event",
  "name": "Some Event",
  "biletix_url": "https://www.biletix.com/etkinlik/...",
  "passo_url": "https://www.passo.com.tr/..."
}
```

The cloud runner ignores these URL fields. The desktop runner ignores Eventbrite and Ticketmaster IDs.

## Discover Biletix URLs Automatically

The Biletix discovery command scans public Biletix category/listing pages, expands group/event pages into concrete `performance` URLs, and merges them into `../events-to-track.json`.

```bash
npm run discover:biletix:dry -- --max 10
npm run discover:biletix -- --max 25
```

Useful options:

```bash
npm run discover:biletix:dry -- --urls "https://www.biletix.com/category/ART/TURKIYE/tr" --max 10
npm run discover:biletix -- --resolve-limit 60 --max 50
```

After discovery, run `npm run scrape:dry` first. Then run `npm run scrape` to send signed results to the API.

## Schedule On Windows

Use Task Scheduler:

```text
Program: node
Arguments: C:\path\to\repo\desktop-scraper\run.js
Start in: C:\path\to\repo\desktop-scraper
```

Run every 4 hours while the PC is awake.
