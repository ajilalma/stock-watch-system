import { YahooFinanceV4Provider } from './yahoo-finance-v4.provider';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';

function makeProvider(summary: any, timeSeries: any[]): YahooFinanceV4Provider {
  const provider = new YahooFinanceV4Provider();
  (provider as any).client = {
    quoteSummary: jest.fn(async () => summary),
    fundamentalsTimeSeries: jest.fn(async () => timeSeries)
  };
  return provider;
}

const FULL_SUMMARY = {
  price: {
    symbol: 'AAPL', longName: 'Apple Inc.', exchangeName: 'NasdaqGS',
    currency: 'USD', regularMarketPrice: 190
  },
  summaryProfile: { sector: 'Technology' },
  defaultKeyStatistics: { sharesOutstanding: 15_000_000_000, bookValue: 4.5, trailingEps: 6.1 },
  financialData: { earningsGrowth: 0.12, currentRatio: 0.98, quickRatio: 0.84, netIncomeToCommon: 97_000_000_000 },
  summaryDetail: { exDividendDate: 1_700_000_000_000, dividendRate: 0.96 }
};

const TIME_SERIES = [
  { date: '2023-09-30', freeCashFlow: 99_000_000_000 },
  { date: '2021-09-30', freeCashFlow: 93_000_000_000 },
  { date: '2022-09-30', freeCashFlow: 111_000_000_000 }
];

test('getStockData returns quote, financials and the raw provider payload from one fetch', async () => {
  const provider = makeProvider(FULL_SUMMARY, TIME_SERIES);
  const result = await provider.getStockData('AAPL');

  expect(result.quote.symbol).toBe('AAPL');
  expect(result.quote.companyName).toBe('Apple Inc.');
  expect(result.quote.currentPrice).toBe(190);
  expect(result.financials.bookValuePerShare).toBe(4.5);
  expect((result.raw as any).quoteSummary).toEqual(FULL_SUMMARY);
  expect((result.raw as any).fundamentalsTimeSeries).toEqual(TIME_SERIES);
});

test('getStockData fetches the quote summary exactly once per call', async () => {
  const provider = makeProvider(FULL_SUMMARY, TIME_SERIES);
  await provider.getStockData('AAPL');
  expect((provider as any).client.quoteSummary).toHaveBeenCalledTimes(1);
});

test('getStockData sorts free cash flow history oldest-first regardless of response order', async () => {
  const provider = makeProvider(FULL_SUMMARY, TIME_SERIES);
  const result = await provider.getStockData('AAPL');
  expect(result.financials.freeCashFlowHistory).toEqual([93_000_000_000, 111_000_000_000, 99_000_000_000]);
});

test('getStockData leaves unresolvable metadata undefined rather than defaulting to a placeholder', async () => {
  const provider = makeProvider(
    { ...FULL_SUMMARY, summaryProfile: undefined, price: { ...FULL_SUMMARY.price, exchangeName: 'SomeUnmappedExchange' } },
    TIME_SERIES
  );
  const result = await provider.getStockData('AAPL');

  expect(result.quote.sector).toBeUndefined();
  expect(result.quote.exchange).toBe('SomeUnmappedExchange');
  expect(result.quote.country).toBeUndefined();
});

test('getStockData throws SymbolNotFoundError when Yahoo reports the symbol is not found', async () => {
  const provider = new YahooFinanceV4Provider();
  (provider as any).client = {
    quoteSummary: jest.fn(async () => { throw new Error('Quote not found for ticker symbol: ZZZZ'); }),
    fundamentalsTimeSeries: jest.fn(async () => [])
  };
  await expect(provider.getStockData('ZZZZ')).rejects.toThrow(SymbolNotFoundError);
});

test('getStockData throws SymbolNotFoundError when the response has no price module', async () => {
  const provider = makeProvider({ summaryProfile: { sector: 'Technology' } }, TIME_SERIES);
  await expect(provider.getStockData('ZZZZ')).rejects.toThrow(SymbolNotFoundError);
});
