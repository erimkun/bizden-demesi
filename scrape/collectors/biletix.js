const cheerio = require('cheerio');
const { createPolite } = require('../lib/http');

const http = createPolite();

function parseLira(text) {
  if (!text) return null;
  const cleaned = text.replace(/\./g, '').replace(/[^\d]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function parsePrice(html) {
  const $ = cheerio.load(html);
  let cheapest = null;

  $('.ticket-row').each((_, row) => {
    const $row = $(row);
    const availabilityText = $row.find('.availability').text().trim().toLowerCase();
    const isAvailable = availabilityText.includes('mevcut');
    if (!isAvailable) return;

    const amount = parseLira($row.find('.price-amount').text());
    const category = $row.attr('data-category') || null;
    if (amount !== null && (cheapest === null || amount < cheapest.amount)) {
      cheapest = { amount, available: true, category, status: 'ok' };
    }
  });

  if (cheapest) return cheapest;
  return { amount: null, available: false, category: null, status: 'unavailable' };
}

function parseMetadata(html) {
  const $ = cheerio.load(html);
  return {
    name: $('meta[property="og:title"]').attr('content') || null,
    image_url: $('meta[property="og:image"]').attr('content') || null,
    venue: $('.event-venue').text().trim() || null,
    date_text: $('.event-date').text().trim() || null,
  };
}

async function collect({ url }) {
  if (!url) return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
  try {
    const res = await http.get(url);
    const price = parsePrice(res.data);
    return { ...price, raw_url: url };
  } catch (err) {
    const code = err.response?.status;
    const status = code === 403 || code === 429 ? 'blocked' : 'unavailable';
    return { status, amount: null, available: false, category: null, raw_url: url, error: err.message };
  }
}

async function fetchMetadata(url) {
  if (!url) return null;
  const res = await http.get(url);
  return parseMetadata(res.data);
}

module.exports = { collect, fetchMetadata, parsePrice, parseMetadata };
