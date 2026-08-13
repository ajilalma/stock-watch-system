// backend/src/providers/yahoo-finance.provider.test.ts
import { YahooFinanceProvider } from './yahoo-finance.provider';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';

const quoteMock = jest.fn(async () => ({
  symbol: 'AAPL',
  longName: 'Apple Inc.',
  fullExchangeName: 'NASDAQ',
  currency: 'USD',
  regularMarketPrice: 190
}));

// quoteSummary is called twice by the provider: once from getQuote() (just
// for the `summaryProfile` module, to get `sector`) and once from
// getFinancials() (for the other modules). Branch on the requested modules
// like the real API effectively does (different modules, different data).
const quoteSummaryMock = jest.fn(async (_symbol: string, opts: { modules: string[] }) => {
  if (opts.modules.includes('summaryProfile')) {
    return { summaryProfile: { sector: 'Technology' } };
  }
  return {
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
  };
});

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: {
    quote: (...args: unknown[]) => quoteMock(...(args as [])),
    quoteSummary: (...args: unknown[]) => quoteSummaryMock(...(args as [string, { modules: string[] }]))
  }
}));

beforeEach(() => {
  quoteMock.mockClear();
  quoteSummaryMock.mockClear();
});

test('getQuote maps Yahoo quote fields to RawQuote, with sector from the summaryProfile module', async () => {
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

test('getQuote throws SymbolNotFoundError when Yahoo has no quote for the symbol', async () => {
  quoteMock.mockImplementationOnce(async () => undefined as any);
  const provider = new YahooFinanceProvider();
  await expect(provider.getQuote('ZZZZINVALID123')).rejects.toBeInstanceOf(SymbolNotFoundError);
});

test('getQuote throws SymbolNotFoundError when the underlying API reports "not found"', async () => {
  quoteMock.mockImplementationOnce(async () => {
    throw new Error('Quote not found for symbol: ZZZZINVALID123');
  });
  const provider = new YahooFinanceProvider();
  await expect(provider.getQuote('ZZZZINVALID123')).rejects.toBeInstanceOf(SymbolNotFoundError);
});

test('getFinancials maps Yahoo quoteSummary fields to RawFinancials', async () => {
  const provider = new YahooFinanceProvider();
  const financials = await provider.getFinancials('AAPL');
  expect(financials.sharesOutstanding).toBe(15000000000);
  // Output is oldest-first, most-recent-last (RawFinancials contract), which
  // reverses the newest-first mock input above.
  expect(financials.freeCashFlowHistory).toEqual([90000000000, 95000000000]);
});

test('getFinancials passes through Yahoo-computed currentRatio and quickRatio as distinct values', async () => {
  const provider = new YahooFinanceProvider();
  const financials = await provider.getFinancials('AAPL');
  expect(financials.currentRatio).toBe(1.1);
  expect(financials.quickRatio).toBe(0.9);
  expect(financials.quickRatio).not.toBe(financials.currentRatio);
});
