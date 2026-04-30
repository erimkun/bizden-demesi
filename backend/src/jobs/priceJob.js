// Scheduled price scraping job
//
// Uses node-cron to fire runAllScrapers() on a configurable interval.
// The cron expression is built from SCRAPE_INTERVAL_HOURS (default 4).
//
// Supported values:
//   1  → every hour          cron: "0 * * * *"
//   2  → every 2 hours       cron: "0 *\/2 * * *"
//   4  → every 4 hours       cron: "0 *\/4 * * *"  ← default
//   6  → every 6 hours       cron: "0 *\/6 * * *"
//   12 → twice a day         cron: "0 *\/12 * * *"
//   24 → once a day at 6am   cron: "0 6 * * *"

const cron = require('node-cron');
const { runAllScrapers } = require('../scrapers');

function buildCronExpression(hours) {
  if (hours >= 24) return '0 6 * * *';        // daily at 06:00
  if (hours === 1)  return '0 * * * *';        // every hour
  return `0 */${hours} * * *`;                 // every N hours
}

function startPriceJob() {
  const hours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || '4', 10);
  const expr  = buildCronExpression(hours);

  console.log(`[job] Price job scheduled: "${expr}" (every ${hours}h)`);

  global.nextScrapeAt = Date.now() + hours * 3600 * 1000;

  cron.schedule(expr, async () => {
    console.log('[job] Price job triggered by cron');
    try {
      await runAllScrapers();
    } catch (err) {
      console.error('[job] Price job error:', err.message);
    }
  });
}

module.exports = { startPriceJob };
