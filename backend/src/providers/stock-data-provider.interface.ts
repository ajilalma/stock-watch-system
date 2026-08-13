import { RawQuote, RawFinancials } from '../types/domain';

export interface StockDataProvider {
  getQuote(symbol: string): Promise<RawQuote>;
  getFinancials(symbol: string): Promise<RawFinancials>;
}
