const axios = require('axios');

const API_BASE = 'https://www.eventbriteapi.com/v3';

function pickCheapest(eventResponse) {
  const classes = eventResponse?.ticket_classes || [];
  let cheapest = null;
  for (const tc of classes) {
    if (tc.on_sale_status !== 'AVAILABLE') continue;
    if (!tc.cost) continue;
    const lira = Math.round(tc.cost.value / 100);
    if (cheapest === null || lira < cheapest.amount) {
      cheapest = { amount: lira, available: true, category: tc.name || null, status: 'ok' };
    }
  }
  if (cheapest) return cheapest;
  return { amount: null, available: false, category: null, status: 'unavailable' };
}

async function collect({ apiId }) {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!apiId) {
    return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
  }
  if (!token) {
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: null, error: 'EVENTBRITE_TOKEN not set' };
  }
  try {
    const res = await axios.get(`${API_BASE}/events/${apiId}/`, {
      params: { expand: 'ticket_classes' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
    });
    const price = pickCheapest(res.data);
    return { ...price, raw_url: res.data.url || null };
  } catch (err) {
    const code = err.response?.status;
    if (code === 404) return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: null, error: err.message };
  }
}

module.exports = { collect, pickCheapest };
