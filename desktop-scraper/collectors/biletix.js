const { isUnavailableText, parseLira } = require('../lib/normalize');

const PRICE_RE = /(?:₺|TRY|TL)\s*[\d.,]+|[\d.,]+\s*(?:₺|TRY|TL)/gi;
const BOILERPLATE_RE = /sepet|sipariş|siparis|bedeli|kampanya|indirim|profil|yansıtılır|yansitilir/i;

async function dismissOverlays(page) {
  const labels = ['Kabul ediyorum', 'Kabul', 'Tümünü Kabul Et', 'Accept', 'Accept All', 'Tamam'];
  for (const label of labels) {
    const button = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 1_000 }).catch(() => {});
    }
  }
}

async function revealStandardPrices(page) {
  const standardPrices = page.getByText('Standart Bilet Fiyatlarını Gör', { exact: false }).first();
  if (await standardPrices.isVisible().catch(() => false)) {
    await standardPrices.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
  }
}

function parseTicketPrices(text) {
  const candidates = [];
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (BOILERPLATE_RE.test(line) || isUnavailableText(line)) continue;

    const matches = line.match(PRICE_RE) || [];
    for (const rawPrice of matches) {
      const amount = parseLira(rawPrice);
      if (amount === null) continue;
      const category = line.replace(rawPrice, '').replace(/\s*[-:]\s*$/, '').trim() ||
        (i > 0 && !BOILERPLATE_RE.test(lines[i - 1]) ? lines[i - 1] : null);
      candidates.push({ status: 'ok', amount, available: true, category });
    }
  }

  candidates.sort((a, b) => a.amount - b.amount);
  return candidates[0] || null;
}

async function collectDropdownPriceText(page) {
  const texts = [];
  const selects = page.locator('mat-select,.mat-select,[role="combobox"]');
  const count = await selects.count().catch(() => 0);

  for (let i = 0; i < count; i++) {
    const select = selects.nth(i);
    if (!(await select.isVisible().catch(() => false))) continue;

    await select.scrollIntoViewIfNeeded().catch(() => {});
    await select.click({ timeout: 3_000, force: true }).catch(() => {});
    await page.waitForTimeout(500);

    const optionTexts = await page
      .locator('mat-option,[role="option"],.mat-option')
      .evaluateAll((options) => options.map((option) => (option.textContent || '').replace(/\s+/g, ' ').trim()))
      .catch(() => []);

    for (const optionText of optionTexts) {
      if (PRICE_RE.test(optionText)) texts.push(optionText);
      PRICE_RE.lastIndex = 0;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
  }

  return texts.join('\n');
}

async function collect({ page, url }) {
  if (!url) return { status: 'not_found', amount: null, available: false, category: null, raw_url: null };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await dismissOverlays(page);
    await revealStandardPrices(page);

    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
    const dropdownText = await collectDropdownPriceText(page);
    const cheapest = parseTicketPrices(`${bodyText}\n${dropdownText}`);

    if (cheapest) return cheapest;
    return { status: isUnavailableText(bodyText) ? 'sold_out' : 'not_found', amount: null, available: false, category: null, raw_url: url };
  } catch (err) {
    return { status: 'unavailable', amount: null, available: false, category: null, raw_url: url, error: err.message };
  }
}

module.exports = { collect, parseTicketPrices };
