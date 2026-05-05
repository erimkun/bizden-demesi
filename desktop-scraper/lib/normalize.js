function parseLira(text) {
  if (!text) return null;

  const matches = String(text).match(/(?:₺|TRY|TL)\s*[\d.,]+|[\d.,]+\s*(?:₺|TRY|TL)/gi) || [];
  const values = matches
    .map((raw) => raw.replace(/(?:₺|TRY|TL)/gi, '').trim())
    .map((raw) => {
      const normalized = raw
        .replace(/\s/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.')
        .replace(/[^\d.]/g, '');
      const value = Number.parseFloat(normalized);
      return Number.isFinite(value) ? Math.round(value) : null;
    })
    .filter((value) => value !== null && value > 0);

  if (!values.length) return null;
  return Math.min(...values);
}

function isUnavailableText(text) {
  return /tükendi|tukendi|satışa kapalı|satisa kapali|sold out|unavailable/i.test(String(text || ''));
}

function bestPriceFromText(text) {
  const amount = parseLira(text);
  if (amount === null) {
    return { status: isUnavailableText(text) ? 'unavailable' : 'not_found', amount: null, available: false, category: null };
  }
  return { status: 'ok', amount, available: true, category: null };
}

module.exports = { bestPriceFromText, isUnavailableText, parseLira };
