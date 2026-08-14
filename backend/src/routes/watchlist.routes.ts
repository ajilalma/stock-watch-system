import { Router } from 'express';
import { TickerService, toTickerResponse } from '../services/ticker.service';
import { asyncHandler } from './async-handler';
import { logger } from '../logger';

const SCOPE = 'routes:watchlist';

export function watchlistRoutes(service: TickerService): Router {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    logger.info(SCOPE, 'GET / - fetching watchlist');
    const list = await service.getList('watchlist');
    logger.info(SCOPE, 'GET / - returning watchlist', { count: list.length });
    res.json(list.map(toTickerResponse));
  }));

  router.post('/:symbol', asyncHandler(async (req, res) => {
    logger.info(SCOPE, `POST /${req.params.symbol} - adding to watchlist`, { symbol: req.params.symbol });
    const ticker = await service.addTicker(req.params.symbol, 'watchlist');
    logger.info(SCOPE, `POST /${req.params.symbol} - added to watchlist`, { symbol: ticker.symbol, id: String(ticker._id) });
    res.status(201).json(toTickerResponse(ticker));
  }));

  router.delete('/:symbol', asyncHandler(async (req, res) => {
    logger.info(SCOPE, `DELETE /${req.params.symbol} - removing from watchlist`, { symbol: req.params.symbol });
    await service.removeTicker(req.params.symbol, 'watchlist');
    logger.info(SCOPE, `DELETE /${req.params.symbol} - removed from watchlist`, { symbol: req.params.symbol });
    res.status(204).send();
  }));

  return router;
}
