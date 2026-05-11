require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DEFAULT_DISCOVERY_URLS = [
  'https://www.passo.com.tr/tr/kategori/futbol-mac-biletleri/4615',
  'https://www.passo.com.tr/tr/kategori/muzik-konser-festival-biletleri/8615',
  'https://www.passo.com.tr/tr/kategori/performans-sanatlari-tiyatro-dans-standup-muzikal-bilet/11615',
  'https://www.passo.com.tr/tr/kategori/spor-basketbol-etkinlik-mac-biletleri/13615',
  'https://www.passo.com.tr/tr/kategori/muze-tarihi-mekan-saray-giris-biletleri/15615',
  'https://www.passo.com.tr/tr/kategori/diger-etkinlik-biletleri/12615',
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

function cleanUrl(raw, base = 'https://www.passo.com.tr') {
  if (!raw) return null;
  const url = new URL(String(raw).replace(/&amp;/g, '&'), base);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function isValidPassoEventUrl(url) {
  return /^https:\/\/www\.passo\.com\.tr\/tr\/(?:etkinlik|etkinlik-detay)\/[^/]+/i.test(String(url || ''));
}

async function dismissOverlays(page) {
  for (const label of ['Kabul', 'Tumunu Kabul Et', 'Accept', 'Accept All', 'Tamam']) {
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
    const fromHtml = [...html.matchAll(/(?:https?:\\?\/\\?\/www\.passo\.com\.tr)?\\?\/tr\\?\/(?:etkinlik|etkinlik-detay)\\?\/[^"'<>\s]+/gi)]
      .map((match) => ({ href: match[0].replace(/\\/g, ''), text: '' }));

    return [...fromAnchors, ...fromHtml];
  });
}

function classifyLinks(links) {
  const events = new Map();

  for (const link of links) {
    const url = cleanUrl(link.href);
    if (!url || !/passo\.com\.tr/i.test(url)) continue;
    if (isValidPassoEventUrl(url)) events.set(url, { url, text: link.text || null });
  }

  return { events: [...events.values()] };
}

async function visit(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForLoadState('networkidle', { timeout: 7_500 }).catch(() => {});
  await page.waitForTimeout(1_000);
  await dismissOverlays(page);
}

async function metadataForEvent(page, url, fallbackText) {
  await visit(page, url);
  const data = await page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || null;
    const pageTitle = document.title || '';
    const bodyText = document.body?.innerText || '';
    const blocked = /turnstile|cloudflare|access denied|bot protection/i.test(pageTitle + ' ' + bodyText);
    const dateMatch = bodyText.match(/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}(?:\s*-\s*\d{1,2}\s+[A-Za-z]+\s+\d{4})?/);
    return {
      blocked,
      name: title || document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null,
      image_url: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null,
      venue: document.querySelector('[class*="venue"], [class*="location"], [class*="place"]')?.textContent?.replace(/\s+/g, ' ').trim() || null,
      date: dateMatch ? dateMatch[0] : null,
    };
  });

  if (data.blocked) return null;

  const code = slugify(url.split('/').filter(Boolean).slice(-1)[0] || url);
  return {
    internal_name: `passo-${slugify(data.name || fallbackText || code)}-${code}`,
    name: data.name || fallbackText || `Passo ${code}`,
    venue: data.venue || undefined,
    date: data.date || undefined,
    image_url: data.image_url || undefined,
    passo_url: url,
    discovery_source_url: page.url(),
  };
}

function mergeEvents(existing, discovered) {
  const byUrl = new Map(existing.filter((event) => event.passo_url).map((event) => [cleanUrl(event.passo_url), event]));
  const names = new Set(existing.map((event) => event.internal_name).filter(Boolean));
  const added = [];

  for (const event of discovered) {
    const url = cleanUrl(event.passo_url);
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

    const row = { ...event, internal_name: internalName, passo_url: url };
    Object.keys(row).forEach((key) => row[key] === undefined && delete row[key]);
    existing.push(row);
    added.push(row);
  }

  return { events: existing, added };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const maxEvents = Number.parseInt(argValue('--max', process.env.PASSO_DISCOVERY_MAX || '15'), 10);
  const configuredUrls = splitCsv(argValue('--urls', process.env.PASSO_DISCOVERY_URLS || ''));
  const seedUrls = configuredUrls.length ? configuredUrls : DEFAULT_DISCOVERY_URLS;
  const trackerPath = path.join(__dirname, '..', 'events-to-track.json');

  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  const page = await browser.newPage({ locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });

  const eventUrls = new Map();

  try {
    for (const url of seedUrls) {
      console.log(`[discover:passo] listing ${url}`);
      await visit(page, url).catch((err) => {
        console.warn(`[discover:passo] listing failed ${url}: ${err.message}`);
      });
      classifyLinks(await extractLinks(page)).events.forEach((item) => eventUrls.set(item.url, item));
    }

    const discovered = [];
    for (const item of [...eventUrls.values()].slice(0, maxEvents)) {
      console.log(`[discover:passo] event ${item.url}`);
      const row = await metadataForEvent(page, item.url, item.text);
      if (row) discovered.push(row);
    }

    const existing = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    const { events, added } = mergeEvents(existing, discovered);

    console.log(`[discover:passo] discovered ${discovered.length}, added ${added.length}`);
    for (const event of added) {
      console.log(`  + ${event.internal_name}`);
    }

    if (!dryRun) {
      fs.writeFileSync(trackerPath, `${JSON.stringify(events, null, 2)}\n`);
      console.log(`[discover:passo] wrote ${trackerPath}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[discover:passo] fatal:', err);
  process.exit(1);
});
