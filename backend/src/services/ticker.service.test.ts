import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TickerService } from './ticker.service';
import { TickerModel } from '../models/ticker.model';
import { StockDataProvider } from '../providers/stock-data-provider.interface';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';
import { TickerHistoryModel } from '../models/ticker-history.model';

let mongod: MongoMemoryServer;

const fakeProvider: StockDataProvider = {
  getStockData: async (symbol: string) => ({
    quote: {
      symbol, companyName: `${symbol} Inc.`, sector: 'Technology',
      exchange: 'NASDAQ', country: 'US', currency: 'USD', currentPrice: 100
    },
    financials: {
      symbol,
      freeCashFlowHistory: [10, 11, 12],
      sharesOutstanding: 100,
      bookValuePerShare: 50,
      earningsPerShare: 5,
      earningsGrowthRate: 10,
      currentRatio: 2,
      quickRatio: 1.6,
      dividendsPaidTTM: 20,
      netIncomeTTM: 100
    },
    raw: { quoteSummary: { stub: true }, fundamentalsTimeSeries: [] }
  })
};

const fakeCalculator: FairValueCalculator = {
  calculate: async () => ({
    fairValue: 120,
    assumptions: { growthRate: 0.1, discountRate: 0.09, terminalGrowthRate: 0.025, projectionYears: 10 }
  })
};

const fakeConverter: CurrencyConverter = {
  getRate: async () => 1
};

const failingCalculator: FairValueCalculator = {
  calculate: async () => {
    throw new Error('At least one valid year-over-year comparison with a positive prior-year free cash flow is required for a DCF calculation');
  }
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await TickerModel.deleteMany({});
  await TickerHistoryModel.deleteMany({});
});

test('addTicker creates a new ticker doc with fetched+cached data', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(ticker.symbol).toBe('AAPL');
  expect(ticker.lists).toEqual(['portfolio']);
  expect(ticker.cachedData?.currentPrice).toBe(100);
  expect(ticker.cachedData?.fairValue).toBe(120);
});

test('addTicker normalizes symbol casing so "aapl" then "AAPL" results in one document', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('aapl', 'portfolio');
  const second = await service.addTicker('AAPL', 'watchlist');

  const count = await TickerModel.countDocuments({});
  expect(count).toBe(1);
  expect(second.symbol).toBe('AAPL');
  expect(second.lists.sort()).toEqual(['portfolio', 'watchlist']);
});

test('addTicker stores the canonical symbol Yahoo echoes back, not the raw route param', async () => {
  const echoingProvider: StockDataProvider = {
    getStockData: async (symbol: string) => {
      const base = await fakeProvider.getStockData(symbol);
      return { ...base, quote: { ...base.quote, symbol: symbol.toUpperCase() } };
    }
  };
  const service = new TickerService(echoingProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('  aapl  ', 'portfolio');
  expect(ticker.symbol).toBe('AAPL');
});

test('addTicker adds a second list to an existing ticker instead of duplicating', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');
  const updated = await service.addTicker('AAPL', 'watchlist');

  expect(updated.lists.sort()).toEqual(['portfolio', 'watchlist']);
  const count = await TickerModel.countDocuments({ symbol: 'AAPL' });
  expect(count).toBe(1);
});

test('removeTicker removes only the given list, keeping the doc if still in another list', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');
  await service.addTicker('AAPL', 'watchlist');

  await service.removeTicker('AAPL', 'portfolio');
  const remaining = await TickerModel.findOne({ symbol: 'AAPL' });
  expect(remaining?.lists).toEqual(['watchlist']);
});

test('removeTicker deletes the doc entirely when its last list is removed', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');
  await service.removeTicker('AAPL', 'portfolio');

  const remaining = await TickerModel.findOne({ symbol: 'AAPL' });
  expect(remaining).toBeNull();
});

test('getList returns tickers for the given list, sorted by sector then company name', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('ZZZ', 'portfolio');
  await service.addTicker('AAA', 'portfolio');
  await TickerModel.updateOne({ symbol: 'ZZZ' }, { sector: 'Energy' });
  await TickerModel.updateOne({ symbol: 'AAA' }, { sector: 'Technology' });

  const list = await service.getList('portfolio');
  expect(list.map(t => t.symbol)).toEqual(['ZZZ', 'AAA']); // Energy before Technology
});

test('refreshTicker updates cachedData.fetchedAt to a newer timestamp', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const original = await service.addTicker('AAPL', 'portfolio');
  const originalFetchedAt = original.cachedData!.fetchedAt;

  await new Promise(resolve => setTimeout(resolve, 5));
  const refreshed = await service.refreshTicker('AAPL');

  expect(refreshed.cachedData!.fetchedAt.getTime()).toBeGreaterThan(originalFetchedAt.getTime());
});

test('ensureFresh refreshes a ticker whose cachedData is older than 15 days', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  const staleDate = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000);
  ticker.cachedData!.fetchedAt = staleDate;
  await ticker.save();

  const result = await service.ensureFresh(ticker);
  expect(result.cachedData!.fetchedAt.getTime()).toBeGreaterThan(staleDate.getTime());

  const historyEntries = await TickerHistoryModel.find({ symbol: 'AAPL' });
  expect(historyEntries).toHaveLength(2);
});

test('ensureFresh does not refresh a ticker whose cachedData is within 15 days', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  const freshFetchedAt = ticker.cachedData!.fetchedAt;

  const result = await service.ensureFresh(ticker);
  expect(result.cachedData!.fetchedAt.getTime()).toBe(freshFetchedAt.getTime());

  const historyEntries = await TickerHistoryModel.find({ symbol: 'AAPL' });
  expect(historyEntries).toHaveLength(1);
});

