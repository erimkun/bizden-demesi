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

  $('.ticket-option').each((_, el) => {
    const $el = $(el);
    const isSoldOut = $el.find('.tukendi').length > 0;
    if (isSoldOut) return;

    const hasBuyBtn = $el.find('.satin-al').length > 0;
    if (!hasBuyBtn) return;

    const amount = parseLira($el.find('.fiyat').text());
    const category = $el.find('.kategori').text().trim() || null;
    if (amount !== null && (cheapest === null || amount < cheapest.amount)) {
      cheapest = { amount, available: true, category, status: 'ok' };
    }
  });

  if (cheapest) return cheapest;
  return { amount: null, available: false, category: null, status: 'unavailable' };
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

module.exports = { collect, parsePrice };
