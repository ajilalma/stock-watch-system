import { CurrencyConverter } from './currency-converter.interface';

export class FrankfurterConverter implements CurrencyConverter {
  async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`
    );
    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.status}`);
    }
    const data = await response.json() as { rates: Record<string, number> };
    return data.rates[toCurrency];
  }
}
