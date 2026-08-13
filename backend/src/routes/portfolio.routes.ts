import { Router } from 'express';
import { TickerService } from '../services/ticker.service';
import { asyncHandler } from './async-handler';
import { logger } from '../logger';

const SCOPE = 'routes:portfolio';

export function portfolioRoutes(service: TickerService): Router {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    logger.info(SCOPE, 'GET / - fetching portfolio list');
    const list = await service.getList('portfolio');
    logger.info(SCOPE, 'GET / - returning portfolio list', { count: list.length });
    res.json(list);
  }));

  router.post('/:symbol', asyncHandler(async (req, res) => {
    logger.info(SCOPE, `POST /${req.params.symbol} - adding to portfolio`, { symbol: req.params.symbol });
    const ticker = await service.addTicker(req.params.symbol, 'portfolio');
    logger.info(SCOPE, `POST /${req.params.symbol} - added to portfolio`, { symbol: ticker.symbol, id: String(ticker._id) });
    res.status(201).json(ticker);
  }));

  router.delete('/:symbol', asyncHandler(async (req, res) => {
    logger.info(SCOPE, `DELETE /${req.params.symbol} - removing from portfolio`, { symbol: req.params.symbol });
    await service.removeTicker(req.params.symbol, 'portfolio');
    logger.info(SCOPE, `DELETE /${req.params.symbol} - removed from portfolio`, { symbol: req.params.symbol });
    res.status(204).send();
  }));

  return router;
}
