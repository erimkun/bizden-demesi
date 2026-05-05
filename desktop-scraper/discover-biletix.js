require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DEFAULT_DISCOVERY_URLS = [
  'https://www.biletix.com/category/MUSIC/TURKIYE/tr',
  'https://www.biletix.com/category/ART/TURKIYE/tr',
  'https://www.biletix.com/category/SPORT/TURKIYE/tr',
  'https://www.biletix.com/category/FAMILY/TURKIYE/tr',
  'https://www.biletix.com/category/OTHER/TURKIYE/tr',
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

function cleanUrl(raw, base = 'https://www.biletix.com') {
  if (!raw) return null;
  const url = new URL(String(raw).replace(/&amp;/g, '&'), base);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function isValidBiletixPerformanceUrl(url) {
  return /^https:\/\/www\.biletix\.com\/performance\/[A-Z0-9]{4,8}\/[0-9]{3}\/TURKIYE\/tr$/i.test(String(url || ''));
}

function isValidBiletixEventUrl(url) {
  return /^https:\/\/www\.biletix\.com\/etkinlik\/[A-Z0-9]{4,8}\/TURKIYE\/tr$/i.test(String(url || ''));
}

function isValidBiletixGroupUrl(url) {
  return /^https:\/\/www\.biletix\.com\/etkinlik-grup\/[0-9]{2,12}\/TURKIYE\/tr(?:\/[a-z0-9-]+)?$/i.test(String(url || ''));
}

function codeFromUrl(url) {
  const perf = String(url).match(/\/performance\/([^/]+)\/([^/]+)\//i);
  if (perf) return `${perf[1]}-${perf[2]}`.toLowerCase();
  const event = String(url).match(/\/etkinlik\/([^/]+)\//i);
  if (event) return event[1].toLowerCase();
  const group = String(url).match(/\/etkinlik-grup\/([^/]+)\//i);
  if (group) return group[1].toLowerCase();
  return slugify(url);
}

async function dismissOverlays(page) {
  for (const label of ['Kabul ediyorum', 'Kabul', 'Tümünü Kabul Et', 'Accept', 'Tamam']) {
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
    const fromHtml = [...html.matchAll(/(?:https?:\\?\/\\?\/(?:www\.)?biletix\.com)?\\?\/(?:performance|etkinlik|etkinlik-grup)\\?\/[^"'<>\\s]+/gi)]
      .map((match) => ({ href: match[0].replace(/\\/g, ''), text: '' }));

    return [...fromAnchors, ...fromHtml];
  });
}

function classifyLinks(links) {
  const groups = new Map();
  const events = new Map();
  const performances = new Map();

  for (const link of links) {
    const url = cleanUrl(link.href);
    if (!url || !/biletix\.com/i.test(url)) continue;
    const item = { url, text: link.text || null };
    if (/\/performance\//i.test(url) && isValidBiletixPerformanceUrl(url)) performances.set(url, item);
    else if (/\/etkinlik\//i.test(url) && isValidBiletixEventUrl(url)) events.set(url, item);
    else if (/\/etkinlik-grup\//i.test(url) && isValidBiletixGroupUrl(url)) groups.set(url, item);
  }

  return {
    groups: [...groups.values()],
    events: [...events.values()],
    performances: [...performances.values()],
  };
}

async function visit(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await page.waitForLoadState('networkidle', { timeout: 7_500 }).catch(() => {});
  await page.waitForTimeout(750);
  await dismissOverlays(page);
}

async function metadataForPerformance(page, url, fallbackText) {
  await visit(page, url);
  const data = await page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || null;
    const title = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || null;
    const body = document.body?.innerText || '';
    const dateMatch = body.match(/\b\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4}(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü]+)?(?:\s*•?\s*\d{1,2}:\d{2})?/);
    return {
      name: title || text('meta[property="og:title"]'),
      image_url: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null,
      venue: text('a[href*="/mekan/"]') || null,
      date: dateMatch ? dateMatch[0] : null,
    };
  });

  const code = codeFromUrl(url);
  return {
    internal_name: `biletix-${slugify(data.name || fallbackText || code)}-${code}`,
    name: data.name || fallbackText || `Biletix ${code}`,
    venue: data.venue || undefined,
    date: data.date || undefined,
    image_url: data.image_url || undefined,
    biletix_url: url,
    discovery_source_url: page.url(),
  };
}

function mergeEvents(existing, discovered) {
  const byUrl = new Map(existing.filter((event) => event.biletix_url).map((event) => [cleanUrl(event.biletix_url), event]));
  const names = new Set(existing.map((event) => event.internal_name).filter(Boolean));
  const added = [];

  for (const event of discovered) {
    const url = cleanUrl(event.biletix_url);
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

    const row = { ...event, internal_name: internalName, biletix_url: url };
    Object.keys(row).forEach((key) => row[key] === undefined && delete row[key]);
    existing.push(row);
    added.push(row);
  }

  return { events: existing, added };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const maxPerformances = Number.parseInt(argValue('--max', process.env.BILETIX_DISCOVERY_MAX || '25'), 10);
  const resolveLimit = Number.parseInt(argValue('--resolve-limit', process.env.BILETIX_DISCOVERY_RESOLVE_LIMIT || '40'), 10);
  const configuredUrls = splitCsv(argValue('--urls', process.env.BILETIX_DISCOVERY_URLS || ''));
  const seedUrls = configuredUrls.length ? configuredUrls : DEFAULT_DISCOVERY_URLS;
  const trackerPath = path.join(__dirname, '..', 'events-to-track.json');

  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  const page = await browser.newPage({ locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });

  const groupUrls = new Map();
  const eventUrls = new Map();
  const performanceUrls = new Map();

  try {
    for (const url of seedUrls) {
      console.log(`[discover:biletix] listing ${url}`);
      await visit(page, url).catch((err) => {
        console.warn(`[discover:biletix] listing failed ${url}: ${err.message}`);
      });
      const links = classifyLinks(await extractLinks(page));
      links.groups.forEach((item) => groupUrls.set(item.url, item));
      links.events.forEach((item) => eventUrls.set(item.url, item));
      links.performances.forEach((item) => performanceUrls.set(item.url, item));
    }

    for (const group of [...groupUrls.values()].slice(0, resolveLimit)) {
      if (performanceUrls.size >= maxPerformances) break;
      console.log(`[discover:biletix] group ${group.url}`);
      await visit(page, group.url).catch((err) => {
        console.warn(`[discover:biletix] group failed ${group.url}: ${err.message}`);
      });
      const links = classifyLinks(await extractLinks(page));
      links.events.forEach((item) => eventUrls.set(item.url, item));
      links.performances.forEach((item) => performanceUrls.set(item.url, item));
    }

    for (const event of [...eventUrls.values()].slice(0, resolveLimit)) {
      if (performanceUrls.size >= maxPerformances) break;
      console.log(`[discover:biletix] event ${event.url}`);
      await visit(page, event.url).catch((err) => {
        console.warn(`[discover:biletix] event failed ${event.url}: ${err.message}`);
      });
      const links = classifyLinks(await extractLinks(page));
      links.performances.forEach((item) => performanceUrls.set(item.url, item));
    }

    const discovered = [];
    for (const item of [...performanceUrls.values()].slice(0, maxPerformances)) {
      console.log(`[discover:biletix] performance ${item.url}`);
      discovered.push(await metadataForPerformance(page, item.url, item.text));
    }

    const existing = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    const { events, added } = mergeEvents(existing, discovered);

    console.log(`[discover:biletix] discovered ${discovered.length}, added ${added.length}`);
    for (const event of added) {
      console.log(`  + ${event.internal_name}`);
    }

    if (!dryRun) {
      fs.writeFileSync(trackerPath, `${JSON.stringify(events, null, 2)}\n`);
      console.log(`[discover:biletix] wrote ${trackerPath}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[discover:biletix] fatal:', err);
  process.exit(1);
});
