const STORAGE_KEY = 'bk_price_history';
const LAST_FETCH_KEY = 'bk_last_fetch';
const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function getLastFetchTime() {
  const stored = localStorage.getItem(LAST_FETCH_KEY);
  return stored ? new Date(parseInt(stored)) : null;
}

export function setLastFetchTime(date = new Date()) {
  localStorage.setItem(LAST_FETCH_KEY, date.getTime().toString());
}

export function getNextFetchTime() {
  const last = getLastFetchTime();
  if (!last) return new Date();
  return new Date(last.getTime() + UPDATE_INTERVAL_MS);
}

export function isDueForUpdate() {
  const next = getNextFetchTime();
  return new Date() >= next;
}

export function getTimeUntilUpdate() {
  const next = getNextFetchTime();
  const diff = Math.max(0, next.getTime() - Date.now());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { h, m, s, diff };
}

export function savePriceSnapshot(events) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const timestamp = Date.now();
    events.forEach(ev => {
      if (!existing[ev.id]) existing[ev.id] = {};
      Object.entries(ev.prices).forEach(([platform, data]) => {
        if (!data.available || data.amount === null) return;
        if (!existing[ev.id][platform]) existing[ev.id][platform] = [];
        existing[ev.id][platform].push({ t: timestamp, p: data.amount });
        if (existing[ev.id][platform].length > 100) {
          existing[ev.id][platform] = existing[ev.id][platform].slice(-100);
        }
      });
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn('localStorage write failed', e);
  }
}

export function getStoredHistory(eventId, platform) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return (all[eventId]?.[platform] || []).map(entry => entry.p);
  } catch {
    return [];
  }
}

export function getBestPrice(prices) {
  const vals = Object.values(prices)
    .filter(p => p.available && p.amount !== null)
    .map(p => p.amount);
  if (!vals.length) return null;
  return Math.min(...vals);
}

export function getCheapestPlatform(prices) {
  let min = Infinity;
  let best = null;
  Object.entries(prices).forEach(([id, data]) => {
    if (data.available && data.amount !== null && data.amount < min) {
      min = data.amount;
      best = id;
    }
  });
  return best;
}

export function getPriceChange(history) {
  if (!history || history.length < 2) return 0;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (!prev) return 0;
  return parseFloat(((last - prev) / prev * 100).toFixed(1));
}

export function get24hChange(history) {
  if (!history || history.length < 24) return 0;
  const last = history[history.length - 1];
  const dayAgo = history[history.length - 24] || history[0];
  if (!dayAgo) return 0;
  return parseFloat(((last - dayAgo) / dayAgo * 100).toFixed(1));
}

const TR_MONTHS = {
  ocak: 0,
  subat: 1,
  şubat: 1,
  mart: 2,
  nisan: 3,
  mayis: 4,
  mayıs: 4,
  haziran: 5,
  temmuz: 6,
  agustos: 7,
  ağustos: 7,
  eylul: 8,
  eylül: 8,
  ekim: 9,
  kasim: 10,
  kasım: 10,
  aralik: 11,
  aralık: 11,
};

export function parseEventDate(value) {
  if (!value) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (iso) {
    const [, y, m, d, hh = '23', mm = '59'] = iso;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
  }

  const tr = text.toLocaleLowerCase('tr-TR').match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})(?:.*?(\d{1,2}):(\d{2}))?/i);
  if (tr) {
    const [, d, monthName, y, hh = '23', mm = '59'] = tr;
    const month = TR_MONTHS[monthName];
    if (month !== undefined) return new Date(Number(y), month, Number(d), Number(hh), Number(mm));
  }

  return null;
}

export function isEventPast(event, now = new Date()) {
  const date = parseEventDate(event?.date);
  return date ? date.getTime() < now.getTime() : false;
}

export function formatPrice(amount) {
  if (amount === null || amount === undefined) return '—';
  return '₺' + amount.toLocaleString('tr-TR');
}

export function formatTime(date) {
  if (!date) return '—';
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
