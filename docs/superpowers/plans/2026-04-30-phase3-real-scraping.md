# Phase 3 — Real Scraping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder seeded events with live ticket prices from Biletix + Passo (scraped) and Eventbrite + Ticketmaster (API). Scrapers run on GitHub Actions, push results into Vercel via an HMAC-signed ingest endpoint.

**Architecture:** GitHub Actions runner reads `events-to-track.json`, runs 4 collectors in parallel per event, POSTs results to `/api/scrape/ingest`. Vercel writes to Neon. No third-party calls happen on Vercel.

**Tech Stack:** Node 20+, axios, cheerio, jest (new), @neondatabase/serverless, Express, GitHub Actions, HMAC-SHA256 (built-in `crypto`).

**Spec:** [docs/superpowers/specs/2026-04-30-phase3-real-scraping-design.md](../specs/2026-04-30-phase3-real-scraping-design.md)

---

## File Structure

**New files**
- `events-to-track.json` (root) — curated event list with platform URLs/IDs
- `scrape/run.js` — GitHub Actions entry point; orchestrates collectors and POSTs to ingest
- `scrape/lib/http.js` — shared axios instance with rate limiting and a real User-Agent
- `scrape/lib/sign.js` — HMAC-SHA256 signing for outgoing payloads
- `scrape/collectors/biletix.js` — Biletix HTML scraper
- `scrape/collectors/passo.js` — Passo HTML scraper
- `scrape/collectors/eventbrite.js` — Eventbrite Public API client
- `scrape/collectors/ticketmaster.js` — Ticketmaster Discovery API client
- `scrape/collectors/__tests__/biletix.test.js` — fixture-based parsing test
- `scrape/collectors/__tests__/passo.test.js`
- `scrape/collectors/__tests__/eventbrite.test.js`
- `scrape/collectors/__tests__/ticketmaster.test.js`
- `scrape/collectors/__tests__/fixtures/biletix-event.html`
- `scrape/collectors/__tests__/fixtures/passo-event.html`
- `scrape/collectors/__tests__/fixtures/eventbrite-response.json`
- `scrape/collectors/__tests__/fixtures/ticketmaster-response.json`
- `api/lib/sign.js` — HMAC-SHA256 verifier (mirrors `scrape/lib/sign.js`)
- `api/lib/routes/ingest.js` — `POST /api/scrape/ingest` and `POST /api/scrape/enrich-metadata`

**Modified files**
- `package.json` (root) — add `jest` devDep, add `test` and `scrape` npm scripts
- `api/lib/db.js` — add new columns: `events.internal_name`, `events.last_enriched_at`, `event_platform_links.platform_event_id`, `event_platform_links.last_status`, `event_platform_links.last_status_at`
- `api/index.js` — mount `/api/scrape/ingest` route; remove `/api/scrape/trigger` admin route mount
- `api/lib/routes/events.js` — include `last_status` per platform in API response
- `.github/workflows/scrape.yml` — replace curl with `node scrape/run.js`
- `.github/workflows/ci.yml` — add `npm test` step

