const { sql, initSchema } = require('./db');

const PLATFORMS = [
  { id: 'biletix',      name: 'Biletix',      base_url: 'https://www.biletix.com',      color: '#E8472A' },
  { id: 'passo',        name: 'Passo',         base_url: 'https://www.passo.com.tr',     color: '#00A651' },
  { id: 'eventbrite',   name: 'Eventbrite',    base_url: 'https://www.eventbrite.com',   color: '#F05537' },
  { id: 'ticketmaster', name: 'Ticketmaster',  base_url: 'https://www.ticketmaster.com', color: '#026CDF' },
];

const EVENTS = [
  {
    name: 'Sezen Aksu — Yeni Dünya Turnesi', category: 'konser',
    date: '22 Mart 2026', time: '21:00', venue: 'Ülker Stadyum', city: 'İstanbul',
    description: 'Türk pop müziğinin efsanesi Sezen Aksu, yeni albümünün tanıtımı için sahne alıyor.',
    tags: ['pop', 'türk müziği', 'konser'], availability: 'limited',
    prices: {
      biletix:      { amount: 1250, available: true,  seat_category: 'Genel Alan', url: 'https://www.biletix.com', volatility: 0.04 },
      passo:        { amount: 1190, available: true,  seat_category: 'Genel Alan', url: 'https://www.passo.com.tr', volatility: 0.04 },
      eventbrite:   { amount: 1320, available: true,  seat_category: 'General',    url: 'https://www.eventbrite.com', volatility: 0.04 },
      ticketmaster: { amount: 1200, available: true,  seat_category: 'General',    url: 'https://www.ticketmaster.com', volatility: 0.04 },
    },
  },
  {
    name: 'Hamlet — Devlet Tiyatrosu', category: 'tiyatro',
    date: '18 Mart 2026', time: '20:00', venue: 'AKM Ana Sahne', city: 'İstanbul',
    description: "Shakespeare'nin ölümsüz eseri, Devlet Tiyatrosu'nun başarılı kadrosuyla sahnede.",
    tags: ['tiyatro', 'klasik', 'shakespeare'], availability: 'available',
    prices: {
      biletix:      { amount: 280,  available: true,  seat_category: 'Balkon',  url: 'https://www.biletix.com', volatility: 0.02 },
      passo:        { amount: 260,  available: true,  seat_category: 'Balkon',  url: 'https://www.passo.com.tr', volatility: 0.02 },
      eventbrite:   { amount: 295,  available: false, seat_category: 'Balcony', url: 'https://www.eventbrite.com', volatility: 0.02 },
      ticketmaster: { amount: 270,  available: true,  seat_category: 'Balcony', url: 'https://www.ticketmaster.com', volatility: 0.02 },
    },
  },
  {
    name: 'İstanbul Caz Festivali 2026', category: 'festival',
    date: '5 Nisan 2026', time: '18:00', venue: 'Harbiye Açıkhava', city: 'İstanbul',
    description: "Uluslararası sanatçıların katılımıyla İstanbul'un en büyük caz festivali geri dönüyor.",
    tags: ['caz', 'festival', 'uluslararası'], availability: 'available',
    prices: {
      biletix:      { amount: 450, available: true, seat_category: 'Genel',   url: 'https://www.biletix.com', volatility: 0.03 },
      passo:        { amount: 440, available: true, seat_category: 'Genel',   url: 'https://www.passo.com.tr', volatility: 0.03 },
      eventbrite:   { amount: 480, available: true, seat_category: 'General', url: 'https://www.eventbrite.com', volatility: 0.03 },
      ticketmaster: { amount: 465, available: true, seat_category: 'General', url: 'https://www.ticketmaster.com', volatility: 0.03 },
    },
  },
  {
    name: 'Galatasaray vs Fenerbahçe', category: 'spor',
    date: '30 Mart 2026', time: '19:00', venue: 'RAMS Park', city: 'İstanbul',
    description: "Türk futbolunun en büyük derbisi, bu sezon RAMS Park'ta oynanacak.",
    tags: ['futbol', 'derbi', 'süper lig'], availability: 'limited',
    prices: {
      biletix:      { amount: 850,  available: true,  seat_category: 'Maratoncu', url: 'https://www.biletix.com', volatility: 0.06 },
      passo:        { amount: 890,  available: true,  seat_category: 'Maratoncu', url: 'https://www.passo.com.tr', volatility: 0.06 },
      eventbrite:   { amount: null, available: false, seat_category: null,        url: null, volatility: 0.06 },
      ticketmaster: { amount: 820,  available: true,  seat_category: 'Marathon',  url: 'https://www.ticketmaster.com', volatility: 0.06 },
    },
  },
  {
    name: 'Musa Eroğlu — 50. Yıl Konseri', category: 'konser',
    date: '25 Mart 2026', time: '20:30', venue: 'Zorlu PSM', city: 'İstanbul',
    description: "Türk halk müziğinin duayeni Musa Eroğlu, 50. sanat yılını özel konserle kutluyor.",
    tags: ['halk müziği', 'konser', 'özel gece'], availability: 'available',
    prices: {
      biletix:      { amount: 380, available: true, seat_category: 'Genel Alan', url: 'https://www.biletix.com', volatility: 0.025 },
      passo:        { amount: 360, available: true, seat_category: 'Genel Alan', url: 'https://www.passo.com.tr', volatility: 0.025 },
      eventbrite:   { amount: 395, available: true, seat_category: 'General',   url: 'https://www.eventbrite.com', volatility: 0.025 },
      ticketmaster: { amount: 370, available: true, seat_category: 'General',   url: 'https://www.ticketmaster.com', volatility: 0.025 },
    },
  },
  {
    name: 'Don Giovanni — İDSO Opera', category: 'tiyatro',
    date: '12 Nisan 2026', time: '20:00', venue: 'Borusan Holding Müzik Evi', city: 'İstanbul',
    description: "Mozart'ın şaheseri Don Giovanni, İstanbul Devlet Senfoni Orkestrası eşliğinde sahnelenecek.",
    tags: ['opera', 'klasik müzik', 'mozart'], availability: 'available',
    prices: {
      biletix:      { amount: 680, available: true, seat_category: 'Parke',   url: 'https://www.biletix.com', volatility: 0.015 },
      passo:        { amount: 650, available: true, seat_category: 'Parke',   url: 'https://www.passo.com.tr', volatility: 0.015 },
      eventbrite:   { amount: 710, available: true, seat_category: 'Parquet', url: 'https://www.eventbrite.com', volatility: 0.015 },
      ticketmaster: { amount: 670, available: true, seat_category: 'Parquet', url: 'https://www.ticketmaster.com', volatility: 0.015 },
    },
  },
  {
    name: 'Teknofest 2026', category: 'festival',
    date: '20 Nisan 2026', time: '10:00', venue: 'Atatürk Havalimanı', city: 'İstanbul',
    description: "Türkiye'nin en büyük teknoloji ve havacılık festivali bu yıl da kapılarını açıyor.",
    tags: ['teknoloji', 'havacılık', 'festival'], availability: 'available',
    prices: {
      biletix:      { amount: 150, available: true, seat_category: 'Günlük Bilet', url: 'https://www.biletix.com', volatility: 0.02 },
      passo:        { amount: 140, available: true, seat_category: 'Günlük Bilet', url: 'https://www.passo.com.tr', volatility: 0.02 },
      eventbrite:   { amount: 160, available: true, seat_category: 'Daily Pass',   url: 'https://www.eventbrite.com', volatility: 0.02 },
      ticketmaster: { amount: 155, available: true, seat_category: 'Daily Pass',   url: 'https://www.ticketmaster.com', volatility: 0.02 },
    },
  },
  {
    name: 'Beşiktaş vs Trabzonspor', category: 'spor',
    date: '2 Nisan 2026', time: '20:00', venue: 'Tüpraş Stadyumu', city: 'İstanbul',
    description: "Süper Lig'in kritik karşılaşması, şampiyonluk yarışını doğrudan etkiliyor.",
    tags: ['futbol', 'süper lig', 'beşiktaş'], availability: 'available',
    prices: {
      biletix:      { amount: 420,  available: true,  seat_category: 'Uzun Kenar', url: 'https://www.biletix.com', volatility: 0.05 },
      passo:        { amount: 400,  available: true,  seat_category: 'Uzun Kenar', url: 'https://www.passo.com.tr', volatility: 0.05 },
      eventbrite:   { amount: null, available: false, seat_category: null,         url: null, volatility: 0.05 },
      ticketmaster: { amount: 410,  available: true,  seat_category: 'Long Side',  url: 'https://www.ticketmaster.com', volatility: 0.05 },
    },
  },
];

