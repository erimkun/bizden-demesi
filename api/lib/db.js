const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL not set — DB queries will fail');
}

const sql = neon(process.env.DATABASE_URL || 'postgresql://localhost/placeholder');

async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS platforms (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      base_url   TEXT NOT NULL,
      color      TEXT,
      active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      category     TEXT NOT NULL,
      date         TEXT,
      time         TEXT,
      venue        TEXT,
      city         TEXT,
      description  TEXT,
      tags         TEXT,
      availability TEXT NOT NULL DEFAULT 'available',
      image_url    TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS event_platform_links (
      id            SERIAL PRIMARY KEY,
      event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      platform_id   TEXT    NOT NULL REFERENCES platforms(id),
      external_url  TEXT,
      seat_category TEXT,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE(event_id, platform_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      platform_id TEXT    NOT NULL REFERENCES platforms(id),
      price       INTEGER,
      available   BOOLEAN NOT NULL DEFAULT TRUE,
      scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_snapshots_event_platform
      ON price_snapshots(event_id, platform_id, scraped_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_snapshots_scraped_at
      ON price_snapshots(scraped_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scrape_log (
      id          SERIAL PRIMARY KEY,
      platform_id TEXT,
      event_id    INTEGER,
      status      TEXT NOT NULL,
      message     TEXT,
      duration_ms INTEGER,
      started_at  TIMESTAMPTZ,
      finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Phase 3 additions — idempotent
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS internal_name TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_internal_name ON events(internal_name) WHERE internal_name IS NOT NULL`;
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ`;

  await sql`ALTER TABLE event_platform_links ADD COLUMN IF NOT EXISTS platform_event_id TEXT`;
  await sql`ALTER TABLE event_platform_links ADD COLUMN IF NOT EXISTS last_status TEXT`;
  await sql`ALTER TABLE event_platform_links ADD COLUMN IF NOT EXISTS last_status_at TIMESTAMPTZ`;

  console.log('[db] Schema ready');
}

module.exports = { sql, initSchema };
