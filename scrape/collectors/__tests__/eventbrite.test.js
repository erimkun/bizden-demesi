const fs = require('fs');
const path = require('path');
const { pickCheapest } = require('../eventbrite');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/eventbrite-response.json'),
  'utf8'
));

describe('eventbrite collector', () => {
  test('pickCheapest returns lowest available ticket in lira', () => {
    const result = pickCheapest(fixture);
    expect(result).toEqual({
      amount: 1320,
      available: true,
      category: 'General',
      status: 'ok',
    });
  });

  test('pickCheapest returns unavailable when all sold out', () => {
    const allSoldOut = {
      ticket_classes: [
        { name: 'A', cost: { value: 1000, currency: 'TRY' }, on_sale_status: 'SOLD_OUT' },
      ],
    };
    expect(pickCheapest(allSoldOut)).toEqual({
      amount: null, available: false, category: null, status: 'unavailable',
    });
  });
});
