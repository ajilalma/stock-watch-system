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
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
