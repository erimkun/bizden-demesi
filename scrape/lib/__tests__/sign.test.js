const { signPayload, verifySignature } = require('../sign');

describe('HMAC signing', () => {
  const secret = 'test-secret';
  const payload = { foo: 'bar', n: 42 };

  test('signs and verifies the same payload', () => {
    const sig = signPayload(payload, secret);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySignature(payload, sig, secret)).toBe(true);
  });

  test('rejects tampered payload', () => {
    const sig = signPayload(payload, secret);
    expect(verifySignature({ ...payload, foo: 'baz' }, sig, secret)).toBe(false);
  });

  test('rejects wrong secret', () => {
    const sig = signPayload(payload, secret);
    expect(verifySignature(payload, sig, 'other-secret')).toBe(false);
  });
});
