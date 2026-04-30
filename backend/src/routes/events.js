const express = require('express');
const db = require('../db/database');

const router = express.Router();

// Attach latest price per platform to each event row
function attachLatestPrices(events) {
  const latestPriceStmt = db.prepare(`
    SELECT ps.platform_id, ps.price, ps.available, ps.scraped_at,
           epl.external_url AS url, epl.seat_category
    FROM price_snapshots ps
    JOIN event_platform_links epl
      ON epl.event_id = ps.event_id AND epl.platform_id = ps.platform_id
    WHERE ps.event_id = ?
      AND ps.scraped_at = (
        SELECT MAX(s2.scraped_at) FROM price_snapshots s2
        WHERE s2.event_id = ps.event_id AND s2.platform_id = ps.platform_id
      )
  `);

  return events.map(event => {
    const rows = latestPriceStmt.all(event.id);
    const prices = {};
    let cheapestPrice = null;
    let cheapestPlatform = null;

    for (const row of rows) {
      prices[row.platform_id] = {
        amount:       row.price,
        available:    row.available === 1,
        category:     row.seat_category,
        url:          row.url,
        last_updated: row.scraped_at,
      };
      if (row.price !== null && row.available === 1) {
        if (cheapestPrice === null || row.price < cheapestPrice) {
          cheapestPrice    = row.price;
          cheapestPlatform = row.platform_id;
        }
      }
    }

    return {
      ...event,
      tags:              JSON.parse(event.tags || '[]'),
      prices,
      cheapest_price:    cheapestPrice,
      cheapest_platform: cheapestPlatform,
    };
  });
}

// GET /api/events
router.get('/', (req, res) => {
  const { category, city, availability, search } = req.query;

  let sql = 'SELECT * FROM events WHERE 1=1';
  const params = [];

  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (city) {
    sql += ' AND city = ?';
    params.push(city);
  }
  if (availability) {
    sql += ' AND availability = ?';
    params.push(availability);
  }
  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ? OR venue LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  sql += ' ORDER BY date ASC';

  const events = db.prepare(sql).all(...params);
  const enriched = attachLatestPrices(events);

  res.json({
    success: true,
    data:    enriched,
    meta:    { total: enriched.length },
  });
});

// GET /api/events/:id
router.get('/:id', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ success: false, error: 'Event not found' });

  const [enriched] = attachLatestPrices([event]);
  res.json({ success: true, data: enriched });
});

module.exports = router;
