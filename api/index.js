require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const { sql, initSchema } = require('./lib/db');
const { runSeed }         = require('./lib/seed');

const app = express();

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/platforms', require('./lib/routes/platforms'));
app.use('/api/events',    require('./lib/routes/events'));
app.use('/api/events',    require('./lib/routes/prices'));   // /:id/prices  /:id/history
app.use('/api/scrape',    require('./lib/routes/ingest'));

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  try {
    const [{ event_count }]    = await sql`SELECT COUNT(*)::int AS event_count FROM events`;
    const [{ snapshot_count }] = await sql`SELECT COUNT(*)::int AS snapshot_count FROM price_snapshots`;
    res.json({ success: true, status: 'ok', events: event_count, snapshots: snapshot_count });
  } catch (err) {
    res.status(500).json({ success: false, status: 'db_error', error: err.message });
  }
});

// ── One-time setup (schema + seed) ───────────────────────────────────────────
// POST /api/admin/setup   — creates all tables
// POST /api/admin/seed    — seeds mock data (safe to re-run, skips existing rows)

function adminGuard(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!process.env.ADMIN_KEY || key === process.env.ADMIN_KEY) return next();
  res.status(401).json({ success: false, error: 'Unauthorized' });
}

app.post('/api/admin/setup', adminGuard, async (req, res) => {
  try {
    await initSchema();
    res.json({ success: true, message: 'Schema ready' });
  } catch (err) {
    console.error('[setup]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/seed', adminGuard, async (req, res) => {
  try {
    const result = await runSeed();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[seed]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 404 / error ───────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.url}` });
});

app.use((err, req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

module.exports = app;