const failingConverter: CurrencyConverter = {
  getRate: async () => { throw new Error('Frankfurter unreachable'); }
};

test('a failed datapoint records an error and leaves every other datapoint intact', async () => {
  const service = new TickerService(fakeProvider, failingCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(ticker.cachedData?.fairValue).toBe(0);
  expect(ticker.cachedData?.nativeFairValue).toBe(0);
  expect(ticker.datapointErrors?.get('fairValue')).toBe(
    'At least one valid year-over-year comparison with a positive prior-year free cash flow is required for a DCF calculation'
  );
  expect(ticker.cachedData?.currentPrice).toBe(100);
  expect(ticker.cachedData?.priceToBook).toBe(2);
  expect(ticker.cachedData?.currentRatio).toBe(2);
});

test('two independent failures each record their own error without affecting the rest', async () => {
  const brokenProvider: StockDataProvider = {
    getStockData: async (symbol: string) => {
      const base = await fakeProvider.getStockData(symbol);
      return {
        ...base,
        financials: { ...base.financials, bookValuePerShare: 0, quickRatio: undefined }
      };
    }
  };
  const service = new TickerService(brokenProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(Object.keys(Object.fromEntries(ticker.datapointErrors!)).sort()).toEqual(['priceToBook', 'quickRatio']);
  expect(ticker.cachedData?.priceToBook).toBe(0);
  expect(ticker.cachedData?.quickRatio).toBe(0);
  expect(ticker.cachedData?.fairValue).toBe(120);
  expect(ticker.cachedData?.currentRatio).toBe(2);
});

test('a successful fetch stores an empty datapointErrors object', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  expect(Object.fromEntries(ticker.datapointErrors!)).toEqual({});
});

test('a refresh replaces the datapointErrors object rather than merging, so recovered datapoints clear', async () => {
  const service = new TickerService(fakeProvider, failingCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  expect(ticker.datapointErrors?.get('fairValue')).toBeDefined();

  const recoveredService = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const refreshed = await recoveredService.refreshTicker('AAPL');

  expect(refreshed.datapointErrors?.get('fairValue')).toBeUndefined();
  expect(refreshed.cachedData?.fairValue).toBe(120);
});

test('refreshTicker updates metadata fields, not just cachedData and datapointErrors', async () => {
  const noNameProvider: StockDataProvider = {
    getStockData: async (symbol: string) => {
      const base = await fakeProvider.getStockData(symbol);
      return { ...base, quote: { ...base.quote, companyName: undefined } };
    }
  };
  const service = new TickerService(noNameProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  expect(ticker.companyName).toBe('Unavailable');
  expect(ticker.datapointErrors?.get('companyName')).toBeDefined();

  const recoveredService = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const refreshed = await recoveredService.refreshTicker('AAPL');

  expect(refreshed.companyName).toBe('AAPL Inc.');
  expect(refreshed.datapointErrors?.get('companyName')).toBeUndefined();
});

test('a failed FX lookup falls back to rate 1 so prices stay in native currency, not zero', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, failingConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(ticker.cachedData?.fxRateToUsd).toBe(1);
  expect(ticker.cachedData?.currentPrice).toBe(100);
  expect(ticker.cachedData?.nativeFairValue).toBe(120);
  expect(ticker.datapointErrors?.get('fxRateToUsd')).toBe('Frankfurter unreachable');
});

test('addTicker writes one history snapshot carrying the raw provider payload', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');

  const history = await TickerHistoryModel.find({ symbol: 'AAPL' });
  expect(history).toHaveLength(1);
  expect((history[0].data as any).currentPrice).toBe(100);
  expect((history[0].stockRawData as any).quoteSummary).toEqual({ stub: true });
});

test('each refresh appends another history snapshot rather than replacing one', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');
  await service.refreshTicker('AAPL');
  await service.refreshTicker('AAPL');
  await service.refreshTicker('AAPL');

  expect(await TickerHistoryModel.countDocuments({ symbol: 'AAPL' })).toBe(4);
});

test('a history snapshot records the datapointErrors from its own fetch', async () => {
  const service = new TickerService(fakeProvider, failingCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');

  const history = await TickerHistoryModel.findOne({ symbol: 'AAPL' });
  expect((history?.datapointErrors as any).fairValue).toBeTruthy();
});

test('a history write failure is logged but does not fail the add', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const createSpy = jest.spyOn(TickerHistoryModel, 'create')
    .mockRejectedValueOnce(new Error('history collection unavailable') as never);

  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(ticker.cachedData?.currentPrice).toBe(100);
  expect(await TickerModel.countDocuments({ symbol: 'AAPL' })).toBe(1);
  createSpy.mockRestore();
});

test('a provider failure still aborts the add entirely and writes nothing', async () => {
  const deadProvider: StockDataProvider = {
    getStockData: async () => { throw new Error('Yahoo unreachable'); }
  };
  const service = new TickerService(deadProvider, fakeCalculator, fakeConverter);

  await expect(service.addTicker('AAPL', 'portfolio')).rejects.toThrow('Yahoo unreachable');
  expect(await TickerModel.countDocuments({ symbol: 'AAPL' })).toBe(0);
  expect(await TickerHistoryModel.countDocuments({ symbol: 'AAPL' })).toBe(0);
});
