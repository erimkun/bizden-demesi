const crypto = require('crypto');

function canonicalize(payload) {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function signPayload(payload, secret) {
  const canonical = canonicalize(payload);
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

function verifySignature(payload, signature, secret) {
  const expected = signPayload(payload, secret);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

module.exports = { signPayload, verifySignature };
