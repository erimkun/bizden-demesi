const express = require('express');
const { sql } = require('../db');
const { runAllScrapers, runPlatformScraper } = require('../scrapers');

const router = express.Router();

function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!process.env.ADMIN_KEY || key === process.env.ADMIN_KEY) return next();
  res.status(401).json({ success: false, error: 'Unauthorized' });
}

// GET /api/scrape/status
router.get('/status', async (req, res) => {
  try {
    const rows = await sql`
      SELECT platform_id, status, message, duration_ms, finished_at
      FROM scrape_log
      WHERE finished_at = (
        SELECT MAX(s2.finished_at) FROM scrape_log s2
        WHERE s2.platform_id = scrape_log.platform_id
      )
      ORDER BY finished_at DESC
    `;
    res.json({
      success: true,
      data: { platforms: rows, scrape_interval_hrs: parseInt(process.env.SCRAPE_INTERVAL_HOURS || '4', 10) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/scrape/logs
router.get('/logs', async (req, res) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const platform = req.query.platform;

    const rows = platform
      ? await sql('SELECT * FROM scrape_log WHERE platform_id = $1 ORDER BY finished_at DESC LIMIT $2', [platform, limit])
      : await sql('SELECT * FROM scrape_log ORDER BY finished_at DESC LIMIT $1', [limit]);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/scrape/trigger
router.post('/trigger', requireAdminKey, async (req, res) => {
  res.json({ success: true, message: 'Scrape job started in background' });
  runAllScrapers().catch(err => console.error('[admin] scrape error:', err.message));
});

// POST /api/scrape/trigger/:platform
router.post('/trigger/:platform', requireAdminKey, async (req, res) => {
  const { platform } = req.params;
  res.json({ success: true, message: `Scrape started for: ${platform}` });
  runPlatformScraper(platform).catch(err => console.error(`[admin] scrape error (${platform}):`, err.message));
});

module.exports = router;
