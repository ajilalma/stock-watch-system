import 'dotenv/config';
import { createApp } from './app';
import { connectMongo } from './db/mongo';
import { TickerService } from './services/ticker.service';
import { StockDataProvider } from './providers/stock-data-provider.interface';
import { YahooFinanceProvider } from './providers/yahoo-finance.provider';
import { YahooFinanceV4Provider } from './providers/yahoo-finance-v4.provider';
import { DcfFairValueCalculator } from './providers/dcf-fair-value.calculator';
import { FrankfurterConverter } from './providers/frankfurter.converter';
import { CachedCurrencyConverter } from './providers/cached-currency.converter';

// STOCK_DATA_PROVIDER=v4 switches to the yahoo-finance2 v4 provider without
// touching any other code - v2 (default) is the actively verified
// implementation; v4 is available once its field mappings are spot-checked
// against a live response (see yahoo-finance-v4.provider.ts's header comment).
function createStockDataProvider(): StockDataProvider {
  return process.env.STOCK_DATA_PROVIDER === 'v4'
    ? new YahooFinanceV4Provider()
    : new YahooFinanceProvider();
}

async function main() {
  await connectMongo();

  const tickerService = new TickerService(
    createStockDataProvider(),
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
