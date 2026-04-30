/**
 * Ticketmaster scraper
 *
 * Ticketmaster has a public Discovery API (free tier, 5000 req/day):
 *   https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 *
 * Set TICKETMASTER_API_KEY in .env to enable API mode.
 * Without a key we fall back to HTML scraping (less reliable).
 *
 * TODO: register for a free API key at developer.ticketmaster.com
 */

const axios   = require('axios');
const cheerio = require('cheerio');

const API_BASE = 'https://app.ticketmaster.com/discovery/v2';

function extractEventId(url) {
  if (!url) return null;
  const match = url.match(/event\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

async function scrapeEvent(externalUrl) {
  if (!externalUrl) return null;

  const apiKey  = process.env.TICKETMASTER_API_KEY;
  const eventId = extractEventId(externalUrl);

  // Prefer official API when key + event ID are available
  if (apiKey && eventId) {
    try {
      const { data } = await axios.get(`${API_BASE}/events/${eventId}.json`, {
        params:  { apikey: apiKey },
        timeout: 10_000,
      });

      const priceRanges = data.priceRanges || [];
      const minPrice    = priceRanges.length ? Math.min(...priceRanges.map(r => r.min)) : null;
      const available   = data.dates?.status?.code !== 'offsale';

      return { price: minPrice ? Math.round(minPrice) : null, available };
    } catch {
      // Fall through to HTML scraping
    }
  }

  // HTML fallback
  const { data: html } = await axios.get(externalUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiletBot/1.0)' },
    timeout: 10_000,
  });

  const $ = cheerio.load(html);

  // TODO: update selectors after inspecting Ticketmaster event pages
  const priceText = $('[data-testid="price-range"], .price-level').first().text().trim();
  const soldOut   = $('[data-testid="sold-out"]').length > 0;

  const match = priceText.replace(/\./g, '').match(/(\d+)/);
  const price = match ? parseInt(match[1], 10) : null;

  return { price, available: !soldOut && price !== null };
}

module.exports = { scrapeEvent };
