import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TickerHistoryModel } from './ticker-history.model';

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
  await TickerHistoryModel.deleteMany({});
});

test('stores a snapshot with its errors and the raw provider payload', async () => {
  await TickerHistoryModel.create({
    symbol: 'AAPL',
    archivedAt: new Date('2026-08-14T00:00:00Z'),
    data: { fetchedAt: new Date('2026-08-14T00:00:00Z'), currentPrice: 190, fairValue: 0 },
    errors: { fairValue: 'No historic data available' },
    stockRawData: { quoteSummary: { price: { regularMarketPrice: 190 } }, fundamentalsTimeSeries: [] }
  });

  const found = await TickerHistoryModel.findOne({ symbol: 'AAPL' });
  expect((found?.data as any).currentPrice).toBe(190);
  expect((found?.errors as any).fairValue).toBe('No historic data available');
  expect((found?.stockRawData as any).quoteSummary.price.regularMarketPrice).toBe(190);
});

test('accepts snapshots without errors or raw data, so pre-existing history still reads', async () => {
  await TickerHistoryModel.create({
    symbol: 'MSFT',
    archivedAt: new Date('2026-01-01T00:00:00Z'),
    data: { fetchedAt: new Date('2026-01-01T00:00:00Z'), currentPrice: 400 }
  });

  const found = await TickerHistoryModel.findOne({ symbol: 'MSFT' });
  expect(found?.errors).toBeUndefined();
  expect(found?.stockRawData).toBeUndefined();
});

test('appends rather than replaces, so repeated snapshots for one symbol all persist', async () => {
  for (const price of [100, 101, 102]) {
    await TickerHistoryModel.create({
      symbol: 'AAPL',
      archivedAt: new Date(),
      data: { fetchedAt: new Date(), currentPrice: price }
    });
  }

  expect(await TickerHistoryModel.countDocuments({ symbol: 'AAPL' })).toBe(3);
});

test('indexes symbol with archivedAt descending for per-symbol time-series reads', () => {
  const indexes = TickerHistoryModel.schema.indexes();
  const compound = indexes.find(([fields]) => 'symbol' in fields && 'archivedAt' in fields);
  expect(compound?.[0]).toEqual({ symbol: 1, archivedAt: -1 });
});
