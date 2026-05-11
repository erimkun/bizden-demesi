const bubilet = require('../bubilet');
const biletino = require('../biletino');
const mobilet = require('../mobilet');

function fakePage({ candidates = [], bodyText = '' } = {}) {
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue(candidates),
    getByRole: jest.fn().mockReturnValue({
      first: () => ({
        isVisible: jest.fn().mockResolvedValue(false),
        click: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    locator: jest.fn().mockReturnValue({
      innerText: jest.fn().mockResolvedValue(bodyText),
    }),
  };
}

describe('desktop collectors', () => {
  const collectors = [
    ['bubilet', bubilet],
    ['biletino', biletino],
    ['mobilet', mobilet],
  ];

  test.each(collectors)('%s returns the cheapest visible ticket price', async (_name, collector) => {
    const page = fakePage({
      candidates: [
        'VIP Bilet TL 1.250',
        'Genel Alan 450 TL',
        'Servis bedeli 99 TL tükendi',
      ],
    });

    const result = await collector.collect({ page, url: 'https://example.test/event' });

    expect(result).toMatchObject({
      status: 'ok',
      amount: 450,
      available: true,
      raw_url: 'https://example.test/event',
    });
    expect(result.category).toContain('Genel Alan');
    expect(page.goto).toHaveBeenCalledWith(
      'https://example.test/event',
      expect.objectContaining({ waitUntil: 'domcontentloaded' })
    );
  });

  test.each(collectors)('%s falls back to body text when visible candidates are empty', async (_name, collector) => {
    const page = fakePage({ bodyText: 'Standart bilet 720 TL' });

    const result = await collector.collect({ page, url: 'https://example.test/fallback' });

    expect(result).toMatchObject({
      status: 'ok',
      amount: 720,
      available: true,
      raw_url: 'https://example.test/fallback',
    });
  });
});
