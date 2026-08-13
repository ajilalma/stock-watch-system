// backend/src/providers/yahoo-finance.provider.live.test.ts
//
// LIVE integration test — hits the real Yahoo Finance API over the network.
// The rest of the suite (yahoo-finance.provider.test.ts) mocks yahoo-finance2's
// response shape, so it can't catch a real mismatch between what we assume the
// API returns and what it actually returns (that mismatch is exactly what
// caused findings #1 and #2 in the final review: `sector` was read from a
// field `quote()` never returns, and `currentAssets`/`currentLiabilities`/
// `inventory` were read from fields `financialData` never returns).
//
// This test is opt-in (RUN_LIVE_TESTS=1) so `npm test` stays fast and
// deterministic in CI / sandboxed environments without outbound network
// access to finance.yahoo.com. Run it explicitly with:
//   RUN_LIVE_TESTS=1 npx jest yahoo-finance.provider.live.test.ts
//
// See final-review-fix-report.md for the actual live values observed while
// verifying findings #1 and #2 (this test asserts the same properties).
import { YahooFinanceProvider } from './yahoo-finance.provider';

const maybeDescribe = process.env.RUN_LIVE_TESTS ? describe : describe.skip;

maybeDescribe('YahooFinanceProvider (live API)', () => {
  jest.setTimeout(30000);

  test('getQuote returns a real, non-"Unknown" sector for AAPL', async () => {
    const provider = new YahooFinanceProvider();
    const quote = await provider.getQuote('AAPL');
    expect(quote.sector).toBeTruthy();
    expect(quote.sector).not.toBe('Unknown');
  });

  test('getFinancials returns structurally sound, distinct current/quick ratios for a retailer (WMT)', async () => {
    const provider = new YahooFinanceProvider();
    const financials = await provider.getFinancials('WMT');
    expect(typeof financials.currentRatio).toBe('number');
    expect(typeof financials.quickRatio).toBe('number');
    expect(Number.isFinite(financials.currentRatio)).toBe(true);
    expect(Number.isFinite(financials.quickRatio)).toBe(true);
    // Quick ratio must NOT be forced equal to current ratio (the bug in
    // finding #2): a retailer holds meaningful inventory, so quickRatio
    // should be strictly less than currentRatio.
    expect(financials.quickRatio).not.toBe(financials.currentRatio);
    expect(financials.quickRatio).toBeLessThan(financials.currentRatio);
  });

  test('getQuote rejects with a distinguishable error for a garbage symbol', async () => {
    const provider = new YahooFinanceProvider();
    await expect(provider.getQuote('ZZZZINVALID123')).rejects.toThrow();
  });
});
