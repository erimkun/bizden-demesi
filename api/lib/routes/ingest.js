const express = require('express');
const { sql } = require('../db');
const { verifySignature } = require('../sign');

const router = express.Router();

function requireSignature(req, res, next) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return res.status(503).json({ success: false, error: 'INGEST_SECRET not configured' });
  }
  const signature = req.headers['x-signature'];
  if (!signature) {
    return res.status(401).json({ success: false, error: 'Missing X-Signature header' });
  }
  if (!verifySignature(req.body, signature, secret)) {
    return res.status(401).json({ success: false, error: 'Invalid signature' });
  }
  next();
}

// POST /api/scrape/ingest
router.post('/ingest', requireSignature, async (req, res) => {
  const { internal_name, results } = req.body;
  if (!internal_name || !Array.isArray(results)) {
    return res.status(400).json({ success: false, error: 'internal_name and results[] required' });
  }

  const [event] = await sql('SELECT id FROM events WHERE internal_name = $1', [internal_name]);
  if (!event) {
    return res.status(404).json({ success: false, error: `Unknown internal_name: ${internal_name}` });
  }

  const now = new Date().toISOString();
  let snapshotsWritten = 0;

  for (const r of results) {
    if (!r.platform_id) continue;

    await sql(
      `INSERT INTO event_platform_links (event_id, platform_id, external_url, platform_event_id, last_status, last_status_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id, platform_id) DO UPDATE
         SET external_url      = COALESCE(EXCLUDED.external_url, event_platform_links.external_url),
             platform_event_id = COALESCE(EXCLUDED.platform_event_id, event_platform_links.platform_event_id),
             last_status       = EXCLUDED.last_status,
             last_status_at    = EXCLUDED.last_status_at`,
      [event.id, r.platform_id, r.url || r.raw_url || null, r.platform_event_id || null, r.status, now]
    );

    if (r.status === 'ok' && Number.isFinite(r.amount)) {
      await sql(
        `INSERT INTO price_snapshots (event_id, platform_id, price, available, scraped_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [event.id, r.platform_id, r.amount, r.available !== false, now]
      );
      snapshotsWritten++;
    }
  }

  await sql(
    `INSERT INTO scrape_log (event_id, status, message, finished_at)
     VALUES ($1, $2, $3, $4)`,
    [event.id, 'ok', `${snapshotsWritten}/${results.length} snapshots`, now]
  );

  res.json({ success: true, snapshotsWritten });
});

// POST /api/scrape/enrich-metadata
router.post('/enrich-metadata', requireSignature, async (req, res) => {
  const { internal_name, name, image_url, venue, date_text } = req.body;
  if (!internal_name) {
    return res.status(400).json({ success: false, error: 'internal_name required' });
  }
  await sql(
    `UPDATE events
       SET name             = COALESCE($2, name),
           image_url        = COALESCE($3, image_url),
           venue            = COALESCE($4, venue),
           date             = COALESCE($5, date),
           last_enriched_at = NOW(),
           updated_at       = NOW()
     WHERE internal_name = $1`,
    [internal_name, name || null, image_url || null, venue || null, date_text || null]
  );
  res.json({ success: true });
});

module.exports = router;
