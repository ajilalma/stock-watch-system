import 'dotenv/config';
import { createApp } from './app';
import { connectMongo } from './db/mongo';
import { TickerService } from './services/ticker.service';
import { YahooFinanceV4Provider } from './providers/yahoo-finance-v4.provider';
import { DcfFairValueCalculator } from './providers/dcf-fair-value.calculator';
import { FrankfurterConverter } from './providers/frankfurter.converter';
import { CachedCurrencyConverter } from './providers/cached-currency.converter';
import { logger } from './logger';

const SCOPE = 'server';

async function main() {
  await connectMongo();

  const tickerService = new TickerService(
    new YahooFinanceV4Provider(),
    new DcfFairValueCalculator(),
    new CachedCurrencyConverter(new FrankfurterConverter())
  );
  const app = createApp(tickerService);

  const port = process.env.PORT ?? 3000;
  app.listen(port, () => logger.info(SCOPE, `backend listening on port ${port}`));
}

main().catch(err => {
  logger.error(SCOPE, 'failed to start server', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
