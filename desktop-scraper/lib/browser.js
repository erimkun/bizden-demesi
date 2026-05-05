const path = require('path');
const { chromium } = require('playwright');

function browserProfileArgs() {
  const args = ['--disable-blink-features=AutomationControlled'];
  if (process.env.CHROME_PROFILE) {
    args.push(`--profile-directory=${process.env.CHROME_PROFILE}`);
  }
  return args;
}

async function launchBrowser({ headed = false } = {}) {
  const userDataDir = process.env.CHROME_USER_DATA_DIR ||
    path.join(__dirname, '..', '.browser-profile');

  const options = {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: !headed,
    viewport: { width: 1366, height: 900 },
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    args: browserProfileArgs(),
  };

  try {
    return await chromium.launchPersistentContext(userDataDir, options);
  } catch (err) {
    if (process.env.PLAYWRIGHT_CHANNEL) throw err;
    console.warn(`[desktop-scraper] Chrome channel unavailable, falling back to bundled Chromium: ${err.message}`);
    const { channel, ...fallbackOptions } = options;
    return chromium.launchPersistentContext(userDataDir, fallbackOptions);
  }
}

module.exports = { launchBrowser };
