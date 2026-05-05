const { bestPriceFromText, isUnavailableText, parseLira } = require('../lib/normalize');

async function dismissOverlays(page) {
  const labels = ['Kabul', 'Tümünü Kabul Et', 'Accept', 'Accept All', 'Tamam', 'Anladım'];
  for (const label of labels) {
    const button = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 1_000 }).catch(() => {});
    }
  }
}

async function collectVisiblePrices(page) {
  return page.evaluate(() => {
    const candidates = [];
    const priceLike = /(?:₺|TRY|TL)\s*[\d.,]+|[\d.,]+\s*(?:₺|TRY|TL)/i;
    for (const el of document.querySelectorAll('body *')) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 240 || !priceLike.test(text)) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      candidates.push(text);
    }
    return candidates;
  });
}

async function collect({ page, url }) {
  if (!url) return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await dismissOverlays(page);

    const candidates = await collectVisiblePrices(page);
    let cheapest = null;
    for (const text of candidates) {
      if (isUnavailableText(text)) continue;
      const amount = parseLira(text);
      if (amount !== null && (cheapest === null || amount < cheapest.amount)) {
        cheapest = { status: 'ok', amount, available: true, category: text.slice(0, 120), raw_url: url };
      }
    }

    if (cheapest) return cheapest;
    return { ...bestPriceFromText(await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')), raw_url: url };
  } catch (err) {
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: url, error: err.message };
  }
}

module.exports = { collect };
