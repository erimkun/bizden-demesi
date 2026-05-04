const axios = require('axios');

const API_BASE = 'https://app.ticketmaster.com/discovery/v2';

function extractPrice(eventResponse) {
  const onSale = eventResponse?.dates?.status?.code === 'onsale';
  const ranges = eventResponse?.priceRanges || [];
  if (!onSale || ranges.length === 0) {
    return { amount: null, available: false, category: null, status: 'unavailable' };
  }
  const min = Math.min(...ranges.map(r => r.min).filter(n => Number.isFinite(n)));
  if (!Number.isFinite(min)) {
    return { amount: null, available: false, category: null, status: 'unavailable' };
  }
  return {
    amount: Math.round(min),
    available: true,
    category: ranges[0].type || null,
    status: 'ok',
  };
}

async function collect({ apiId }) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiId) {
    return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
  }
  if (!apiKey) {
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: null, error: 'TICKETMASTER_API_KEY not set' };
  }
  try {
    const res = await axios.get(`${API_BASE}/events/${apiId}.json`, {
      params: { apikey: apiKey },
      timeout: 15_000,
    });
    const price = extractPrice(res.data);
    return { ...price, raw_url: res.data.url || null };
  } catch (err) {
    const code = err.response?.status;
    if (code === 404) return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: null, error: err.message };
  }
}

module.exports = { collect, extractPrice };
