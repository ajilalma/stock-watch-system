import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CachedCurrencyConverter } from './cached-currency.converter';
import { CurrencyConverter } from './currency-converter.interface';
import { FxRateModel } from '../models/fx-rate.model';

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
  await FxRateModel.deleteMany({});
  jest.restoreAllMocks();
});

function makeInner(rate: number): CurrencyConverter {
  return { getRate: async () => rate };
}

test('same-currency short-circuits to 1 without touching the cache or the inner converter', async () => {
  const inner = makeInner(1.5);
  const spy = jest.spyOn(inner, 'getRate');
  const cached = new CachedCurrencyConverter(inner);

  const rate = await cached.getRate('USD', 'USD');

  expect(rate).toBe(1);
  expect(spy).not.toHaveBeenCalled();
  const stored = await FxRateModel.findOne({ from: 'USD', to: 'USD' });
  expect(stored).toBeNull();
});

test('cache miss calls through to the inner converter and stores the result', async () => {
  const inner = makeInner(0.85);
  const spy = jest.spyOn(inner, 'getRate');
  const cached = new CachedCurrencyConverter(inner);

  const rate = await cached.getRate('USD', 'EUR');

  expect(rate).toBe(0.85);
  expect(spy).toHaveBeenCalledTimes(1);
  const stored = await FxRateModel.findOne({ from: 'USD', to: 'EUR' });
  expect(stored?.rate).toBe(0.85);
});

test('cache hit within 5 days skips the underlying call', async () => {
  const inner = makeInner(0.85);
  const spy = jest.spyOn(inner, 'getRate');
  await FxRateModel.create({ from: 'USD', to: 'EUR', rate: 0.9, fetchedAt: new Date() });

  const cached = new CachedCurrencyConverter(inner);
  const rate = await cached.getRate('USD', 'EUR');

  expect(rate).toBe(0.9);
  expect(spy).not.toHaveBeenCalled();
});

test('cache expired (older than 5 days) calls through and refreshes the stored rate', async () => {
  const inner = makeInner(0.95);
  const spy = jest.spyOn(inner, 'getRate');
  const staleDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  await FxRateModel.create({ from: 'USD', to: 'EUR', rate: 0.9, fetchedAt: staleDate });

  const cached = new CachedCurrencyConverter(inner);
  const rate = await cached.getRate('USD', 'EUR');

  expect(rate).toBe(0.95);
  expect(spy).toHaveBeenCalledTimes(1);
  const stored = await FxRateModel.findOne({ from: 'USD', to: 'EUR' });
  expect(stored?.rate).toBe(0.95);
  expect(stored!.fetchedAt.getTime()).toBeGreaterThan(staleDate.getTime());
});
