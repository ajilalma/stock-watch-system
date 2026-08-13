// backend/src/providers/yahoo-finance.provider.test.ts
import { YahooFinanceProvider } from './yahoo-finance.provider';

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: {
    quote: jest.fn(async () => ({
      symbol: 'AAPL',
      longName: 'Apple Inc.',
      sector: 'Technology',
      fullExchangeName: 'NASDAQ',
      currency: 'USD',
      regularMarketPrice: 190
    })),
    quoteSummary: jest.fn(async () => ({
      defaultKeyStatistics: { sharesOutstanding: 15000000000, bookValue: 4.5 },
      financialData: { currentRatio: 1.1, quickRatio: 0.9, earningsGrowth: 0.08 },
      summaryDetail: {
        payoutRatio: 0.16,
        dividendRate: 1.0,
        priceToBook: 42
      },
      // Yahoo returns this array newest-first (verified empirically against
      // the live API, see task-6-report.md "Fix round 1"): index 0 is the
      // most recent period.
      cashflowStatementHistory: {
        cashflowStatements: [
          { freeCashFlow: 95000000000 }, // most recent
          { freeCashFlow: 90000000000 }  // prior period
        ]
      }
    }))
  }
}));

test('getQuote maps Yahoo quote fields to RawQuote', async () => {
  const provider = new YahooFinanceProvider();
  const quote = await provider.getQuote('AAPL');
  expect(quote).toEqual({
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Technology',
    exchange: 'NASDAQ',
    country: expect.any(String),
    currency: 'USD',
    currentPrice: 190
  });
});

test('getFinancials maps Yahoo quoteSummary fields to RawFinancials', async () => {
  const provider = new YahooFinanceProvider();
  const financials = await provider.getFinancials('AAPL');
  expect(financials.sharesOutstanding).toBe(15000000000);
  // Output is oldest-first, most-recent-last (RawFinancials contract), which
  // reverses the newest-first mock input above.
  expect(financials.freeCashFlowHistory).toEqual([90000000000, 95000000000]);
});
