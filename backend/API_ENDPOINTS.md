# BiletKarşılaştır — API Endpoints

Base URL (local): `http://localhost:3001`  
Base URL (production): `https://api.biletkarsilastir.com` *(placeholder)*

All responses are JSON with the shape:
```json
{ "success": true, "data": ... }
{ "success": false, "error": "description" }
```

---

## Health

### `GET /api/health`

Server status, uptime, and basic database stats.

**Response**
```json
{
  "success": true,
  "status": "ok",
  "uptime": 3721,
  "events": 8,
  "snapshots": 384,
  "next_scrape_in_ms": 7200000
}
```

---

## Platforms

### `GET /api/platforms`

List all ticket platforms tracked by the system.

**Response**
```json
{
  "success": true,
  "data": [
    {
      "id": "biletix",
      "name": "Biletix",
      "base_url": "https://www.biletix.com",
      "color": "#E8472A",
      "active": 1
    }
  ]
}
```

---

## Events

### `GET /api/events`

List all events with their latest prices from every platform.

**Query Parameters**

| Param          | Type   | Description                                      |
|----------------|--------|--------------------------------------------------|
| `category`     | string | Filter by category: `konser`, `tiyatro`, `festival`, `spor` |
| `city`         | string | Filter by city (e.g. `İstanbul`)                 |
| `availability` | string | Filter by status: `available`, `limited`         |
| `search`       | string | Full-text search on name, description, venue     |

**Example**
```
GET /api/events?category=konser&city=İstanbul
```

**Response**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Sezen Aksu — Yeni Dünya Turnesi",
      "category": "konser",
      "date": "22 Mart 2026",
      "time": "21:00",
      "venue": "Ülker Stadyum",
      "city": "İstanbul",
      "description": "...",
      "tags": ["pop", "türk müziği", "konser"],
      "availability": "limited",
      "prices": {
        "biletix": {
          "amount": 1250,
          "available": true,
          "category": "Genel Alan",
          "url": "https://www.biletix.com/...",
          "last_updated": "2026-04-29 14:00:00"
        },
        "passo":        { "amount": 1190, "available": true, ... },
        "eventbrite":   { "amount": 1320, "available": true, ... },
        "ticketmaster": { "amount": 1200, "available": true, ... }
      },
      "cheapest_price": 1190,
      "cheapest_platform": "passo"
    }
  ],
  "meta": { "total": 8 }
}
```

---

### `GET /api/events/:id`

Get a single event with its latest prices.

**Parameters**

| Param | Type    | Description  |
|-------|---------|--------------|
| `id`  | integer | Event row ID |

**Response** — same structure as a single item from `GET /api/events`.

**Error** — `404` if event not found.

---

## Prices

### `GET /api/events/:id/prices`

Latest prices for one event, across all platforms. Includes platform metadata (color, name).

**Response**
```json
{
  "success": true,
  "data": {
    "event_id": 1,
    "event_name": "Sezen Aksu — Yeni Dünya Turnesi",
    "prices": {
      "biletix": {
        "platform_name": "Biletix",
        "platform_color": "#E8472A",
        "amount": 1250,
        "available": true,
        "seat_category": "Genel Alan",
        "url": "https://www.biletix.com/...",
        "last_updated": "2026-04-29 14:00:00"
      }
    }
  }
}
```

---

### `GET /api/events/:id/history`

Time-series price history for one event. Used to render the price chart.

**Query Parameters**

| Param      | Type    | Default | Description                                           |
|------------|---------|---------|-------------------------------------------------------|
| `hours`    | integer | `48`    | How far back to look (max 8760 = 1 year)              |
| `platform` | string  | all     | Filter to a single platform ID (e.g. `biletix`)       |
| `limit`    | integer | `200`   | Max rows returned per platform (max 1000)             |

**Example**
```
GET /api/events/1/history?hours=72&platform=passo
```

**Response**
```json
{
  "success": true,
  "data": {
    "event_id": 1,
    "event_name": "Sezen Aksu — Yeni Dünya Turnesi",
    "hours": 72,
    "history": {
      "passo": [
        { "price": 1185, "available": true, "scraped_at": "2026-04-27 02:00:00" },
        { "price": 1190, "available": true, "scraped_at": "2026-04-27 06:00:00" }
      ]
    }
  }
}
```

---

## Scraping (Admin)

All admin endpoints optionally require the `x-admin-key` header (configured via `ADMIN_KEY` env var). If `ADMIN_KEY` is not set, admin routes are open (development mode).

### `GET /api/scrape/status`

Latest scrape result per platform and when the next scheduled run fires.

**Response**
```json
{
  "success": true,
  "data": {
    "platforms": [
      {
        "platform_id": "biletix",
        "status": "success",
        "message": "price=1250 available=true",
        "duration_ms": 1432,
        "finished_at": "2026-04-29 14:00:05"
      }
    ],
    "next_scrape_in_ms": 12600000,
    "scrape_interval_hrs": 4
  }
}
```

---

### `GET /api/scrape/logs`

Full scrape log history.

**Query Parameters**

| Param      | Type    | Default | Description                                |
|------------|---------|---------|--------------------------------------------|
| `limit`    | integer | `50`    | Number of records (max 200)                |
| `platform` | string  | all     | Filter by platform ID                      |

**Response**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "platform_id": "passo",
      "event_id": 3,
      "status": "success",
      "message": "price=440 available=true",
      "duration_ms": 987,
      "started_at": "2026-04-29 14:00:01",
      "finished_at": "2026-04-29 14:00:02"
    }
  ]
}
```

---

### `POST /api/scrape/trigger`

Trigger a full scrape of all platforms immediately. Response is returned instantly; scraping runs in background.

**Headers**
```
x-admin-key: <ADMIN_KEY>
```

**Response**
```json
{ "success": true, "message": "Scrape job started in background" }
```

---

### `POST /api/scrape/trigger/:platform`

Trigger a scrape for a single platform (e.g. `biletix`, `passo`).

**Headers**
```
x-admin-key: <ADMIN_KEY>
```

**Response**
```json
{ "success": true, "message": "Scrape started for platform: biletix" }
```

---

## Error Codes

| Status | Meaning                                              |
|--------|------------------------------------------------------|
| `200`  | Success                                              |
| `400`  | Bad request (invalid query params)                   |
| `401`  | Missing or invalid `x-admin-key`                    |
| `404`  | Resource not found                                   |
| `500`  | Internal server error                                |

---

## Database Tables (reference)

| Table                   | Purpose                                      |
|-------------------------|----------------------------------------------|
| `platforms`             | The 4 ticket platforms (biletix, passo, …)  |
| `events`                | Events being tracked                         |
| `event_platform_links`  | Maps events ↔ platforms + external URLs      |
| `price_snapshots`       | One row per scrape result (time-series)      |
| `scrape_log`            | Success/error log per scrape attempt         |
