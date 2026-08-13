import { Router } from 'express';
import { TickerService } from '../services/ticker.service';

export function watchlistRoutes(service: TickerService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const list = await service.getList('watchlist');
    res.json(list);
  });

  router.post('/:symbol', async (req, res) => {
    const ticker = await service.addTicker(req.params.symbol, 'watchlist');
    res.status(201).json(ticker);
  });

  router.delete('/:symbol', async (req, res) => {
    await service.removeTicker(req.params.symbol, 'watchlist');
    res.status(204).send();
  });

  return router;
}
