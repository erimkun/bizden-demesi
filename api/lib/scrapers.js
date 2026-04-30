const { sql } = require('./db');

// Scraper modules live in backend/src/scrapers/ — they have no DB imports
// so they can be shared between the local backend and this Vercel API layer.
const scrapers = {
  biletix:      require('../../backend/src/scrapers/biletix'),
  passo:        require('../../backend/src/scrapers/passo'),
  eventbrite:   require('../../backend/src/scrapers/eventbrite'),
  ticketmaster: require('../../backend/src/scrapers/ticketmaster'),
};

async function scrapeLink(link) {
  const scraper = scrapers[link.platform_id];
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  if (!scraper) {
    await sql(
      `INSERT INTO scrape_log (platform_id, event_id, status, message, duration_ms, started_at)
       VALUES ($1, $2, 'skipped', 'No scraper registered', 0, $3)`,
      [link.platform_id, link.event_id, startedAt]
    );
    return;
  }

  try {
    const result = await scraper.scrapeEvent(link.external_url);

    if (!result) {
      await sql(
        `INSERT INTO scrape_log (platform_id, event_id, status, message, duration_ms, started_at)
         VALUES ($1, $2, 'skipped', 'Scraper returned null', $3, $4)`,
        [link.platform_id, link.event_id, Date.now() - t0, startedAt]
      );
      return;
    }

    await sql(
      `INSERT INTO price_snapshots (event_id, platform_id, price, available)
       VALUES ($1, $2, $3, $4)`,
      [link.event_id, link.platform_id, result.price, result.available]
    );

    await sql(
      `INSERT INTO scrape_log (platform_id, event_id, status, message, duration_ms, started_at)
       VALUES ($1, $2, 'success', $3, $4, $5)`,
      [link.platform_id, link.event_id, `price=${result.price} available=${result.available}`, Date.now() - t0, startedAt]
    );

    console.log(`[scraper] ${link.platform_id}/event#${link.event_id} → ₺${result.price}`);
  } catch (err) {
    await sql(
      `INSERT INTO scrape_log (platform_id, event_id, status, message, duration_ms, started_at)
       VALUES ($1, $2, 'error', $3, $4, $5)`,
      [link.platform_id, link.event_id, err.message, Date.now() - t0, startedAt]
    );
    console.error(`[scraper] ${link.platform_id}/event#${link.event_id} ERROR: ${err.message}`);
  }
}

async function runPlatformScraper(platformId) {
  const links = await sql(
    `SELECT epl.event_id, epl.platform_id, epl.external_url
     FROM event_platform_links epl
     WHERE epl.platform_id = $1 AND epl.active = TRUE`,
    [platformId]
  );
  console.log(`[scraper] ${platformId} — ${links.length} events`);
  for (const link of links) await scrapeLink(link);
}

async function runAllScrapers() {
  const platforms = await sql`SELECT id FROM platforms WHERE active = TRUE`;
  console.log(`[scraper] Full run — ${platforms.length} platforms`);
  for (const { id } of platforms) await runPlatformScraper(id);
  console.log('[scraper] Full run complete');
}

module.exports = { runAllScrapers, runPlatformScraper };
