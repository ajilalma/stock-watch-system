import { CurrencyConverter } from './currency-converter.interface';
import { FxRateModel } from '../models/fx-rate.model';

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export class CachedCurrencyConverter implements CurrencyConverter {
  constructor(private inner: CurrencyConverter) {}

  async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const cached = await FxRateModel.findOne({ from: fromCurrency, to: toCurrency });
    if (cached && Date.now() - cached.fetchedAt.getTime() <= FIVE_DAYS_MS) {
      return cached.rate;
    }

    const rate = await this.inner.getRate(fromCurrency, toCurrency);

    await FxRateModel.findOneAndUpdate(
      { from: fromCurrency, to: toCurrency },
      { rate, fetchedAt: new Date() },
      { upsert: true }
    );

    return rate;
  }
}
