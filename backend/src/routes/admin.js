const express = require('express');
const db = require('../db/database');
const { runAllScrapers, runPlatformScraper } = require('../scrapers');

const router = express.Router();

// Simple API key guard
function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!process.env.ADMIN_KEY || key === process.env.ADMIN_KEY) return next();
  res.status(401).json({ success: false, error: 'Unauthorized' });
}

// GET /api/scrape/status
// Returns the most recent scrape log entry per platform
router.get('/status', (req, res) => {
  const rows = db.prepare(`
    SELECT platform_id, status, message, duration_ms, finished_at
    FROM scrape_log
    WHERE finished_at = (
      SELECT MAX(s2.finished_at) FROM scrape_log s2
      WHERE s2.platform_id = scrape_log.platform_id
    )
    ORDER BY finished_at DESC
  `).all();

  const nextScrapeMs = global.nextScrapeAt
    ? Math.max(0, global.nextScrapeAt - Date.now())
    : null;

  res.json({
    success: true,
    data: {
      platforms:           rows,
      next_scrape_in_ms:   nextScrapeMs,
      scrape_interval_hrs: parseInt(process.env.SCRAPE_INTERVAL_HOURS || '4', 10),
    },
  });
});

// GET /api/scrape/logs?limit=50&platform=biletix
router.get('/logs', (req, res) => {
  const limit    = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const platform = req.query.platform;

  let sql = 'SELECT * FROM scrape_log';
  const params = [];
  if (platform) { sql += ' WHERE platform_id = ?'; params.push(platform); }
  sql += ' ORDER BY finished_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  res.json({ success: true, data: rows });
});

// POST /api/scrape/trigger
// Manually kick off a full scrape (all platforms)
router.post('/trigger', requireAdminKey, async (req, res) => {
  res.json({ success: true, message: 'Scrape job started in background' });
  // Fire-and-forget — response already sent
  try {
    await runAllScrapers();
  } catch (err) {
    console.error('[admin] Manual scrape error:', err.message);
  }
});

// POST /api/scrape/trigger/:platform
// Manually scrape a single platform
router.post('/trigger/:platform', requireAdminKey, async (req, res) => {
  const { platform } = req.params;
  res.json({ success: true, message: `Scrape started for platform: ${platform}` });
  try {
    await runPlatformScraper(platform);
  } catch (err) {
    console.error(`[admin] Manual scrape error (${platform}):`, err.message);
  }
});

module.exports = router;
