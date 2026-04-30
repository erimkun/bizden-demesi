# BiletKarşılaştır — Faz 2 Geçiş Rehberi

## Faz 1 → Faz 2: Ne değişir?

### 1. `src/data/mockData.js` → Canlı API

```js
// Faz 1 (mock)
import { EVENTS } from '../data/mockData';

// Faz 2 (API)
export async function fetchEvents() {
  const res = await fetch('https://your-api.com/api/events');
  return res.json();
}
```

### 2. `src/hooks/usePriceData.js` — Scraper entegrasyonu

`simulatePriceUpdate()` yerine gerçek API çağrısı:

```js
const doFetch = useCallback(async () => {
  setStatus('fetching');
  try {
    const data = await fetch('https://your-api.com/api/prices/refresh');
    const events = await data.json();
    setEvents(events);
    setLastFetchTime(new Date());
    setStatus('updated');
  } catch (e) {
    setStatus('error');
  }
}, []);
```

### 3. Backend (Node.js) — Yeni servis

```
backend/
  src/
    scrapers/
      biletix.js      ← Cheerio veya Playwright ile fiyat çekimi
      passo.js
      eventbrite.js
      ticketmaster.js
    jobs/
      priceJob.js     ← node-cron ile her 4 saatte çalışır
    api/
      events.js       ← Express router
      prices.js
    db/
      schema.sql      ← events, price_snapshots tabloları
```

### 4. Veritabanı şeması (PostgreSQL)

```sql
CREATE TABLE events (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL,
  event_date TIMESTAMP,
  venue      TEXT,
  city       TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE price_snapshots (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER REFERENCES events(id),
  platform    TEXT NOT NULL,
  amount      NUMERIC,
  available   BOOLEAN DEFAULT TRUE,
  category    TEXT,
  ticket_url  TEXT,
  fetched_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_snapshots_event_platform
  ON price_snapshots(event_id, platform, fetched_at DESC);
```

### 5. Cron job (her 4 saatte)

```js
// backend/src/jobs/priceJob.js
import cron from 'node-cron';
import { scrapeAll } from '../scrapers/index.js';
import { saveSnapshots } from '../db/snapshots.js';

// Her 4 saatte bir: 0 0,4,8,12,16,20 * * *
cron.schedule('0 0,4,8,12,16,20 * * *', async () => {
  console.log('[PriceJob] Başlatıldı:', new Date().toISOString());
  const results = await scrapeAll();
  await saveSnapshots(results);
  console.log('[PriceJob] Tamamlandı');
});
```

### 6. Güvenlik

- Platform sitelerine scraping yaparken saygılı rate limit ekleyin
- `robots.txt` kontrolü yapın
- API key ile backend endpoint'leri koruyun
- CORS sadece kendi frontend domainine izin versin

---

## Tavsiye edilen araçlar

| Amaç        | Araç           |
|-------------|----------------|
| Scraping    | Playwright veya Cheerio |
| Backend     | Node.js + Express |
| Veritabanı  | Supabase (PostgreSQL) |
| Cron        | node-cron veya Supabase Edge Functions |
| Deploy      | Vercel (frontend) + Railway (backend) |
| Monitoring  | Uptime Robot |
