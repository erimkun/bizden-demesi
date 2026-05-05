# `events-to-track.json` — Schema

Curated list of events the runners should track. Edit this file and push to update.

```json
[
  {
    "internal_name": "stable-slug-for-this-event",

    "name":      "Display name (optional — frontend will use this if no enrichment runs)",
    "venue":     "Venue name (optional)",
    "date":      "Date string (optional, free-form)",
    "image_url": "Full image URL (optional)",

    "eventbrite_id":   "1234567890",
    "ticketmaster_id": "K8vZ9171Sa7",

    "biletix_url": "https://www.biletix.com/etkinlik/.../TURKIYE/tr",
    "passo_url":   "https://www.passo.com.tr/..."
  }
]
```

## Which fields do which runners use?

- **GitHub Actions cloud runner** (every 4h): reads `eventbrite_id` and `ticketmaster_id`. Skips events with neither set.
- **Phase 4 desktop scraper** (your PC): reads `biletix_url` and `passo_url`. Authenticates via your logged-in browser session.

Both runners share `internal_name` to write into the same event row.

## How to find IDs

### Automatic Eventbrite discovery
Run the discovery command to scan public Eventbrite Turkey listing pages and merge new event IDs into `events-to-track.json`.

```bash
npm run discover:eventbrite:dry
npm run discover:eventbrite
```

Useful options:

```bash
npm run discover:eventbrite:dry -- --pages 2 --max 25
npm run discover:eventbrite -- --urls "https://www.eventbrite.com/d/turkey/istanbul/,https://www.eventbrite.com/d/turkey/antalya/"
```

If `EVENTBRITE_TOKEN` is set, discovery enriches each found ID with Eventbrite API metadata. Without a token, it still extracts IDs and readable names from public event URLs.

### Eventbrite
1. Go to https://www.eventbrite.com/d/turkey--all-locations/all-events/
2. Click into an event
3. Look at the URL — last numeric segment is the ID. Example: `eventbrite.com/e/sample-event-1234567890` → `eventbrite_id: "1234567890"`

### Ticketmaster
1. Go to https://www.ticketmaster.com/discover/concerts/turkey
2. Click into an event
3. The URL contains `/event/<ID>` — that's the ID. Example: `ticketmaster.com/event/K8vZ9171Sa7` → `ticketmaster_id: "K8vZ9171Sa7"`
