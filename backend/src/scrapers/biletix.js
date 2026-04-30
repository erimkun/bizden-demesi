/**
 * Biletix scraper
 *
 * Biletix renders pages server-side, so axios + cheerio is sufficient.
 * Each event link is stored in event_platform_links.external_url.
 *
 * TODO: confirm selectors against live pages before enabling in production.
 */

const axios   = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.biletix.com';

// Scrape a single event page and return { price, available }
async function scrapeEvent(externalUrl) {
  if (!externalUrl) return null;

  const { data: html } = await axios.get(externalUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiletBot/1.0)' },
    timeout: 10_000,
  });

  const $ = cheerio.load(html);

  // TODO: update these selectors after inspecting Biletix event pages
  const priceText = $('[data-testid="ticket-price"], .ticket-price, .price-amount').first().text().trim();
  const soldOut   = $('[data-testid="sold-out"], .sold-out-badge').length > 0;

  // Parse "1.250 TL" or "1250 ₺" → integer lira
  const match = priceText.replace(/\./g, '').match(/(\d+)/);
  const price = match ? parseInt(match[1], 10) : null;

  return { price, available: !soldOut && price !== null };
}

// Search Biletix for events and return basic listing data
// Used in future discovery mode (not yet wired to the job)
async function searchEvents(query) {
  const url = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiletBot/1.0)' },
    timeout: 10_000,
  });

  const $ = cheerio.load(html);
  const results = [];

  // TODO: update selectors after inspecting Biletix search result pages
  $('[data-testid="event-card"], .event-listing-item').each((_, el) => {
    results.push({
      name:  $(el).find('.event-title, h3').first().text().trim(),
      url:   BASE_URL + $(el).find('a').first().attr('href'),
      price: $(el).find('.price').first().text().trim(),
    });
  });

  return results;
}

module.exports = { scrapeEvent, searchEvents };
