import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TickerModel } from './ticker.model';

let mongod: MongoMemoryServer;

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

test('creates and retrieves a ticker with required fields', async () => {
  await TickerModel.create({
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Technology',
    exchange: 'NASDAQ',
    country: 'US',
    nativeCurrency: 'USD',
    lists: ['portfolio']
  });

  const found = await TickerModel.findOne({ symbol: 'AAPL' });
  expect(found?.companyName).toBe('Apple Inc.');
  expect(found?.lists).toContain('portfolio');
});

test('rejects a lists value outside portfolio/watchlist', async () => {
  await expect(
    TickerModel.create({
      symbol: 'BAD',
      companyName: 'Bad Co',
      sector: 'Tech',
      exchange: 'NASDAQ',
      country: 'US',
      nativeCurrency: 'USD',
      lists: ['not-a-real-list']
    })
  ).rejects.toThrow();
});

test('stores a datapointErrors map keyed by datapoint field name', async () => {
  await TickerModel.create({
    symbol: 'BROKEN',
    companyName: 'Broken Co',
    sector: 'Technology',
    exchange: 'NASDAQ',
    country: 'US',
    nativeCurrency: 'USD',
    lists: ['watchlist'],
    datapointErrors: { fairValue: 'No historic data available' }
  });

  const found = await TickerModel.findOne({ symbol: 'BROKEN' });
  expect(found?.datapointErrors?.get('fairValue')).toBe('No historic data available');
});

test('serializes the datapointErrors map to a plain object in JSON', async () => {
  await TickerModel.create({
    symbol: 'BROKEN2',
    companyName: 'Broken Co 2',
    sector: 'Technology',
    exchange: 'NASDAQ',
    country: 'US',
    nativeCurrency: 'USD',
    lists: ['watchlist'],
    datapointErrors: { fairValue: 'No historic data available' }
  });

  const found = await TickerModel.findOne({ symbol: 'BROKEN2' });
  expect(JSON.parse(JSON.stringify(found)).datapointErrors).toEqual({ fairValue: 'No historic data available' });
});
