import 'dotenv/config';
import { createApp } from './app';
import { connectMongo } from './db/mongo';
import { TickerService } from './services/ticker.service';
import { YahooFinanceProvider } from './providers/yahoo-finance.provider';
import { DcfFairValueCalculator } from './providers/dcf-fair-value.calculator';
import { FrankfurterConverter } from './providers/frankfurter.converter';
import { CachedCurrencyConverter } from './providers/cached-currency.converter';

async function main() {
  await connectMongo();

  const tickerService = new TickerService(
    new YahooFinanceProvider(),
    new DcfFairValueCalculator(),
    new CachedCurrencyConverter(new FrankfurterConverter())
  );
  const app = createApp(tickerService);

  const port = process.env.PORT ?? 3000;
  app.listen(port, () => console.log(`Backend listening on port ${port}`));
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
