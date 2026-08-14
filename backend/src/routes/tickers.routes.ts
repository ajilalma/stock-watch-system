import { Router } from 'express';
import { TickerService, toTickerResponse } from '../services/ticker.service';
import { asyncHandler } from './async-handler';
import { logger } from '../logger';

const SCOPE = 'routes:tickers';

export function tickersRoutes(service: TickerService): Router {
  const router = Router();

  router.post('/:symbol/refresh', asyncHandler(async (req, res) => {
    logger.info(SCOPE, `POST /${req.params.symbol}/refresh - refreshing one ticker`, { symbol: req.params.symbol });
    const ticker = await service.refreshTicker(req.params.symbol);
    logger.info(SCOPE, `POST /${req.params.symbol}/refresh - refreshed`, { symbol: ticker.symbol });
    res.status(200).json(toTickerResponse(ticker));
  }));

  router.post('/refresh', asyncHandler(async (req, res) => {
    const symbols: string[] = req.body.symbols ?? [];
    logger.info(SCOPE, 'POST /refresh - refreshing selected tickers', { symbols });
    const tickers = await service.refreshTickers(symbols);
    logger.info(SCOPE, 'POST /refresh - refreshed selected tickers', { count: tickers.length });
    res.status(200).json(tickers.map(toTickerResponse));
  }));

  router.post('/refresh-all', asyncHandler(async (_req, res) => {
    logger.info(SCOPE, 'POST /refresh-all - refreshing all tracked tickers');
    const tickers = await service.refreshAll();
    logger.info(SCOPE, 'POST /refresh-all - refreshed all tracked tickers', { count: tickers.length });
    res.status(200).json(tickers.map(toTickerResponse));
  }));

  return router;
}
