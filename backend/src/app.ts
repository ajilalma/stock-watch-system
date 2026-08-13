import express, { Express } from 'express';
import cors from 'cors';
import { TickerService } from './services/ticker.service';
import { portfolioRoutes } from './routes/portfolio.routes';
import { watchlistRoutes } from './routes/watchlist.routes';
import { tickersRoutes } from './routes/tickers.routes';
import { logger } from './logger';

const SCOPE = 'app';

export function createApp(tickerService: TickerService): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use((req, _res, next) => {
    logger.info(SCOPE, `${req.method} ${req.originalUrl} - request received`);
    next();
  });

  app.use('/api/portfolio', portfolioRoutes(tickerService));
  app.use('/api/watchlist', watchlistRoutes(tickerService));
  app.use('/api/tickers', tickersRoutes(tickerService));

  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Errors that carry a `statusCode` (e.g. SymbolNotFoundError) are known,
    // client-facing failures - surface their own message and status instead
    // of masking everything as a generic 500.
    const statusCode = typeof (err as any).statusCode === 'number' ? (err as any).statusCode : 500;
    const message = statusCode < 500 ? err.message : 'Internal server error';
    logger.error(SCOPE, `${req.method} ${req.originalUrl} - request failed`, { statusCode, error: err.message, stack: err.stack });
    res.status(statusCode).json({ error: message });
  });

  return app;
}
