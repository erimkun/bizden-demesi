const express = require('express');
const { sql } = require('../db');

const router = express.Router();

async function attachLatestPrices(events) {
  return Promise.all(events.map(async (event) => {
    const rows = await sql(
      `SELECT ps.platform_id, ps.price, ps.available, ps.scraped_at,
              epl.external_url AS url, epl.seat_category
       FROM price_snapshots ps
       JOIN event_platform_links epl
         ON epl.event_id = ps.event_id AND epl.platform_id = ps.platform_id
       WHERE ps.event_id = $1
         AND ps.scraped_at = (
           SELECT MAX(s2.scraped_at) FROM price_snapshots s2
           WHERE s2.event_id = ps.event_id AND s2.platform_id = ps.platform_id
         )`,
      [event.id]
    );

    const prices = {};
    let cheapestPrice = null;
    let cheapestPlatform = null;

    for (const row of rows) {
      prices[row.platform_id] = {
        amount:       row.price,
        available:    row.available,
        category:     row.seat_category,
        url:          row.url,
        last_updated: row.scraped_at,
      };
      if (row.price !== null && row.available) {
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
  }));
}

// GET /api/events
router.get('/', async (req, res) => {
  try {
    const { category, city, availability, search } = req.query;
    const conditions = [];
    const params = [];

    if (category && category !== 'all') {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (city) {
      params.push(city);
      conditions.push(`city = $${params.length}`);
    }
    if (availability) {
      params.push(availability);
      conditions.push(`availability = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(name ILIKE $${n} OR description ILIKE $${n} OR venue ILIKE $${n})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const events = await sql(`SELECT * FROM events ${where} ORDER BY date ASC`, params);
    const enriched = await attachLatestPrices(events);

    res.json({ success: true, data: enriched, meta: { total: enriched.length } });
  } catch (err) {
    console.error('[events] GET /', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  try {
    const [event] = await sql('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    const [enriched] = await attachLatestPrices([event]);
    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
