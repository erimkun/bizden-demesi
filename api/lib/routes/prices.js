const express = require('express');
const { sql } = require('../db');

const router = express.Router();

// GET /api/events/:id/prices
router.get('/:id/prices', async (req, res) => {
  try {
    const [event] = await sql('SELECT id, name FROM events WHERE id = $1', [req.params.id]);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    const rows = await sql(
      `SELECT ps.platform_id, ps.price, ps.available, ps.scraped_at,
              epl.external_url AS url, epl.seat_category,
              p.name AS platform_name, p.color AS platform_color
       FROM price_snapshots ps
       JOIN event_platform_links epl
         ON epl.event_id = ps.event_id AND epl.platform_id = ps.platform_id
       JOIN platforms p ON p.id = ps.platform_id
       WHERE ps.event_id = $1
         AND ps.scraped_at = (
           SELECT MAX(s2.scraped_at) FROM price_snapshots s2
           WHERE s2.event_id = ps.event_id AND s2.platform_id = ps.platform_id
         )
       ORDER BY ps.platform_id`,
      [event.id]
    );

    const prices = {};
    for (const row of rows) {
      prices[row.platform_id] = {
        platform_name:  row.platform_name,
        platform_color: row.platform_color,
        amount:         row.price,
        available:      row.available,
        seat_category:  row.seat_category,
        url:            row.url,
        last_updated:   row.scraped_at,
      };
    }

    res.json({ success: true, data: { event_id: event.id, event_name: event.name, prices } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events/:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const [event] = await sql('SELECT id, name FROM events WHERE id = $1', [req.params.id]);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

    const allHistory = req.query.all === '1' || req.query.all === 'true';
    const hours = Math.min(parseInt(req.query.hours || '48', 10), 8760);
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);

    const params = [event.id];
    let q = `SELECT platform_id, price, available, scraped_at
             FROM price_snapshots
             WHERE event_id = $1`;

    if (!allHistory) {
      params.push(new Date(Date.now() - hours * 3600 * 1000).toISOString());
      q += ` AND scraped_at >= $${params.length}`;
    }

    if (req.query.platform) {
      params.push(req.query.platform);
      q += ` AND platform_id = $${params.length}`;
    }

    params.push(limit);
    q += ` ORDER BY platform_id, scraped_at ASC LIMIT $${params.length}`;

    const rows = await sql(q, params);

    const history = {};
    for (const row of rows) {
      if (!history[row.platform_id]) history[row.platform_id] = [];
      history[row.platform_id].push({
        price:      row.price,
        available:  row.available,
        scraped_at: row.scraped_at,
      });
    }

    res.json({ success: true, data: { event_id: event.id, event_name: event.name, hours: allHistory ? null : hours, all: allHistory, history } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
