const { runAllScrapers } = require('../lib/scrapers');

// Vercel automatically injects Authorization: Bearer <CRON_SECRET>
// when invoking cron endpoints. CRON_SECRET is set by Vercel — no manual setup needed.
module.exports = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[cron] Scrape triggered:', new Date().toISOString());
  try {
    await runAllScrapers();
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[cron] Scrape failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
