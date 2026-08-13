import request from 'supertest';
import { createApp } from './app';
import { TickerService } from './services/ticker.service';
import { SymbolNotFoundError } from './errors/symbol-not-found.error';

function makeFakeService(): jest.Mocked<TickerService> {
  return {
    addTicker: jest.fn(async (symbol: string, list: string) => ({ symbol, lists: [list] } as any)),
    removeTicker: jest.fn(async () => {}),
    getList: jest.fn(async (list: string) => ([{ symbol: 'AAPL', lists: [list] } as any])),
    refreshTicker: jest.fn(async (symbol: string) => ({ symbol } as any)),
    refreshTickers: jest.fn(async (symbols: string[]) => symbols.map(s => ({ symbol: s } as any))),
    refreshAll: jest.fn(async () => ([{ symbol: 'AAPL' } as any])),
    ensureFresh: jest.fn(async (t: any) => t)
  } as any;
}

test('GET /api/portfolio returns the portfolio list', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).get('/api/portfolio');
  expect(res.status).toBe(200);
  expect(res.body).toEqual([{ symbol: 'AAPL', lists: ['portfolio'] }]);
  expect(service.getList).toHaveBeenCalledWith('portfolio');
});

test('POST /api/portfolio/:symbol adds a ticker to the portfolio', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).post('/api/portfolio/AAPL');
  expect(res.status).toBe(201);
  expect(service.addTicker).toHaveBeenCalledWith('AAPL', 'portfolio');
});

test('DELETE /api/watchlist/:symbol removes a ticker from the watchlist', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).delete('/api/watchlist/AAPL');
  expect(res.status).toBe(204);
  expect(service.removeTicker).toHaveBeenCalledWith('AAPL', 'watchlist');
});

test('POST /api/tickers/:symbol/refresh refreshes a single ticker', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).post('/api/tickers/AAPL/refresh');
  expect(res.status).toBe(200);
  expect(service.refreshTicker).toHaveBeenCalledWith('AAPL');
});

test('POST /api/tickers/refresh refreshes a set of symbols', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).post('/api/tickers/refresh').send({ symbols: ['AAPL', 'MSFT'] });
  expect(res.status).toBe(200);
  expect(service.refreshTickers).toHaveBeenCalledWith(['AAPL', 'MSFT']);
});

test('POST /api/tickers/refresh-all refreshes every tracked ticker', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).post('/api/tickers/refresh-all');
  expect(res.status).toBe(200);
  expect(service.refreshAll).toHaveBeenCalled();
});

test('returns 500 instead of hanging/crashing when the service rejects', async () => {
  const service = makeFakeService();
  service.refreshAll.mockImplementation(async () => {
    throw new Error('boom');
  });
  const app = createApp(service);
  const res = await request(app).post('/api/tickers/refresh-all');
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'Internal server error' });
});

test('returns a distinct 4xx (not a bare 500) when addTicker rejects with SymbolNotFoundError', async () => {
  const service = makeFakeService();
  service.addTicker.mockImplementation(async () => {
    throw new SymbolNotFoundError('ZZZZINVALID123');
  });
  const app = createApp(service);
  const res = await request(app).post('/api/portfolio/ZZZZINVALID123');
  expect(res.status).toBe(404);
  expect(res.body.error).toMatch(/ZZZZINVALID123/);
});
