require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const EVENT_RE = /(?:(https?:\\?\/\\?\/(?:www\.)?eventbrite\.[a-z.]+))?\\?\/e\\?\/([^"'<>\\\s?]+?tickets-(\d{8,}))/gi;

const DEFAULT_DISCOVERY_URLS = [
  'https://www.eventbrite.com/d/turkey--all-locations/all-events/',
  'https://www.eventbrite.com/d/turkey/istanbul/',
  'https://www.eventbrite.com/d/turkey/antalya/',
  'https://www.eventbrite.com/d/turkey/conferences-in-turkey/',
  'https://www.eventbrite.com/d/turkey/music--events/',
  'https://www.eventbrite.com/d/turkey/sports-events-and-competitions/',
];

function argValue(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function titleFromSlug(slug) {
  const cleaned = String(slug || '')
    .replace(/-tickets-\d+$/, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeEventUrl(host, slug) {
  const cleanHost = (host || 'https://www.eventbrite.com').replace(/\\/g, '');
  return `${cleanHost}/e/${slug.replace(/\\+/g, '')}`;
}

function extractEvents(html, sourceUrl) {
  const found = new Map();
  let match;
  while ((match = EVENT_RE.exec(html)) !== null) {
    const host = match[1];
    const slug = match[2].replace(/\\\//g, '/').split('/').pop();
    const eventbriteId = match[3];
    if (!slug || !eventbriteId) continue;
    found.set(eventbriteId, {
      eventbrite_id: eventbriteId,
      internal_name: slugify(slug.replace(/-tickets-\d+$/, '')),
      name: titleFromSlug(slug),
      eventbrite_url: normalizeEventUrl(host, slug),
      discovery_source_url: sourceUrl,
    });
  }
  return [...found.values()];
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 20_000,
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  });
  return res.data;
}

async function fetchEventbriteMetadata(eventbriteId) {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) return null;

  try {
    const res = await axios.get(`https://www.eventbriteapi.com/v3/events/${eventbriteId}/`, {
      params: { expand: 'venue' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
    const event = res.data;
    return {
      name: event.name?.text || null,
      venue: event.venue?.name || null,
      date: event.start?.local || null,
      image_url: event.logo?.url || null,
      eventbrite_url: event.url || null,
    };
  } catch (err) {
    console.warn(`[discover:eventbrite] metadata ${eventbriteId}: ${err.message}`);
    return null;
  }
}

function loadTracked(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function mergeEvents(existing, discovered) {
  const byId = new Map();
  const byName = new Set(existing.map((event) => event.internal_name).filter(Boolean));

  for (const event of existing) {
    if (event.eventbrite_id) byId.set(event.eventbrite_id, event);
  }

  const added = [];
  for (const event of discovered) {
    const current = byId.get(event.eventbrite_id);
    if (current) {
      Object.assign(current, {
        eventbrite_url: current.eventbrite_url || event.eventbrite_url || null,
        discovery_source_url: current.discovery_source_url || event.discovery_source_url || null,
      });
      continue;
    }

    let internalName = event.internal_name || `eventbrite-${event.eventbrite_id}`;
    if (byName.has(internalName)) internalName = `${internalName}-${event.eventbrite_id}`;
    byName.add(internalName);

    const row = {
      internal_name: internalName,
      name: event.name || internalName,
      venue: event.venue || undefined,
      date: event.date || undefined,
      image_url: event.image_url || undefined,
      eventbrite_id: event.eventbrite_id,
      eventbrite_url: event.eventbrite_url || undefined,
      discovery_source_url: event.discovery_source_url || undefined,
    };
    Object.keys(row).forEach((key) => row[key] === undefined && delete row[key]);
    existing.push(row);
    added.push(row);
  }

  return { events: existing, added };
}

function pageUrls(baseUrls, pages) {
  const urls = [];
  for (const base of baseUrls) {
    for (let page = 1; page <= pages; page++) {
      const url = new URL(base);
      if (page > 1) url.searchParams.set('page', String(page));
      urls.push(url.toString());
    }
  }
  return urls;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pages = Number.parseInt(argValue('--pages', process.env.EVENTBRITE_DISCOVERY_PAGES || '1'), 10);
  const maxEvents = Number.parseInt(argValue('--max', process.env.EVENTBRITE_DISCOVERY_MAX || '50'), 10);
  const configuredUrls = splitCsv(argValue('--urls', process.env.EVENTBRITE_DISCOVERY_URLS || ''));
  const urls = pageUrls(configuredUrls.length ? configuredUrls : DEFAULT_DISCOVERY_URLS, Number.isFinite(pages) ? pages : 1);
  const trackerPath = path.join(__dirname, '..', 'events-to-track.json');

  const discoveredById = new Map();
  for (const url of urls) {
    try {
      console.log(`[discover:eventbrite] fetch ${url}`);
      const html = await fetchHtml(url);
      for (const event of extractEvents(html, url)) {
        if (!discoveredById.has(event.eventbrite_id)) discoveredById.set(event.eventbrite_id, event);
      }
    } catch (err) {
      console.warn(`[discover:eventbrite] ${url}: ${err.message}`);
    }
  }

  const discovered = [...discoveredById.values()].slice(0, Number.isFinite(maxEvents) ? maxEvents : 50);
  for (const event of discovered) {
    const metadata = await fetchEventbriteMetadata(event.eventbrite_id);
    if (metadata) Object.assign(event, Object.fromEntries(Object.entries(metadata).filter(([, value]) => value)));
  }

  const existing = loadTracked(trackerPath);
  const { events, added } = mergeEvents(existing, discovered);

  console.log(`[discover:eventbrite] discovered ${discovered.length}, added ${added.length}`);
  for (const event of added) {
    console.log(`  + ${event.internal_name} (${event.eventbrite_id})`);
  }

  if (!dryRun) {
    fs.writeFileSync(trackerPath, `${JSON.stringify(events, null, 2)}\n`);
    console.log(`[discover:eventbrite] wrote ${trackerPath}`);
  }
}

main().catch((err) => {
  console.error('[discover:eventbrite] fatal:', err);
  process.exit(1);
});
