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
  getQuote: async (symbol: string) => ({
    symbol, companyName: `${symbol} Inc.`, sector: 'Technology',
    exchange: 'NASDAQ', country: 'US', currency: 'USD', currentPrice: 100
  }),
  getFinancials: async (symbol: string) => ({
    symbol,
    freeCashFlowHistory: [10, 11, 12],
    sharesOutstanding: 100,
    bookValuePerShare: 50,
    earningsPerShare: 5,
    earningsGrowthRate: 10,
    currentAssets: 200,
    currentLiabilities: 100,
    inventory: 20,
    dividendsPaidTTM: 20,
    netIncomeTTM: 100
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
});

test('addTicker creates a new ticker doc with fetched+cached data', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(ticker.symbol).toBe('AAPL');
  expect(ticker.lists).toEqual(['portfolio']);
  expect(ticker.cachedData?.currentPrice).toBe(100);
  expect(ticker.cachedData?.fairValue).toBe(120);
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

afterEach(async () => {
  await TickerHistoryModel.deleteMany({});
});

test('refreshTicker archives the previous cachedData into tickerHistory before overwriting', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const original = await service.addTicker('AAPL', 'portfolio');
  const originalFetchedAt = original.cachedData!.fetchedAt;

  await service.refreshTicker('AAPL');

  const historyEntries = await TickerHistoryModel.find({ symbol: 'AAPL' });
  expect(historyEntries).toHaveLength(1);
  expect(historyEntries[0].data.currentPrice).toBe(original.cachedData!.currentPrice);
  expect(historyEntries[0].archivedAt.getTime()).toBe(originalFetchedAt.getTime());
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
  expect(historyEntries).toHaveLength(1);
});

test('ensureFresh does not refresh a ticker whose cachedData is within 15 days', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  const freshFetchedAt = ticker.cachedData!.fetchedAt;

  const result = await service.ensureFresh(ticker);
  expect(result.cachedData!.fetchedAt.getTime()).toBe(freshFetchedAt.getTime());

  const historyEntries = await TickerHistoryModel.find({ symbol: 'AAPL' });
  expect(historyEntries).toHaveLength(0);
});
