require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const axios = require('axios');

const { signPayload } = require('./lib/sign');
const biletix      = require('./collectors/biletix');
const passo        = require('./collectors/passo');
const eventbrite   = require('./collectors/eventbrite');
const ticketmaster = require('./collectors/ticketmaster');

// Cloud runner handles API-based platforms only.
// Biletix and Passo are SPA + auth-walled — handled by the desktop scraper in Phase 4.
const COLLECTORS = [
  { id: 'eventbrite',   mod: eventbrite,   key: 'eventbrite_id',   type: 'apiId' },
  { id: 'ticketmaster', mod: ticketmaster, key: 'ticketmaster_id', type: 'apiId' },
];

async function collectOne(event) {
  const tasks = COLLECTORS.map(async ({ id, mod, key, type }) => {
    const value = event[key];
    const arg = type === 'url'
      ? { url: value, eventName: event.internal_name }
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
  // Use whatever metadata is provided in the JSON entry directly — no scraping.
  const meta = {
    name: event.name || null,
    image_url: event.image_url || null,
    venue: event.venue || null,
    date_text: event.date || null,
  };
  if (!meta.name && !meta.image_url && !meta.venue) return;
  try {
    const payload = { internal_name: event.internal_name, ...meta };
    const signature = signPayload(payload, opts.secret);
    await axios.post(`${opts.appUrl}/api/scrape/enrich-metadata`, payload, {
      headers: { 'X-Signature': signature, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.warn(`[enrich] ${event.internal_name}: ${err.message}`);
  }
}

function normalizeUrl(raw) {
  if (!raw) return raw;
  let u = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipEnrich = process.argv.includes('--no-enrich');
  const appUrl = normalizeUrl(process.env.APP_URL);
  const secret = process.env.INGEST_SECRET;

  if (!dryRun && (!appUrl || !secret)) {
    console.error('APP_URL and INGEST_SECRET env vars required (or pass --dry-run)');
    process.exit(1);
  }
  console.log(`[scrape] target: ${appUrl}`);

  const events = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'events-to-track.json'), 'utf8')
  );
  console.log(`[scrape] ${events.length} events to process`);

  let okCount = 0, errCount = 0;
  for (const event of events) {
    try {
      if (!skipEnrich && !dryRun) await enrichOnce(event, { appUrl, secret });
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
