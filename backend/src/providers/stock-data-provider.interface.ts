import { RawQuote, RawFinancials } from '../types/domain';

export interface StockData {
  quote: RawQuote;
  financials: RawFinancials;
  // The unprocessed provider response, archived to tickerhistories so an
  // unhelpful error message can be traced back to what the provider actually
  // returned. Deliberately untyped - its shape is the provider's business.
  raw: unknown;
}

export interface StockDataProvider {
  getStockData(symbol: string): Promise<StockData>;
}
