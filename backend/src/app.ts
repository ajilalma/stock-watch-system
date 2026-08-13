import express, { Express } from 'express';
import cors from 'cors';
import { TickerService } from './services/ticker.service';
import { portfolioRoutes } from './routes/portfolio.routes';
import { watchlistRoutes } from './routes/watchlist.routes';
import { tickersRoutes } from './routes/tickers.routes';

export function createApp(tickerService: TickerService): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/portfolio', portfolioRoutes(tickerService));
  app.use('/api/watchlist', watchlistRoutes(tickerService));
  app.use('/api/tickers', tickersRoutes(tickerService));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    // Errors that carry a `statusCode` (e.g. SymbolNotFoundError) are known,
    // client-facing failures - surface their own message and status instead
    // of masking everything as a generic 500.
    const statusCode = typeof (err as any).statusCode === 'number' ? (err as any).statusCode : 500;
    const message = statusCode < 500 ? err.message : 'Internal server error';
    res.status(statusCode).json({ error: message });
  });

  return app;
}
