// backend/src/providers/frankfurter.converter.test.ts
import { FrankfurterConverter } from './frankfurter.converter';

describe('FrankfurterConverter', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () =>
      ({
        ok: true,
        json: async () => ({ amount: 1, base: 'INR', date: '2026-08-12', rates: { USD: 0.012 } })
      } as Response)
    );
  });

  test('returns rate from Frankfurter API response', async () => {
    const converter = new FrankfurterConverter();
    const rate = await converter.getRate('INR', 'USD');
    expect(rate).toBe(0.012);
    expect(global.fetch).toHaveBeenCalledWith('https://api.frankfurter.app/latest?from=INR&to=USD');
  });

  test('returns 1 when converting a currency to itself, without calling fetch', async () => {
    const converter = new FrankfurterConverter();
    const rate = await converter.getRate('USD', 'USD');
    expect(rate).toBe(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('throws error when target currency is not in API response', async () => {
    global.fetch = jest.fn(async () =>
      ({
        ok: true,
        json: async () => ({ amount: 1, base: 'INR', date: '2026-08-12', rates: {} })
      } as Response)
    );
    const converter = new FrankfurterConverter();
    await expect(converter.getRate('INR', 'XYZ')).rejects.toThrow('Currency XYZ not found in Frankfurter response');
  });
});
