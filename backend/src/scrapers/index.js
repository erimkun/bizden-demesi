/**
 * Scraper orchestrator
 *
 * Iterates all active events × platforms, calls the correct scraper,
 * writes a price_snapshot row, and logs the result.
 */

const db = require('../db/database');

const scrapers = {
  biletix:      require('./biletix'),
  passo:        require('./passo'),
  eventbrite:   require('./eventbrite'),
  ticketmaster: require('./ticketmaster'),
};

const insertSnapshot = db.prepare(`
  INSERT INTO price_snapshots (event_id, platform_id, price, available)
  VALUES (@event_id, @platform_id, @price, @available)
`);

const insertLog = db.prepare(`
  INSERT INTO scrape_log (platform_id, event_id, status, message, duration_ms, started_at)
  VALUES (@platform_id, @event_id, @status, @message, @duration_ms, @started_at)
`);

async function scrapeLink(link) {
  const scraper = scrapers[link.platform_id];
  if (!scraper) {
    insertLog.run({ platform_id: link.platform_id, event_id: link.event_id, status: 'skipped', message: 'No scraper registered', duration_ms: 0, started_at: new Date().toISOString() });
    return;
  }

  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  try {
    const result = await scraper.scrapeEvent(link.external_url);

    if (!result) {
      insertLog.run({ platform_id: link.platform_id, event_id: link.event_id, status: 'skipped', message: 'Scraper returned null (no URL or page unavailable)', duration_ms: Date.now() - t0, started_at: startedAt });
      return;
    }

    insertSnapshot.run({
      event_id:    link.event_id,
      platform_id: link.platform_id,
      price:       result.price,
      available:   result.available ? 1 : 0,
    });

    insertLog.run({ platform_id: link.platform_id, event_id: link.event_id, status: 'success', message: `price=${result.price} available=${result.available}`, duration_ms: Date.now() - t0, started_at: startedAt });

    console.log(`[scraper] ${link.platform_id} / event#${link.event_id} → ₺${result.price} (${result.available ? 'available' : 'sold-out'})`);
  } catch (err) {
    insertLog.run({ platform_id: link.platform_id, event_id: link.event_id, status: 'error', message: err.message, duration_ms: Date.now() - t0, started_at: startedAt });
    console.error(`[scraper] ${link.platform_id} / event#${link.event_id} ERROR: ${err.message}`);
  }
}

async function runPlatformScraper(platformId) {
  const links = db.prepare(`
    SELECT epl.event_id, epl.platform_id, epl.external_url
    FROM event_platform_links epl
    JOIN events e ON e.id = epl.event_id
    WHERE epl.platform_id = ? AND epl.active = 1
  `).all(platformId);

  console.log(`[scraper] Starting ${platformId} — ${links.length} events`);
  for (const link of links) await scrapeLink(link);
  console.log(`[scraper] Finished ${platformId}`);
}

async function runAllScrapers() {
  const platforms = db.prepare("SELECT id FROM platforms WHERE active = 1").all();
  console.log(`[scraper] Full run starting — ${platforms.length} platforms`);

  for (const { id } of platforms) {
    await runPlatformScraper(id);
  }

  global.nextScrapeAt = Date.now() + parseInt(process.env.SCRAPE_INTERVAL_HOURS || '4', 10) * 3600 * 1000;
  console.log('[scraper] Full run complete');
}

module.exports = { runAllScrapers, runPlatformScraper };
