require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { launchBrowser } = require('./lib/browser');
const { signPayload } = require('./lib/sign');
const biletix = require('./collectors/biletix');
const bubilet = require('./collectors/bubilet');
const biletino = require('./collectors/biletino');
const mobilet = require('./collectors/mobilet');
const passo = require('./collectors/passo');

const COLLECTORS = [
  { id: 'biletix', key: 'biletix_url', mod: biletix },
  { id: 'bubilet', key: 'bubilet_url', mod: bubilet },
  { id: 'biletino', key: 'biletino_url', mod: biletino },
  { id: 'mobilet', key: 'mobilet_url', mod: mobilet },
  { id: 'passo', key: 'passo_url', mod: passo },
];

function normalizeUrl(raw) {
  if (!raw) return raw;
  let url = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

async function postSigned(pathname, payload, opts) {
  const signature = signPayload(payload, opts.secret);
  try {
    await axios.post(`${opts.appUrl}${pathname}`, payload, {
      headers: { 'X-Signature': signature, 'Content-Type': 'application/json' },
      timeout: 20_000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.response?.data?.message || err.message;
    throw new Error(status ? `${pathname} failed ${status}: ${detail}` : `${pathname} failed: ${detail}`);
  }
}

async function preflight(opts) {
  const payload = {
    internal_name: '__desktop_scraper_preflight__',
    name: 'Desktop scraper preflight',
    image_url: null,
    venue: null,
    date_text: null,
  };

  try {
    await postSigned('/api/scrape/enrich-metadata', payload, opts);
    return { ok: true };
  } catch (err) {
    if (/failed 503/i.test(err.message)) {
      throw new Error(`${err.message}. Check that INGEST_SECRET is configured on the deployed API with the same value as desktop-scraper/.env.`);
    }
    if (/failed 401/i.test(err.message)) {
      throw new Error(`${err.message}. Check that desktop-scraper/.env INGEST_SECRET matches the deployed API secret.`);
    }
    throw err;
  }
}

async function enrichOnce(event, opts) {
  const payload = {
    internal_name: event.internal_name,
    name: event.name || null,
    image_url: event.image_url || null,
    venue: event.venue || null,
    date_text: event.date || null,
  };
  await postSigned('/api/scrape/enrich-metadata', payload, opts);
}

async function captureFailure(page, eventName, platformId) {
  const dir = process.env.DESKTOP_SCRAPER_ARTIFACT_DIR || path.join(__dirname, 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${eventName}-${platformId}-${stamp}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

async function collectEvent(context, event) {
  const results = [];
  for (const collector of COLLECTORS) {
    const url = normalizeUrl(event[collector.key]);
    if (!url) continue;

    const page = await context.newPage();
    const result = await collector.mod.collect({ page, url, eventName: event.internal_name });
    if (result.status !== 'ok') {
      result.screenshot = await captureFailure(page, event.internal_name, collector.id);
    }
    results.push({ platform_id: collector.id, ...result });
    await page.close().catch(() => {});
  }
  return results;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const headed = process.argv.includes('--headed') || process.env.HEADED === '1';
  const onlyEvent = argValue('--event');
  const appUrl = normalizeUrl(process.env.APP_URL);
  const secret = process.env.INGEST_SECRET;

  if (!dryRun && (!appUrl || !secret)) {
    console.error('APP_URL and INGEST_SECRET env vars required (or pass --dry-run)');
    process.exit(1);
  }

  const trackerPath = path.join(__dirname, '..', 'events-to-track.json');
  const allEvents = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
  const events = allEvents
    .filter((event) => !onlyEvent || event.internal_name === onlyEvent)
    .filter((event) => event.biletix_url || event.bubilet_url || event.biletino_url || event.mobilet_url || event.passo_url);

  console.log(`[desktop-scraper] ${events.length} desktop events to process`);
  if (!events.length) return;

  if (!dryRun) {
    console.log('[desktop-scraper] API preflight');
    await preflight({ appUrl, secret });
  }

  const context = await launchBrowser({ headed });
  let okCount = 0;
  let errCount = 0;

  try {
    for (const event of events) {
      try {
        if (!dryRun) await enrichOnce(event, { appUrl, secret });
        const results = await collectEvent(context, event);
        console.log(`[desktop-scraper] ${event.internal_name}: ${results.map((r) => `${r.platform_id}=${r.status}${r.amount ? `(${r.amount})` : ''}`).join(', ')}`);

        if (!dryRun && results.length) {
          await postSigned('/api/scrape/ingest', { internal_name: event.internal_name, results }, { appUrl, secret });
        }
        okCount++;
      } catch (err) {
        console.error(`[desktop-scraper] ${event.internal_name}: ${err.message}`);
        errCount++;
      }
    }
  } finally {
    await context.close().catch(() => {});
  }

  console.log(`[desktop-scraper] done: ${okCount} ok, ${errCount} failed`);
  if (errCount > 0 && errCount === events.length) process.exit(1);
}

main().catch((err) => {
  console.error('[desktop-scraper] fatal:', err);
  process.exit(1);
});
