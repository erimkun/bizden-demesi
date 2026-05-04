const axios = require('axios');

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function createPolite({ minIntervalMs = 1000 } = {}) {
  const lastHitByHost = new Map();

  async function delay(host) {
    const last = lastHitByHost.get(host) || 0;
    const wait = Math.max(0, last + minIntervalMs - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastHitByHost.set(host, Date.now());
  }

  async function get(url, opts = {}) {
    const host = new URL(url).host;
    await delay(host);
    return axios.get(url, {
      timeout: 15_000,
      headers: { 'User-Agent': DEFAULT_UA, ...(opts.headers || {}) },
      ...opts,
    });
  }

  return { get, delay };
}

module.exports = { createPolite, DEFAULT_UA };
