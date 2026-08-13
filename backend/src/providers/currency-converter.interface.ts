export interface CurrencyConverter {
  getRate(fromCurrency: string, toCurrency: string): Promise<number>;
}
