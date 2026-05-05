const crypto = require('crypto');

function canonicalize(payload) {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function signPayload(payload, secret) {
  const canonical = canonicalize(payload);
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

module.exports = { signPayload };
