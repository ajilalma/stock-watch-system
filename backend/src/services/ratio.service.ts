import { RawQuote, RawFinancials } from '../types/domain';

interface RatioResult {
  priceToBook: number;
  pegRatio?: number;
  currentRatio: number;
  quickRatio: number;
  payoutRatio?: number;
}

export class RatioService {
  static compute(quote: RawQuote, financials: RawFinancials): RatioResult {
    const priceToBook = quote.currentPrice / financials.bookValuePerShare;

    // currentRatio/quickRatio are Yahoo-computed values passed through as-is
    // (see RawFinancials for why they aren't reconstructed from raw asset/
    // liability/inventory figures).
    const currentRatio = financials.currentRatio;
    const quickRatio = financials.quickRatio;

    let pegRatio: number | undefined;
    if (financials.earningsGrowthRate && financials.earningsGrowthRate !== 0) {
      const priceToEarnings = quote.currentPrice / financials.earningsPerShare;
      pegRatio = priceToEarnings / financials.earningsGrowthRate;
    }

    let payoutRatio: number | undefined;
    if (financials.dividendsPaidTTM !== undefined && financials.netIncomeTTM) {
      payoutRatio = financials.dividendsPaidTTM / financials.netIncomeTTM;
    }

    return { priceToBook, pegRatio, currentRatio, quickRatio, payoutRatio };
  }
}
