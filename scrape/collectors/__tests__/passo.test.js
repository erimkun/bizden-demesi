const fs = require('fs');
const path = require('path');
const { parsePrice } = require('../passo');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures/passo-event.html'),
  'utf8'
);

describe('passo collector', () => {
  test('parsePrice picks cheapest available option', () => {
    const result = parsePrice(fixture);
    expect(result).toEqual({
      amount: 890,
      available: true,
      category: 'Maratoncu',
      status: 'ok',
    });
  });
});