**Deleted files**
- `api/cron/scrape.js` — Vercel cron handler (no longer used; we don't pay for cron quota)
- `api/lib/scrapers.js` — old in-Vercel orchestrator
- `api/lib/routes/admin.js` — only the trigger routes; status/logs routes can stay if useful, but easier to delete and re-create later
- `backend/src/scrapers/biletix.js`, `passo.js`, `eventbrite.js`, `ticketmaster.js`, `index.js` — old stubs

---

## Task 1: Add jest and test script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add jest as devDependency and scripts**

Edit `package.json` to:

```json
{
  "name": "bizden-demesi",
  "version": "1.0.0",
  "private": true,
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "test": "jest",
    "scrape": "node scrape/run.js",
    "scrape:dry": "node scrape/run.js --dry-run"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.4",
    "axios": "^1.7.2",
    "cheerio": "^1.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  },
  "jest": {
    "testMatch": ["**/__tests__/**/*.test.js"],
    "testPathIgnorePatterns": ["/node_modules/", "/biletkarsilastir/"]
  }
}
```

- [ ] **Step 2: Install jest**

Run: `npm install`
Expected: `node_modules` populated, no errors.

- [ ] **Step 3: Verify jest runs (no tests yet → "no tests found" is OK)**

Run: `npm test`
Expected: exit code 1 with "No tests found" — that's fine for now, jest is wired up.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jest for scrape collector tests"
```

---

## Task 2: Schema migration — new columns

**Files:**
- Modify: `api/lib/db.js`

- [ ] **Step 1: Add new columns to schema (idempotent via IF NOT EXISTS via DO block)**

Append at the end of the `initSchema()` function in `api/lib/db.js`, before the `console.log` line:

```js
  // Phase 3 additions — idempotent
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS internal_name TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_internal_name ON events(internal_name) WHERE internal_name IS NOT NULL`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ`;

  await sql`ALTER TABLE event_platform_links ADD COLUMN IF NOT EXISTS platform_event_id TEXT`;
  await sql`ALTER TABLE event_platform_links ADD COLUMN IF NOT EXISTS last_status TEXT`;
  await sql`ALTER TABLE event_platform_links ADD COLUMN IF NOT EXISTS last_status_at TIMESTAMPTZ`;
```

- [ ] **Step 2: Run setup endpoint to apply migration**

Run: `curl -X POST https://bizden-demesi.vercel.app/api/admin/setup`
Expected: `{"success":true,"message":"Schema ready"}`

(Migration runs on Vercel with the new code; this requires Step 4 push first. Move this verification to after Step 4.)

- [ ] **Step 3: Verify in Neon dashboard**

Open Neon SQL editor and run:
```sql
\d events
\d event_platform_links
```
Expected: new columns visible.

- [ ] **Step 4: Commit and push (so Vercel deploys, then run Step 2)**

```bash
git add api/lib/db.js
git commit -m "feat(db): add internal_name and last_status columns for Phase 3"
git push origin master
```

After Vercel finishes deploying, run Steps 2-3.

---

## Task 3: HMAC signing utilities

**Files:**
- Create: `scrape/lib/sign.js`
- Create: `api/lib/sign.js`
- Create: `scrape/lib/__tests__/sign.test.js`

- [ ] **Step 1: Write the failing test**

Create `scrape/lib/__tests__/sign.test.js`:

```js
const { signPayload, verifySignature } = require('../sign');

describe('HMAC signing', () => {
  const secret = 'test-secret';
  const payload = { foo: 'bar', n: 42 };

  test('signs and verifies the same payload', () => {
    const sig = signPayload(payload, secret);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySignature(payload, sig, secret)).toBe(true);
  });

  test('rejects tampered payload', () => {
    const sig = signPayload(payload, secret);
    expect(verifySignature({ ...payload, foo: 'baz' }, sig, secret)).toBe(false);
  });

  test('rejects wrong secret', () => {
    const sig = signPayload(payload, secret);
    expect(verifySignature(payload, sig, 'other-secret')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — should fail (module not found)**

Run: `npx jest scrape/lib/__tests__/sign.test.js`
Expected: FAIL with "Cannot find module '../sign'".

- [ ] **Step 3: Create the signing utility**

Create `scrape/lib/sign.js`:

```js
const crypto = require('crypto');

function canonicalize(payload) {
  // Stable JSON: sort top-level keys deterministically.
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function signPayload(payload, secret) {
  const canonical = canonicalize(payload);
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

function verifySignature(payload, signature, secret) {
  const expected = signPayload(payload, secret);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

module.exports = { signPayload, verifySignature };
```

- [ ] **Step 4: Run test — should pass**

Run: `npx jest scrape/lib/__tests__/sign.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Mirror the file into api/lib/sign.js**

Create `api/lib/sign.js` with identical content to `scrape/lib/sign.js`.

(Note: keeping two copies because `api/` and `scrape/` are deployed independently. Shared code would require a build step we don't have.)

- [ ] **Step 6: Commit**

```bash
git add scrape/lib/sign.js scrape/lib/__tests__/sign.test.js api/lib/sign.js
git commit -m "feat(scrape): add HMAC-SHA256 signing utility"
```

---

## Task 4: Shared HTTP client with rate limiting

**Files:**
- Create: `scrape/lib/http.js`
- Create: `scrape/lib/__tests__/http.test.js`

- [ ] **Step 1: Write the failing test**

Create `scrape/lib/__tests__/http.test.js`:

```js
const { createPolite } = require('../http');

describe('polite HTTP client', () => {
  test('rate-limits to 1 request per second per host', async () => {
    const client = createPolite({ minIntervalMs: 1000 });
    const t0 = Date.now();
    // Two calls to the same host should be spaced ≥ 1000ms apart.
    await client.delay('biletix.com');
    await client.delay('biletix.com');
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(1000);
  });

  test('does not delay across different hosts', async () => {
    const client = createPolite({ minIntervalMs: 1000 });
    const t0 = Date.now();
    await client.delay('biletix.com');
    await client.delay('passo.com.tr');
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run test — should fail**

Run: `npx jest scrape/lib/__tests__/http.test.js`
Expected: FAIL with "Cannot find module '../http'".

- [ ] **Step 3: Implement the polite HTTP client**

Create `scrape/lib/http.js`:

```js
const axios = require('axios');

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function createPolite({ minIntervalMs = 1000 } = {}) {
  const lastHitByHost = new Map();

  async function delay(host) {
    const last = lastHitByHost.get(host) || 0;
    const wait = Math.max(0, last + minIntervalMs - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastHitByHost.set(host, Date.now());
  }

  async function get(url, opts = {}) {
    const host = new URL(url).host;
    await delay(host);
    return axios.get(url, {
      timeout: 15_000,
      headers: { 'User-Agent': DEFAULT_UA, ...(opts.headers || {}) },
      ...opts,
    });
  }

  return { get, delay };
}

module.exports = { createPolite, DEFAULT_UA };
```

- [ ] **Step 4: Run test — should pass**

Run: `npx jest scrape/lib/__tests__/http.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add scrape/lib/http.js scrape/lib/__tests__/http.test.js
git commit -m "feat(scrape): add polite HTTP client with per-host rate limit"
```

---

## Task 5: Biletix collector

**Files:**
- Create: `scrape/collectors/biletix.js`
- Create: `scrape/collectors/__tests__/biletix.test.js`
- Create: `scrape/collectors/__tests__/fixtures/biletix-event.html`

- [ ] **Step 1: Capture a real fixture**

Open a real Biletix event page in your browser, view source, save the HTML to:
`scrape/collectors/__tests__/fixtures/biletix-event.html`

If you can't grab one yet, use this minimal fixture content for the test:

```html
<!doctype html>
<html>
<head>
  <meta property="og:title" content="Sezen Aksu — Yeni Dünya Turnesi">
  <meta property="og:image" content="https://www.biletix.com/img/sezen.jpg">
</head>
<body>
  <div class="event-info">
    <span class="event-venue">Ülker Stadyum, İstanbul</span>
    <span class="event-date">22 Mart 2026 21:00</span>
  </div>
  <div class="ticket-prices">
    <div class="ticket-row" data-category="Genel Alan">
      <span class="price-amount">1.250 TL</span>
      <span class="availability">Mevcut</span>
    </div>
    <div class="ticket-row" data-category="VIP">
      <span class="price-amount">2.500 TL</span>
      <span class="availability">Tükendi</span>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

Create `scrape/collectors/__tests__/biletix.test.js`:

```js
const fs = require('fs');
const path = require('path');
const { parsePrice, parseMetadata } = require('../biletix');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures/biletix-event.html'),
  'utf8'
);

describe('biletix collector', () => {
  test('parsePrice extracts cheapest available ticket', () => {
    const result = parsePrice(fixture);
    expect(result).toEqual({
      amount: 1250,
      available: true,
      category: 'Genel Alan',
      status: 'ok',
    });
  });

  test('parseMetadata extracts title, venue, date, image', () => {
    const meta = parseMetadata(fixture);
    expect(meta.name).toBe('Sezen Aksu — Yeni Dünya Turnesi');
    expect(meta.image_url).toBe('https://www.biletix.com/img/sezen.jpg');
    expect(meta.venue).toContain('Ülker Stadyum');
  });
});
```

- [ ] **Step 3: Run test — should fail**

Run: `npx jest scrape/collectors/__tests__/biletix.test.js`
Expected: FAIL with "Cannot find module '../biletix'".

- [ ] **Step 4: Implement the collector**

Create `scrape/collectors/biletix.js`:

```js
const cheerio = require('cheerio');
const { createPolite } = require('../lib/http');

const http = createPolite();

function parseLira(text) {
  if (!text) return null;
  const cleaned = text.replace(/\./g, '').replace(/[^\d]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function parsePrice(html) {
  const $ = cheerio.load(html);
  let cheapest = null;

  $('.ticket-row').each((_, row) => {
    const $row = $(row);
    const availabilityText = $row.find('.availability').text().trim().toLowerCase();
    const isAvailable = availabilityText.includes('mevcut');
    if (!isAvailable) return;

    const amount = parseLira($row.find('.price-amount').text());
    const category = $row.attr('data-category') || null;
    if (amount !== null && (cheapest === null || amount < cheapest.amount)) {
      cheapest = { amount, available: true, category, status: 'ok' };
    }
  });

  if (cheapest) return cheapest;
  return { amount: null, available: false, category: null, status: 'unavailable' };
}

function parseMetadata(html) {
  const $ = cheerio.load(html);
  return {
    name: $('meta[property="og:title"]').attr('content') || null,
    image_url: $('meta[property="og:image"]').attr('content') || null,
    venue: $('.event-venue').text().trim() || null,
    date_text: $('.event-date').text().trim() || null,
  };
}

async function collect({ url }) {
  if (!url) return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
  try {
    const res = await http.get(url);
    const price = parsePrice(res.data);
    return { ...price, raw_url: url };
  } catch (err) {
    const status = err.response?.status === 403 || err.response?.status === 429 ? 'blocked' : 'unavailable';
    return { status, amount: null, available: false, category: null, raw_url: url, error: err.message };
  }
}

async function fetchMetadata(url) {
  if (!url) return null;
  const res = await http.get(url);
  return parseMetadata(res.data);
}

module.exports = { collect, fetchMetadata, parsePrice, parseMetadata };
```

- [ ] **Step 5: Run test — should pass**

Run: `npx jest scrape/collectors/__tests__/biletix.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add scrape/collectors/biletix.js scrape/collectors/__tests__/biletix.test.js scrape/collectors/__tests__/fixtures/biletix-event.html
git commit -m "feat(scrape): add Biletix collector with parser tests"
```

---

## Task 6: Passo collector

**Files:**
- Create: `scrape/collectors/passo.js`
- Create: `scrape/collectors/__tests__/passo.test.js`
- Create: `scrape/collectors/__tests__/fixtures/passo-event.html`

- [ ] **Step 1: Create the Passo HTML fixture**

Create `scrape/collectors/__tests__/fixtures/passo-event.html`:

```html
<!doctype html>
<html>
<head><title>Galatasaray vs Fenerbahçe — Passo</title></head>
<body>
  <div class="match-tickets">
    <div class="ticket-option">
      <span class="kategori">Maratoncu</span>
      <span class="fiyat">890 ₺</span>
      <button class="satin-al">Satın Al</button>
    </div>
    <div class="ticket-option">
      <span class="kategori">VIP</span>
      <span class="fiyat">3.500 ₺</span>
      <span class="tukendi">Tükendi</span>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

Create `scrape/collectors/__tests__/passo.test.js`:

```js
const fs = require('fs');
const path = require('path');
const { parsePrice } = require('../passo');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures/passo-event.html'),
  'utf8'
);

describe('passo collector', () => {
  test('parsePrice picks cheapest available option', () => {
    const result = parsePrice(fixture);
    expect(result).toEqual({
      amount: 890,
      available: true,
      category: 'Maratoncu',
      status: 'ok',
    });
  });
});
```

- [ ] **Step 3: Run test — should fail**

Run: `npx jest scrape/collectors/__tests__/passo.test.js`
Expected: FAIL with "Cannot find module '../passo'".

- [ ] **Step 4: Implement the collector**

Create `scrape/collectors/passo.js`:

```js
const cheerio = require('cheerio');
const { createPolite } = require('../lib/http');

const http = createPolite();

function parseLira(text) {
  if (!text) return null;
  const cleaned = text.replace(/\./g, '').replace(/[^\d]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function parsePrice(html) {
  const $ = cheerio.load(html);
  let cheapest = null;

  $('.ticket-option').each((_, el) => {
    const $el = $(el);
    const isSoldOut = $el.find('.tukendi').length > 0;
    if (isSoldOut) return;

    const hasBuyBtn = $el.find('.satin-al').length > 0;
    if (!hasBuyBtn) return;

    const amount = parseLira($el.find('.fiyat').text());
    const category = $el.find('.kategori').text().trim() || null;
    if (amount !== null && (cheapest === null || amount < cheapest.amount)) {
      cheapest = { amount, available: true, category, status: 'ok' };
    }
  });

  if (cheapest) return cheapest;
  return { amount: null, available: false, category: null, status: 'unavailable' };
}

async function collect({ url }) {
  if (!url) return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
  try {
    const res = await http.get(url);
    const price = parsePrice(res.data);
    return { ...price, raw_url: url };
  } catch (err) {
    const code = err.response?.status;
    const status = code === 403 || code === 429 ? 'blocked' : 'unavailable';
    return { status, amount: null, available: false, category: null, raw_url: url, error: err.message };
  }
}

module.exports = { collect, parsePrice };
```

- [ ] **Step 5: Run test — should pass**

Run: `npx jest scrape/collectors/__tests__/passo.test.js`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add scrape/collectors/passo.js scrape/collectors/__tests__/passo.test.js scrape/collectors/__tests__/fixtures/passo-event.html
git commit -m "feat(scrape): add Passo collector with parser test"
```

---

## Task 7: Eventbrite collector

**Files:**
- Create: `scrape/collectors/eventbrite.js`
- Create: `scrape/collectors/__tests__/eventbrite.test.js`
- Create: `scrape/collectors/__tests__/fixtures/eventbrite-response.json`

API docs (for reference): https://www.eventbrite.com/platform/api

- [ ] **Step 1: Create fixture API response**

Create `scrape/collectors/__tests__/fixtures/eventbrite-response.json`:

```json
{
  "id": "evt-12345",
  "name": { "text": "Sezen Aksu Concert" },
  "url": "https://www.eventbrite.com/e/sezen-aksu-12345",
  "ticket_classes": [
    { "name": "General",        "cost": { "value": 132000, "currency": "TRY" }, "on_sale_status": "AVAILABLE" },
    { "name": "VIP",            "cost": { "value": 250000, "currency": "TRY" }, "on_sale_status": "SOLD_OUT" },
    { "name": "Front Row",      "cost": { "value": 200000, "currency": "TRY" }, "on_sale_status": "AVAILABLE" }
  ]
}
```

(Eventbrite API returns prices in cents — 132000 = 1320 TL.)

- [ ] **Step 2: Write the failing test**

Create `scrape/collectors/__tests__/eventbrite.test.js`:

```js
const fs = require('fs');
const path = require('path');
const { pickCheapest } = require('../eventbrite');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/eventbrite-response.json'),
  'utf8'
));

describe('eventbrite collector', () => {
  test('pickCheapest returns lowest available ticket in lira', () => {
    const result = pickCheapest(fixture);
    expect(result).toEqual({
      amount: 1320,
      available: true,
      category: 'General',
      status: 'ok',
    });
  });

  test('pickCheapest returns unavailable when all sold out', () => {
    const allSoldOut = {
      ticket_classes: [
        { name: 'A', cost: { value: 1000, currency: 'TRY' }, on_sale_status: 'SOLD_OUT' },
      ],
    };
    expect(pickCheapest(allSoldOut)).toEqual({
      amount: null, available: false, category: null, status: 'unavailable',
    });
  });
});
```

- [ ] **Step 3: Run test — should fail**

Run: `npx jest scrape/collectors/__tests__/eventbrite.test.js`
Expected: FAIL with "Cannot find module '../eventbrite'".

- [ ] **Step 4: Implement collector**

Create `scrape/collectors/eventbrite.js`:

```js
const axios = require('axios');

const API_BASE = 'https://www.eventbriteapi.com/v3';

function pickCheapest(eventResponse) {
  const classes = eventResponse?.ticket_classes || [];
  let cheapest = null;
  for (const tc of classes) {
    if (tc.on_sale_status !== 'AVAILABLE') continue;
    if (!tc.cost) continue;
    const lira = Math.round(tc.cost.value / 100);
    if (cheapest === null || lira < cheapest.amount) {
      cheapest = { amount: lira, available: true, category: tc.name || null, status: 'ok' };
    }
  }
  if (cheapest) return cheapest;
  return { amount: null, available: false, category: null, status: 'unavailable' };
}

async function collect({ apiId, eventName }) {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!apiId) {
    return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
  }
  if (!token) {
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: null, error: 'EVENTBRITE_TOKEN not set' };
  }
  try {
    const res = await axios.get(`${API_BASE}/events/${apiId}/`, {
      params: { expand: 'ticket_classes' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
    const price = pickCheapest(res.data);
    return { ...price, raw_url: res.data.url || null };
  } catch (err) {
    const code = err.response?.status;
    if (code === 404) return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: null, error: err.message };
  }
}

module.exports = { collect, pickCheapest };
```

- [ ] **Step 5: Run test — should pass**

Run: `npx jest scrape/collectors/__tests__/eventbrite.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add scrape/collectors/eventbrite.js scrape/collectors/__tests__/eventbrite.test.js scrape/collectors/__tests__/fixtures/eventbrite-response.json
git commit -m "feat(scrape): add Eventbrite API collector"
```

---

## Task 8: Ticketmaster collector

**Files:**
- Create: `scrape/collectors/ticketmaster.js`
- Create: `scrape/collectors/__tests__/ticketmaster.test.js`
- Create: `scrape/collectors/__tests__/fixtures/ticketmaster-response.json`

API docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/

- [ ] **Step 1: Create fixture API response**

Create `scrape/collectors/__tests__/fixtures/ticketmaster-response.json`:

```json
{
  "id": "K8vZ9171Sa7",
  "name": "Hamlet",
  "url": "https://www.ticketmaster.com/event/K8vZ9171Sa7",
  "priceRanges": [
    { "type": "standard", "currency": "TRY", "min": 270, "max": 580 }
  ],
  "dates": {
    "status": { "code": "onsale" }
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `scrape/collectors/__tests__/ticketmaster.test.js`:

```js
const fs = require('fs');
const path = require('path');
const { extractPrice } = require('../ticketmaster');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/ticketmaster-response.json'),
  'utf8'
));

describe('ticketmaster collector', () => {
  test('extractPrice returns min of priceRanges when on sale', () => {
    const result = extractPrice(fixture);
    expect(result).toEqual({
      amount: 270,
      available: true,
      category: 'standard',
      status: 'ok',
    });
  });

  test('extractPrice marks offsale events as unavailable', () => {
    const offSale = {
      ...fixture,
      dates: { status: { code: 'offsale' } },
    };
    expect(extractPrice(offSale)).toEqual({
      amount: null, available: false, category: null, status: 'unavailable',
    });
  });

  test('extractPrice returns unavailable when no priceRanges', () => {
    expect(extractPrice({ dates: { status: { code: 'onsale' } } })).toEqual({
      amount: null, available: false, category: null, status: 'unavailable',
    });
  });
});
```

- [ ] **Step 3: Run test — should fail**

Run: `npx jest scrape/collectors/__tests__/ticketmaster.test.js`
Expected: FAIL with "Cannot find module '../ticketmaster'".

- [ ] **Step 4: Implement collector**

Create `scrape/collectors/ticketmaster.js`:

```js
const axios = require('axios');

const API_BASE = 'https://app.ticketmaster.com/discovery/v2';

function extractPrice(eventResponse) {
  const onSale = eventResponse?.dates?.status?.code === 'onsale';
  const ranges = eventResponse?.priceRanges || [];
  if (!onSale || ranges.length === 0) {
    return { amount: null, available: false, category: null, status: 'unavailable' };
  }
  const min = Math.min(...ranges.map(r => r.min).filter(n => Number.isFinite(n)));
  if (!Number.isFinite(min)) {
    return { amount: null, available: false, category: null, status: 'unavailable' };
  }
  return {
    amount: Math.round(min),
    available: true,
    category: ranges[0].type || null,
    status: 'ok',
  };
}

async function collect({ apiId }) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiId) {
    return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
  }
  if (!apiKey) {
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: null, error: 'TICKETMASTER_API_KEY not set' };
  }
  try {
    const res = await axios.get(`${API_BASE}/events/${apiId}.json`, {
      params: { apikey: apiKey },
      timeout: 15_000,
    });
    const price = extractPrice(res.data);
    return { ...price, raw_url: res.data.url || null };
  } catch (err) {
    const code = err.response?.status;
    if (code === 404) return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: null, error: err.message };
  }
}

module.exports = { collect, extractPrice };
```

- [ ] **Step 5: Run test — should pass**

Run: `npx jest scrape/collectors/__tests__/ticketmaster.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add scrape/collectors/ticketmaster.js scrape/collectors/__tests__/ticketmaster.test.js scrape/collectors/__tests__/fixtures/ticketmaster-response.json
git commit -m "feat(scrape): add Ticketmaster Discovery API collector"
```

---

## Task 9: Ingest endpoint

**Files:**
- Create: `api/lib/routes/ingest.js`
- Modify: `api/index.js`

- [ ] **Step 1: Create the ingest router**

Create `api/lib/routes/ingest.js`:

```js
const express = require('express');
const { sql } = require('../db');
const { verifySignature } = require('../sign');

const router = express.Router();

function requireSignature(req, res, next) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return res.status(503).json({ success: false, error: 'INGEST_SECRET not configured' });
  }
  const signature = req.headers['x-signature'];
  if (!signature) {
    return res.status(401).json({ success: false, error: 'Missing X-Signature header' });
  }
  if (!verifySignature(req.body, signature, secret)) {
    return res.status(401).json({ success: false, error: 'Invalid signature' });
  }
  next();
}

