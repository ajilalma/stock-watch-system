import { Router } from 'express';
import { TickerService } from '../services/ticker.service';
import { asyncHandler } from './async-handler';

export function watchlistRoutes(service: TickerService): Router {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    const list = await service.getList('watchlist');
    res.json(list);
  }));

  router.post('/:symbol', asyncHandler(async (req, res) => {
    const ticker = await service.addTicker(req.params.symbol, 'watchlist');
    res.status(201).json(ticker);
  }));

  router.delete('/:symbol', asyncHandler(async (req, res) => {
    await service.removeTicker(req.params.symbol, 'watchlist');
    res.status(204).send();
  }));

  return router;
}
