// backend/src/providers/yahoo-finance.provider.test.ts
import { YahooFinanceProvider } from './yahoo-finance.provider';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';

// getQuote() and getFinancials() now share a single quoteSummary() call
// (requesting all modules at once) instead of 3 separate Yahoo requests.
const quoteSummaryMock = jest.fn(async () => ({
  price: {
    symbol: 'AAPL',
    longName: 'Apple Inc.',
    exchangeName: 'NASDAQ',
    currency: 'USD',
    regularMarketPrice: 190
  },
  summaryProfile: { sector: 'Technology' },
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
}));

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: {
    quoteSummary: (...args: unknown[]) => quoteSummaryMock(...(args as []))
  }
}));

beforeEach(() => {
  quoteSummaryMock.mockClear();
});

test('getQuote maps Yahoo price/summaryProfile fields to RawQuote', async () => {
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

test('getQuote throws SymbolNotFoundError when Yahoo has no price module for the symbol', async () => {
  quoteSummaryMock.mockImplementationOnce(async () => ({} as any));
  const provider = new YahooFinanceProvider();
  await expect(provider.getQuote('ZZZZINVALID123')).rejects.toBeInstanceOf(SymbolNotFoundError);
});

test('getQuote throws SymbolNotFoundError when the underlying API reports "not found"', async () => {
  quoteSummaryMock.mockImplementationOnce(async () => {
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

test('getQuote followed by getFinancials for the same symbol reuses one quoteSummary call', async () => {
  const provider = new YahooFinanceProvider();
  await provider.getQuote('AAPL');
  await provider.getFinancials('AAPL');
  expect(quoteSummaryMock).toHaveBeenCalledTimes(1);
});

test('requests for different symbols each trigger their own quoteSummary call', async () => {
  const provider = new YahooFinanceProvider();
  await provider.getQuote('AAPL');
  await provider.getQuote('MSFT');
  expect(quoteSummaryMock).toHaveBeenCalledTimes(2);
});
