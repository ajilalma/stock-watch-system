import { Router } from 'express';
import { TickerService } from '../services/ticker.service';

export function tickersRoutes(service: TickerService): Router {
  const router = Router();

  router.post('/:symbol/refresh', async (req, res) => {
    const ticker = await service.refreshTicker(req.params.symbol);
    res.status(200).json(ticker);
  });

  router.post('/refresh', async (req, res) => {
    const symbols: string[] = req.body.symbols ?? [];
    const tickers = await service.refreshTickers(symbols);
    res.status(200).json(tickers);
  });

  router.post('/refresh-all', async (_req, res) => {
    const tickers = await service.refreshAll();
    res.status(200).json(tickers);
  });

  return router;
}
