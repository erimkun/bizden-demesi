const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/events/:id/prices
// Returns the single latest price from each platform for this event
router.get('/:id/prices', (req, res) => {
  const event = db.prepare('SELECT id, name FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

  const rows = db.prepare(`
    SELECT ps.platform_id, ps.price, ps.available, ps.scraped_at,
           epl.external_url AS url, epl.seat_category,
           p.name AS platform_name, p.color AS platform_color
    FROM price_snapshots ps
    JOIN event_platform_links epl
      ON epl.event_id = ps.event_id AND epl.platform_id = ps.platform_id
    JOIN platforms p ON p.id = ps.platform_id
    WHERE ps.event_id = ?
      AND ps.scraped_at = (
        SELECT MAX(s2.scraped_at) FROM price_snapshots s2
        WHERE s2.event_id = ps.event_id AND s2.platform_id = ps.platform_id
      )
    ORDER BY ps.platform_id
  `).all(event.id);

  const prices = {};
  for (const row of rows) {
    prices[row.platform_id] = {
      platform_name:  row.platform_name,
      platform_color: row.platform_color,
      amount:         row.price,
      available:      row.available === 1,
      seat_category:  row.seat_category,
      url:            row.url,
      last_updated:   row.scraped_at,
    };
  }

  res.json({
    success: true,
    data: {
      event_id:   event.id,
      event_name: event.name,
      prices,
    },
  });
});

// GET /api/events/:id/history
// Query params: platform (optional), hours (default 48), limit (default 200)
router.get('/:id/history', (req, res) => {
  const event = db.prepare('SELECT id, name FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

  const hours  = Math.min(parseInt(req.query.hours  || '48',  10), 8760); // max 1 year
  const limit  = Math.min(parseInt(req.query.limit  || '200', 10), 1000);
  const since  = new Date(Date.now() - hours * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  let sql = `
    SELECT platform_id, price, available, scraped_at
    FROM price_snapshots
    WHERE event_id = ? AND scraped_at >= ?
  `;
  const params = [event.id, since];

  if (req.query.platform) {
    sql += ' AND platform_id = ?';
    params.push(req.query.platform);
  }

  sql += ' ORDER BY platform_id, scraped_at ASC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);

  // Group by platform
  const history = {};
  for (const row of rows) {
    if (!history[row.platform_id]) history[row.platform_id] = [];
    history[row.platform_id].push({
      price:      row.price,
      available:  row.available === 1,
      scraped_at: row.scraped_at,
    });
  }

  res.json({
    success: true,
    data: {
      event_id:   event.id,
      event_name: event.name,
      hours,
      history,
    },
  });
});

module.exports = router;
