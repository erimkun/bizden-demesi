const fs = require('fs');
const path = require('path');
const { parsePrice, parseMetadata } = require('../biletix');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures/biletix-event.html'),
  'utf8'
);

describe('biletix collector', () => {
  test('parsePrice extracts cheapest available ticket', () => {
    const result = parsePrice(fixture);
    expect(result).toEqual({
      amount: 1250,
      available: true,
      category: 'Genel Alan',
      status: 'ok',
    });
  });

  test('parseMetadata extracts title, venue, date, image', () => {
    const meta = parseMetadata(fixture);
    expect(meta.name).toBe('Sezen Aksu — Yeni Dünya Turnesi');
    expect(meta.image_url).toBe('https://www.biletix.com/img/sezen.jpg');
    expect(meta.venue).toContain('Ülker Stadyum');
  });
});
