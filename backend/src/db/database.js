const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/biletkarsilastir.db');

// Ensure data directory exists
const dataDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.resolve(DB_PATH));

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS platforms (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    base_url   TEXT NOT NULL,
    color      TEXT,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,
    date         TEXT,
    time         TEXT,
    venue        TEXT,
    city         TEXT,
    description  TEXT,
    tags         TEXT,  -- JSON array stored as string
    availability TEXT NOT NULL DEFAULT 'available',
    image_url    TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS event_platform_links (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    platform_id  TEXT    NOT NULL REFERENCES platforms(id),
    external_url TEXT,
    seat_category TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    UNIQUE(event_id, platform_id)
  );

  CREATE TABLE IF NOT EXISTS price_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    platform_id TEXT    NOT NULL REFERENCES platforms(id),
    price       INTEGER,          -- Turkish Lira, NULL if unavailable
    available   INTEGER NOT NULL DEFAULT 1,
    scraped_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_event_platform
    ON price_snapshots(event_id, platform_id, scraped_at DESC);

  CREATE INDEX IF NOT EXISTS idx_snapshots_scraped_at
    ON price_snapshots(scraped_at DESC);

  CREATE TABLE IF NOT EXISTS scrape_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id TEXT,
    event_id    INTEGER,
    status      TEXT NOT NULL, -- 'success' | 'error' | 'skipped'
    message     TEXT,
    duration_ms INTEGER,
    started_at  TEXT,
    finished_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
