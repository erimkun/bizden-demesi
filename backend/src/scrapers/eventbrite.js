/**
 * Eventbrite scraper
 *
 * Eventbrite has a public API (no key required for basic event reads):
 *   https://www.eventbriteapi.com/v3/events/{id}/
 *
 * If we have an event's Eventbrite ID we can hit the API directly.
 * For events where only a URL is stored we fall back to HTML scraping.
 *
 * TODO: store Eventbrite event IDs in event_platform_links once discovered.
 */

const axios   = require('axios');
const cheerio = require('cheerio');

const API_BASE = 'https://www.eventbriteapi.com/v3';

// Extract numeric event ID from an Eventbrite URL
function extractEventId(url) {
  if (!url) return null;
  const match = url.match(/-(\d+)\/?$/);
  return match ? match[1] : null;
}

async function scrapeEvent(externalUrl) {
  if (!externalUrl) return null;

  const eventId = extractEventId(externalUrl);

  // Prefer public API when we have an event ID
  if (eventId) {
    try {
      const { data } = await axios.get(`${API_BASE}/events/${eventId}/`, { timeout: 10_000 });
      const isFree      = data.is_free;
      const isSoldOut   = data.status === 'sold_out' || data.capacity_is_custom;
      const priceDisplay = data.ticket_availability?.minimum_ticket_price?.display;
      const match = priceDisplay ? priceDisplay.replace(/\./g, '').match(/(\d+)/) : null;
      const price = isFree ? 0 : (match ? parseInt(match[1], 10) : null);
      return { price, available: !isSoldOut };
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

  // TODO: update selectors after inspecting Eventbrite event pages
  const priceText = $('[data-testid="listing-ticket-quantity-picker"] .eds-text-bm, .ticket-price').first().text().trim();
  const soldOut   = $('[data-testid="sold-out-label"]').length > 0;

  const match = priceText.replace(/\./g, '').match(/(\d+)/);
  const price = match ? parseInt(match[1], 10) : null;

  return { price, available: !soldOut && price !== null };
}

module.exports = { scrapeEvent };
