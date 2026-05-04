const { createPolite } = require('../http');

describe('polite HTTP client', () => {
  test('rate-limits to 1 request per second per host', async () => {
    const client = createPolite({ minIntervalMs: 1000 });
    const t0 = Date.now();
    await client.delay('biletix.com');
    await client.delay('biletix.com');
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(1000);
  });

  test('does not delay across different hosts', async () => {
    const client = createPolite({ minIntervalMs: 1000 });
    const t0 = Date.now();
    await client.delay('biletix.com');
    await client.delay('passo.com.tr');
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(500);
  });
});