function generateHistory(base, volatility = 0.04, points = 48) {
  const history = [];
  let price = base * (1 + (Math.random() - 0.5) * 0.15);
  for (let i = 0; i < points; i++) {
    price += price * (Math.random() - 0.48) * volatility;
    price = Math.max(base * 0.7, Math.min(base * 1.4, price));
    history.push(Math.round(price));
  }
  history[history.length - 1] = base;
  return history;
}

async function runSeed() {
  await initSchema();

  // Platforms
  for (const p of PLATFORMS) {
    await sql(
      `INSERT INTO platforms (id, name, base_url, color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name=$2, base_url=$3, color=$4`,
      [p.id, p.name, p.base_url, p.color]
    );
  }
  console.log(`✓ ${PLATFORMS.length} platforms`);

  let eventsSeeded = 0;
  let snapshotsSeeded = 0;

  for (const event of EVENTS) {
    // Upsert event (match by name)
    const [existing] = await sql('SELECT id FROM events WHERE name = $1', [event.name]);

    let eventId;
    if (existing) {
      eventId = existing.id;
    } else {
      const [row] = await sql(
        `INSERT INTO events (name, category, date, time, venue, city, description, tags, availability)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [event.name, event.category, event.date, event.time, event.venue, event.city,
         event.description, JSON.stringify(event.tags), event.availability]
      );
      eventId = row.id;
      eventsSeeded++;
    }

    for (const [platformId, info] of Object.entries(event.prices)) {
      // Platform link
      await sql(
        `INSERT INTO event_platform_links (event_id, platform_id, external_url, seat_category)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (event_id, platform_id) DO NOTHING`,
        [eventId, platformId, info.url, info.seat_category]
      );

      // Only seed history if no snapshots exist for this event+platform
      const [snap] = await sql(
        'SELECT 1 FROM price_snapshots WHERE event_id=$1 AND platform_id=$2 LIMIT 1',
        [eventId, platformId]
      );
      if (!snap) {
        const now = Date.now();
        const HOUR = 3600 * 1000;
        if (info.amount) {
          const history = generateHistory(info.amount, info.volatility, 48);
          for (let i = 0; i < history.length; i++) {
            const ts = new Date(now - (47 - i) * HOUR).toISOString();
            await sql(
              `INSERT INTO price_snapshots (event_id, platform_id, price, available, scraped_at)
               VALUES ($1,$2,$3,$4,$5)`,
              [eventId, platformId, history[i], info.available, ts]
            );
            snapshotsSeeded++;
          }
        } else {
          await sql(
            `INSERT INTO price_snapshots (event_id, platform_id, price, available)
             VALUES ($1,$2,$3,$4)`,
            [eventId, platformId, null, false]
          );
          snapshotsSeeded++;
        }
      }
    }
  }

  console.log(`✓ ${eventsSeeded} events, ${snapshotsSeeded} snapshots`);
  return { eventsSeeded, snapshotsSeeded };
}

module.exports = { runSeed };
