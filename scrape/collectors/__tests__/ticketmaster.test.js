const fs = require('fs');
const path = require('path');
const { extractPrice } = require('../ticketmaster');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/ticketmaster-response.json'),
  'utf8'
));

describe('ticketmaster collector', () => {
  test('extractPrice returns min of priceRanges when on sale', () => {
    const result = extractPrice(fixture);
    expect(result).toEqual({
      amount: 270,
      available: true,
      category: 'standard',
      status: 'ok',
    });
  });

  test('extractPrice marks offsale events as unavailable', () => {
    const offSale = {
      ...fixture,
      dates: { status: { code: 'offsale' } },
    };
    expect(extractPrice(offSale)).toEqual({
      amount: null, available: false, category: null, status: 'unavailable',
    });
  });

  test('extractPrice returns unavailable when no priceRanges', () => {
    expect(extractPrice({ dates: { status: { code: 'onsale' } } })).toEqual({
      amount: null, available: false, category: null, status: 'unavailable',
    });
  });
});
