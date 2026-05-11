require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DEFAULT_DISCOVERY_URLS = [
  'https://www.bubilet.com.tr/istanbul',
  'https://www.bubilet.com.tr/ankara',
  'https://www.bubilet.com.tr/izmir',
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
    .slice(0, 90);
}

function cleanUrl(raw, base = 'https://www.bubilet.com.tr') {
  if (!raw) return null;
  const url = new URL(String(raw).replace(/&amp;/g, '&'), base);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function isValidBubiletEventUrl(url) {
  const value = String(url || '');
  if (!/^https:\/\/www\.bubilet\.com\.tr\/[^/]+\/etkinlik\/[a-z0-9-]+\/?$/i.test(value)) return false;
  return !/https:\/\/www\.bubilet\.com\.tr\/files\/etkinlik\//i.test(value);
}

async function dismissOverlays(page) {
  for (const label of ['Kabul ediyorum', 'Kabul', 'Tumunu Kabul Et', 'Accept', 'Tamam']) {
    const button = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 1_000 }).catch(() => {});
    }
  }
}

async function extractLinks(page) {
  return page.evaluate(() => {
    const fromAnchors = [...document.querySelectorAll('a[href]')].map((a) => ({
      href: a.href,
      text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
    }));

    const html = document.documentElement.innerHTML;
    const fromHtml = [...html.matchAll(/(?:https?:\\?\/\\?\/www\.bubilet\.com\.tr)?\\?\/[^"'<>\s]+/gi)]
      .map((match) => ({ href: match[0].replace(/\\/g, ''), text: '' }));

    return [...fromAnchors, ...fromHtml];
  });
}

function classifyLinks(links) {
  const events = new Map();

  for (const link of links) {
    const url = cleanUrl(link.href);
    if (!url || !/bubilet\.com\.tr/i.test(url)) continue;
    if (isValidBubiletEventUrl(url)) events.set(url, { url, text: link.text || null });
  }

  return { events: [...events.values()] };
}

async function visit(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForLoadState('networkidle', { timeout: 7_500 }).catch(() => {});
  await page.waitForTimeout(1_250);
  await dismissOverlays(page);
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 800;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 250);
    });
  }).catch(() => {});
  await page.waitForTimeout(1_000);
}

async function metadataForEvent(page, url, fallbackText) {
  await visit(page, url);
  const data = await page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || null;
    const title = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || null;
    const pageTitle = document.title || '';
    const bodyText = document.body?.innerText || '';
    const blocked = /sayfa bulunamad|not found|404/i.test(pageTitle + ' ' + bodyText);
    const dateMatch = document.body?.innerText?.match(/\b\d{1,2}\s+[A-Za-zCAGIOSUcaigosu]+\s+\d{4}/);
    return {
      blocked,
      name: title || document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null,
      image_url: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null,
      venue: text('[data-test="event-venue"], .event-venue, .venue, [class*="venue"], [class*="location"]'),
      date: dateMatch ? dateMatch[0] : null,
    };
  });

  if (data.blocked) return null;

  const code = slugify(url.split('/').slice(-1)[0] || url);
  return {
    internal_name: `bubilet-${slugify(data.name || fallbackText || code)}-${code}`,
    name: data.name || fallbackText || `Bubilet ${code}`,
    venue: data.venue || undefined,
    date: data.date || undefined,
    image_url: data.image_url || undefined,
    bubilet_url: url,
    discovery_source_url: page.url(),
  };
}

function mergeEvents(existing, discovered) {
  const byUrl = new Map(existing.filter((event) => event.bubilet_url).map((event) => [cleanUrl(event.bubilet_url), event]));
  const names = new Set(existing.map((event) => event.internal_name).filter(Boolean));
  const added = [];

  for (const event of discovered) {
    const url = cleanUrl(event.bubilet_url);
    if (!url) continue;

    const current = byUrl.get(url);
    if (current) {
      Object.assign(current, {
        name: current.name || event.name,
        venue: current.venue || event.venue,
        date: current.date || event.date,
        image_url: current.image_url || event.image_url,
        discovery_source_url: current.discovery_source_url || event.discovery_source_url,
      });
      continue;
    }

    let internalName = event.internal_name;
    if (names.has(internalName)) internalName = `${internalName}-${added.length + 1}`;
    names.add(internalName);

    const row = { ...event, internal_name: internalName, bubilet_url: url };
    Object.keys(row).forEach((key) => row[key] === undefined && delete row[key]);
    existing.push(row);
    added.push(row);
  }

  return { events: existing, added };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const maxEvents = Number.parseInt(argValue('--max', process.env.BUBILET_DISCOVERY_MAX || '20'), 10);
  const configuredUrls = splitCsv(argValue('--urls', process.env.BUBILET_DISCOVERY_URLS || ''));
  const seedUrls = configuredUrls.length ? configuredUrls : DEFAULT_DISCOVERY_URLS;
  const trackerPath = path.join(__dirname, '..', 'events-to-track.json');

  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  const page = await browser.newPage({ locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });

  const eventUrls = new Map();

  try {
    for (const url of seedUrls) {
      console.log(`[discover:bubilet] listing ${url}`);
      await visit(page, url).catch((err) => {
        console.warn(`[discover:bubilet] listing failed ${url}: ${err.message}`);
      });
      classifyLinks(await extractLinks(page)).events.forEach((item) => eventUrls.set(item.url, item));
    }

    const discovered = [];
    for (const item of [...eventUrls.values()].slice(0, maxEvents)) {
      console.log(`[discover:bubilet] event ${item.url}`);
      const row = await metadataForEvent(page, item.url, item.text);
      if (row) discovered.push(row);
    }

    const existing = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    const { events, added } = mergeEvents(existing, discovered);

    console.log(`[discover:bubilet] discovered ${discovered.length}, added ${added.length}`);
    for (const event of added) {
      console.log(`  + ${event.internal_name}`);
    }

    if (!dryRun) {
      fs.writeFileSync(trackerPath, `${JSON.stringify(events, null, 2)}\n`);
      console.log(`[discover:bubilet] wrote ${trackerPath}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[discover:bubilet] fatal:', err);
  process.exit(1);
});