// POST /api/scrape/ingest
router.post('/ingest', requireSignature, async (req, res) => {
  const { internal_name, results } = req.body;
  if (!internal_name || !Array.isArray(results)) {
    return res.status(400).json({ success: false, error: 'internal_name and results[] required' });
  }

  const [event] = await sql('SELECT id FROM events WHERE internal_name = $1', [internal_name]);
  if (!event) {
    return res.status(404).json({ success: false, error: `Unknown internal_name: ${internal_name}` });
  }

  const now = new Date().toISOString();
  let snapshotsWritten = 0;

  for (const r of results) {
    if (!r.platform_id) continue;

    // Update last_status on the link (link must exist; create if missing)
    await sql(
      `INSERT INTO event_platform_links (event_id, platform_id, external_url, platform_event_id, last_status, last_status_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id, platform_id) DO UPDATE
         SET external_url     = COALESCE(EXCLUDED.external_url, event_platform_links.external_url),
             platform_event_id = COALESCE(EXCLUDED.platform_event_id, event_platform_links.platform_event_id),
             last_status       = EXCLUDED.last_status,
             last_status_at    = EXCLUDED.last_status_at`,
      [event.id, r.platform_id, r.url || null, r.platform_event_id || null, r.status, now]
    );

    if (r.status === 'ok' && Number.isFinite(r.amount)) {
      await sql(
        `INSERT INTO price_snapshots (event_id, platform_id, price, available, scraped_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [event.id, r.platform_id, r.amount, r.available !== false, now]
      );
      snapshotsWritten++;
    }
  }

  await sql(
    `INSERT INTO scrape_log (event_id, status, message, finished_at)
     VALUES ($1, $2, $3, $4)`,
    [event.id, 'ok', `${snapshotsWritten}/${results.length} snapshots`, now]
  );

  res.json({ success: true, snapshotsWritten });
});

// POST /api/scrape/enrich-metadata
router.post('/enrich-metadata', requireSignature, async (req, res) => {
  const { internal_name, name, image_url, venue, date_text } = req.body;
  if (!internal_name) {
    return res.status(400).json({ success: false, error: 'internal_name required' });
  }
  await sql(
    `UPDATE events
       SET name             = COALESCE($2, name),
           image_url        = COALESCE($3, image_url),
           venue            = COALESCE($4, venue),
           date             = COALESCE($5, date),
           last_enriched_at = NOW(),
           updated_at       = NOW()
     WHERE internal_name = $1`,
    [internal_name, name || null, image_url || null, venue || null, date_text || null]
  );
  res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 2: Mount the router in api/index.js**

In `api/index.js`, replace the line:
```js
app.use('/api/scrape',    require('./lib/routes/admin'));
```
with:
```js
app.use('/api/scrape',    require('./lib/routes/ingest'));
```

- [ ] **Step 3: Commit and push (Vercel will auto-deploy)**

```bash
git add api/lib/routes/ingest.js api/index.js
git commit -m "feat(api): add HMAC-signed scrape ingest and enrich-metadata endpoints"
git push origin master
```

- [ ] **Step 4: Smoke test the endpoint**

After Vercel deploys, run from local:
```bash
curl -X POST https://bizden-demesi.vercel.app/api/scrape/ingest \
  -H "Content-Type: application/json" \
  -H "X-Signature: deadbeef" \
  -d '{"internal_name":"test","results":[]}'
```
Expected: `{"success":false,"error":"Invalid signature"}` (or 503 until INGEST_SECRET is set — see Task 12).

---

## Task 10: Run script (entry point)

**Files:**
- Create: `scrape/run.js`

- [ ] **Step 1: Implement the orchestrator**

Create `scrape/run.js`:

```js
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const axios = require('axios');

const { signPayload } = require('./lib/sign');
const biletix      = require('./collectors/biletix');
const passo        = require('./collectors/passo');
const eventbrite   = require('./collectors/eventbrite');
const ticketmaster = require('./collectors/ticketmaster');

const COLLECTORS = [
  { id: 'biletix',      mod: biletix,      key: 'biletix_url',      type: 'url' },
  { id: 'passo',        mod: passo,        key: 'passo_url',        type: 'url' },
  { id: 'eventbrite',   mod: eventbrite,   key: 'eventbrite_id',    type: 'apiId' },
  { id: 'ticketmaster', mod: ticketmaster, key: 'ticketmaster_id',  type: 'apiId' },
];

async function collectOne(event) {
  const tasks = COLLECTORS.map(async ({ id, mod, key, type }) => {
    const value = event[key];
    const arg = type === 'url' ? { url: value, eventName: event.internal_name }
                               : { apiId: value, eventName: event.internal_name };
    const result = await mod.collect(arg);
    return { platform_id: id, ...result };
  });
  return Promise.all(tasks);
}

async function ingest(internalName, results, opts) {
  const payload = { internal_name: internalName, results };
  const signature = signPayload(payload, opts.secret);
  await axios.post(`${opts.appUrl}/api/scrape/ingest`, payload, {
    headers: { 'X-Signature': signature, 'Content-Type': 'application/json' },
    timeout: 15_000,
  });
}

async function enrichOnce(event, opts) {
  if (!event.biletix_url) return;
  try {
    const meta = await biletix.fetchMetadata(event.biletix_url);
    if (!meta) return;
    const payload = { internal_name: event.internal_name, ...meta };
    const signature = signPayload(payload, opts.secret);
    await axios.post(`${opts.appUrl}/api/scrape/enrich-metadata`, payload, {
      headers: { 'X-Signature': signature, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.warn(`[enrich] ${event.internal_name}: ${err.message}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const enrich = process.argv.includes('--enrich');
  const appUrl = process.env.APP_URL;
  const secret = process.env.INGEST_SECRET;

  if (!dryRun && (!appUrl || !secret)) {
    console.error('APP_URL and INGEST_SECRET env vars required (or pass --dry-run)');
    process.exit(1);
  }

  const events = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'events-to-track.json'), 'utf8')
  );
  console.log(`[scrape] ${events.length} events to process`);

  let okCount = 0, errCount = 0;
  for (const event of events) {
    try {
      if (enrich) await enrichOnce(event, { appUrl, secret });
      const results = await collectOne(event);
      console.log(`[scrape] ${event.internal_name}:`,
        results.map(r => `${r.platform_id}=${r.status}${r.amount ? `(${r.amount})` : ''}`).join(', '));
      if (!dryRun) await ingest(event.internal_name, results, { appUrl, secret });
      okCount++;
    } catch (err) {
      console.error(`[scrape] ${event.internal_name}: ${err.message}`);
      errCount++;
    }
  }

  console.log(`[scrape] done: ${okCount} ok, ${errCount} failed`);
  if (errCount > 0 && errCount === events.length) process.exit(1);
}

main().catch(err => {
  console.error('[scrape] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Test locally with dry-run (uses placeholder events.json from next task — defer if needed)**

Skip this verification until Task 11 is done; run there instead.

- [ ] **Step 3: Commit**

```bash
git add scrape/run.js
git commit -m "feat(scrape): add run.js orchestrator entry point"
```

---

## Task 11: Initial event list

**Files:**
- Create: `events-to-track.json`

- [ ] **Step 1: Create starter event list**

The user will need to provide real Biletix/Passo URLs. Until they do, use placeholders. Create `events-to-track.json` at repo root:

```json
[
  {
    "internal_name": "PLACEHOLDER-event-1",
    "biletix_url": null,
    "passo_url": null,
    "eventbrite_id": null,
    "ticketmaster_id": null
  }
]
```

(After the implementation is in place, ASK THE USER for 3-5 real Biletix event URLs to populate this file.)

- [ ] **Step 2: Commit**

```bash
git add events-to-track.json
git commit -m "feat(scrape): add events-to-track.json with placeholder entry"
```

---

## Task 12: GitHub Actions workflow update

**Files:**
- Modify: `.github/workflows/scrape.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update scrape workflow to run scrape/run.js**

Replace contents of `.github/workflows/scrape.yml`:

```yaml
name: Scrape Prices

on:
  schedule:
    - cron: '0 */4 * * *'
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run scraper
        env:
          APP_URL:               ${{ secrets.APP_URL }}
          INGEST_SECRET:         ${{ secrets.INGEST_SECRET }}
          EVENTBRITE_TOKEN:      ${{ secrets.EVENTBRITE_TOKEN }}
          TICKETMASTER_API_KEY:  ${{ secrets.TICKETMASTER_API_KEY }}
        run: node scrape/run.js
```

- [ ] **Step 2: Add npm test step to ci.yml**

In `.github/workflows/ci.yml`, add a job (or update the existing `backend` job) to run `npm test`. Look at current contents of `ci.yml` first; add this step where appropriate:

```yaml
      - name: Run tests
        run: npm test
```

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/scrape.yml .github/workflows/ci.yml
git commit -m "ci: replace curl trigger with node scrape/run.js"
git push origin master
```

---

## Task 13: Set required secrets

These steps are MANUAL — the user must do them in dashboard UIs.

- [ ] **Step 1: Generate INGEST_SECRET**

Run locally to generate a strong random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output.

- [ ] **Step 2: Add INGEST_SECRET to Vercel**

Vercel dashboard → bizden-demesi project → Settings → Environment Variables → Add:
- Name: `INGEST_SECRET`
- Value: (paste from Step 1)
- Environments: Production, Preview, Development

Click Save. Then redeploy the latest deployment from the Deployments tab.

- [ ] **Step 3: Add INGEST_SECRET to GitHub Actions**

GitHub repo → Settings → Secrets and variables → Actions → New repository secret:
- Name: `INGEST_SECRET`
- Value: (same as Step 2)

- [ ] **Step 4: Get Eventbrite API token**

Sign up at https://www.eventbrite.com/account-settings/apps. Create a new app, copy the **Private Token**.

GitHub repo → Settings → Secrets → Actions → New repository secret:
- Name: `EVENTBRITE_TOKEN`
- Value: (paste)

- [ ] **Step 5: Get Ticketmaster API key**

Sign up at https://developer.ticketmaster.com/. Create a new app, copy the **Consumer Key**.

GitHub repo → Settings → Secrets → Actions → New repository secret:
- Name: `TICKETMASTER_API_KEY`
- Value: (paste)

- [ ] **Step 6: Verify APP_URL secret exists**

GitHub repo → Settings → Secrets → Actions. Confirm `APP_URL` is present (it was added in Phase 2). If not, add:
- Name: `APP_URL`
- Value: `https://bizden-demesi.vercel.app`

---

## Task 14: First end-to-end run with real data

This requires the user to provide real event URLs.

- [ ] **Step 1: Ask the user for 3-5 real Biletix event URLs**

Tell the user: "I need 3-5 real Biletix (and optionally Passo) event URLs to populate the curated list. Just paste them and I'll set up entries with `internal_name` slugs."

- [ ] **Step 2: Update events-to-track.json**

Replace placeholder with real entries. Example shape (user provides actual URLs):

```json
[
  {
    "internal_name": "real-event-1",
    "biletix_url": "https://www.biletix.com/event/...",
    "passo_url":   "https://www.passo.com.tr/...",
    "eventbrite_id":   null,
    "ticketmaster_id": null
  }
]
```

- [ ] **Step 3: Commit and push**

```bash
git add events-to-track.json
git commit -m "feat(scrape): add real event URLs to tracking list"
git push origin master
```

- [ ] **Step 4: Trigger workflow with metadata enrichment**

GitHub repo → Actions → "Scrape Prices" → Run workflow → leave branch as master → click Run.

Monitor the run in the Actions tab. The workflow runs `node scrape/run.js` which will:
1. POST `/api/scrape/enrich-metadata` for each event (populates name, venue, image from Biletix og: tags) — only if `--enrich` is in the args. **This task does NOT include --enrich** — see Step 6.
2. POST `/api/scrape/ingest` with the price snapshots.

(For first run only, we want enrichment.)

- [ ] **Step 5: Run with enrichment locally for first time**

To enrich event metadata on first run, run locally with the `--enrich` flag:

```bash
APP_URL=https://bizden-demesi.vercel.app \
INGEST_SECRET=<paste from Task 13 Step 1> \
EVENTBRITE_TOKEN=<your token> \
TICKETMASTER_API_KEY=<your key> \
node scrape/run.js --enrich
```

Expected output: per-event lines like
```
[scrape] real-event-1: biletix=ok(1250), passo=ok(1190), eventbrite=not_found, ticketmaster=not_found
```

- [ ] **Step 6: Verify in the frontend**

Open https://bizden-demesi.vercel.app — events should now have:
- Real titles, venues, images from Biletix
- Real prices in the price comparison table
- "fiyat alınamadı" badges where collectors failed

- [ ] **Step 7: Wipe old fake events**

Open Neon SQL editor and run:
```sql
DELETE FROM events WHERE internal_name IS NULL;
```
This removes the 8 placeholder events that have no `internal_name`. Real events keep theirs.

---

## Task 15: Cleanup old code

- [ ] **Step 1: Delete obsolete files**

```bash
git rm api/cron/scrape.js
git rm api/lib/scrapers.js
git rm api/lib/routes/admin.js
git rm -r backend/src/scrapers
```

- [ ] **Step 2: Remove the admin routes mount in api/index.js**

In `api/index.js`, ensure no line still imports `./lib/routes/admin`. The mount of `/api/scrape` should now point to `./lib/routes/ingest` only (already done in Task 9).

- [ ] **Step 3: Update vercel.json — remove cron section if still present**

Open `vercel.json` and verify there's no `crons` block. If there is, remove it.

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "chore: remove obsolete in-Vercel scraper files"
git push origin master
```

---

## Self-Review

**Spec coverage:** Walked through each section of the spec — architecture, components, schema changes, error handling, testing, secrets, migration plan. Each item maps to a task above.

**Placeholder scan:** No "TBD"/"TODO"/"figure out" markers. The one explicit placeholder is `events-to-track.json` (Task 11), which is intentionally a placeholder pending real URLs from the user — this is documented as Task 14 Step 1 ("Ask the user for 3-5 real Biletix event URLs").

**Type consistency:** All collectors return the same shape `{ amount, available, category, raw_url, status, error? }`. The ingest payload uses these same field names. The signing utility is identical between `scrape/lib/sign.js` and `api/lib/sign.js`.

**Notes about scope:**
- Frontend changes are minimal (no schema changes to existing event response — just additions). The frontend will pick up `last_updated` per platform that already exists. The "fiyat alınamadı" badge UI tweak is light frontend polish; if it doesn't already render on null amounts, that's an additional small task post-Phase 3.

**Risks acknowledged but not built upfront:**
- Real Biletix/Passo HTML may not match the placeholder fixture. After the first live run, parser selectors may need updates. Tasks 5–6 include the fixture-based test pattern so updating selectors is a TDD-style cycle (replace fixture, update parser).
- API rate limits on Eventbrite/Ticketmaster are not handled with exponential backoff — they're free tier limits and our 4h cadence is well below them.
