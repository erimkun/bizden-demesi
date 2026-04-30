/**
 * Passo scraper
 *
 * Passo (passo.com.tr) is largely server-side rendered.
 * axios + cheerio should be sufficient; upgrade to Playwright if content
 * turns out to be JS-rendered.
 *
 * TODO: confirm selectors against live pages before enabling in production.
 */

const axios   = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.passo.com.tr';

async function scrapeEvent(externalUrl) {
  if (!externalUrl) return null;

  const { data: html } = await axios.get(externalUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiletBot/1.0)' },
    timeout: 10_000,
  });

  const $ = cheerio.load(html);

  // TODO: update these selectors after inspecting Passo event pages
  const priceText = $('.ticket-price, .price-tag, [class*="price"]').first().text().trim();
  const soldOut   = $('.sold-out, [class*="sold"]').length > 0;

  const match = priceText.replace(/\./g, '').match(/(\d+)/);
  const price = match ? parseInt(match[1], 10) : null;

  return { price, available: !soldOut && price !== null };
}

async function searchEvents(query) {
  const url = `${BASE_URL}/arama?q=${encodeURIComponent(query)}`;
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiletBot/1.0)' },
    timeout: 10_000,
  });

  const $ = cheerio.load(html);
  const results = [];

  // TODO: update selectors after inspecting Passo search result pages
  $('.event-card, [class*="event-item"]').each((_, el) => {
    results.push({
      name:  $(el).find('h2, h3, .event-name').first().text().trim(),
      url:   BASE_URL + $(el).find('a').first().attr('href'),
      price: $(el).find('[class*="price"]').first().text().trim(),
    });
  });

  return results;
}

module.exports = { scrapeEvent, searchEvents };
