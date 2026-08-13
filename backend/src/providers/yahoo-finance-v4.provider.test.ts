// backend/src/providers/yahoo-finance-v4.provider.test.ts
import { YahooFinanceV4Provider } from './yahoo-finance-v4.provider';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';

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
  summaryDetail: { dividendRate: 1.0, exDividendDate: '2026-02-01' }
}));

const fundamentalsTimeSeriesMock = jest.fn(async () => ([
  { date: '2024-09-30T00:00:00.000Z', freeCashFlow: 95000000000 },
  { date: '2022-09-30T00:00:00.000Z', freeCashFlow: 85000000000 }, // deliberately out of order
  { date: '2023-09-30T00:00:00.000Z', freeCashFlow: 90000000000 }
]));

// `jest.mock(...)` calls are hoisted above all other module code (even
// above imports), so `default` can't be a `class` reference declared
// elsewhere in this file - class declarations have TDZ, and hoisting would
// reference it before its declaration runs. A plain `function` constructor
// declared here IS itself hoisted by normal JS semantics, so it's safe.
function MockYahooFinance(this: any) {
  this.quoteSummary = (...args: unknown[]) => quoteSummaryMock(...(args as []));
  this.fundamentalsTimeSeries = (...args: unknown[]) => fundamentalsTimeSeriesMock(...(args as []));
}

jest.mock('yahoo-finance2-v4', () => ({
  __esModule: true,
  default: MockYahooFinance
}));

beforeEach(() => {
  quoteSummaryMock.mockClear();
  fundamentalsTimeSeriesMock.mockClear();
});

test('getQuote maps Yahoo v4 price/summaryProfile fields to RawQuote', async () => {
  const provider = new YahooFinanceV4Provider();
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
  const provider = new YahooFinanceV4Provider();
  await expect(provider.getQuote('ZZZZINVALID123')).rejects.toBeInstanceOf(SymbolNotFoundError);
});

test('getQuote throws SymbolNotFoundError when the underlying API reports "not found"', async () => {
  quoteSummaryMock.mockImplementationOnce(async () => {
    throw new Error('Quote not found for symbol: ZZZZINVALID123');
  });
  const provider = new YahooFinanceV4Provider();
  await expect(provider.getQuote('ZZZZINVALID123')).rejects.toBeInstanceOf(SymbolNotFoundError);
});

test('getFinancials maps quoteSummary fields and sorts fundamentalsTimeSeries oldest-first', async () => {
  const provider = new YahooFinanceV4Provider();
  const financials = await provider.getFinancials('AAPL');
  expect(financials.sharesOutstanding).toBe(15000000000);
  expect(financials.currentRatio).toBe(1.1);
  expect(financials.quickRatio).toBe(0.9);
  // Input mock is out of date order; output must be oldest-first regardless
  // (RawFinancials contract), unlike v2's array-order-trusting mapping.
  expect(financials.freeCashFlowHistory).toEqual([85000000000, 90000000000, 95000000000]);
});

test('getFinancials calls fundamentalsTimeSeries with an annual cash-flow query going back 5 years', async () => {
  const provider = new YahooFinanceV4Provider();
  await provider.getFinancials('AAPL');
  expect(fundamentalsTimeSeriesMock).toHaveBeenCalledWith('AAPL', expect.objectContaining({
    type: 'annual',
    module: 'cash-flow'
  }));
});

test('getQuote followed by getFinancials for the same symbol reuses one quoteSummary call', async () => {
  const provider = new YahooFinanceV4Provider();
  await provider.getQuote('AAPL');
  await provider.getFinancials('AAPL');
  expect(quoteSummaryMock).toHaveBeenCalledTimes(1);
});
