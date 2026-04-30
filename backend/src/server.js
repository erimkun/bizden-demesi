require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express  = require('express');
const cors     = require('cors');
const { startPriceJob } = require('./jobs/priceJob');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Request logger (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/platforms', require('./routes/platforms'));
app.use('/api/events',    require('./routes/events'));
app.use('/api/events',    require('./routes/prices'));   // /:id/prices, /:id/history
app.use('/api/scrape',    require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  const db = require('./db/database');
  const { event_count }    = db.prepare('SELECT COUNT(*) AS event_count FROM events').get();
  const { snapshot_count } = db.prepare('SELECT COUNT(*) AS snapshot_count FROM price_snapshots').get();
  res.json({
    success:  true,
    status:   'ok',
    uptime:   Math.floor(process.uptime()),
    events:   event_count,
    snapshots: snapshot_count,
    next_scrape_in_ms: global.nextScrapeAt ? Math.max(0, global.nextScrapeAt - Date.now()) : null,
  });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.url}` });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`BiletKarşılaştır API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  startPriceJob();
});

module.exports = app;
