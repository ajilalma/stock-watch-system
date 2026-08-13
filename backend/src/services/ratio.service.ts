import { RawQuote, RawFinancials, RatioResult } from '../types/domain';

export class RatioService {
  static compute(quote: RawQuote, financials: RawFinancials): RatioResult {
    const priceToBook = quote.currentPrice / financials.bookValuePerShare;

    const currentRatio = financials.currentAssets / financials.currentLiabilities;
    const quickRatio = (financials.currentAssets - financials.inventory) / financials.currentLiabilities;

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
