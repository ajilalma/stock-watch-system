import { CurrencyConverter } from './currency-converter.interface';
import { logger } from '../logger';

const SCOPE = 'FrankfurterConverter';

export class FrankfurterConverter implements CurrencyConverter {
  async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const url = `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`;
    logger.info(SCOPE, `getRate(${fromCurrency}, ${toCurrency}) - calling Frankfurter`, { url });
    const response = await fetch(url);
    if (!response.ok) {
      logger.error(SCOPE, `getRate(${fromCurrency}, ${toCurrency}) - non-ok response`, { status: response.status });
      throw new Error(`Frankfurter API error: ${response.status}`);
    }
    const data = await response.json() as { rates: Record<string, number> };
    const rate = data.rates[toCurrency];
    if (rate === undefined) {
      logger.error(SCOPE, `getRate(${fromCurrency}, ${toCurrency}) - currency missing from response`, { response: data });
      throw new Error(`Currency ${toCurrency} not found in Frankfurter response`);
    }
    logger.info(SCOPE, `getRate(${fromCurrency}, ${toCurrency}) - success`, { rate });
    return rate;
  }
}
