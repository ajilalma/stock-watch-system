export interface CachedData {
  fetchedAt: string;
  currentPrice: number;
  fairValue: number;
  nativePrice: number;
  nativeFairValue: number;
  fxRateToUsd: number;
  priceToBook: number;
  priceToBookIndustryAvg?: number;
  pegRatio?: number;
  currentRatio: number;
  currentRatioIndustryAvg?: number;
  quickRatio: number;
  quickRatioIndustryAvg?: number;
  lastDividendDate?: string;
  lastDividendAmount?: number;
  payoutRatio?: number;
}

export interface Ticker {
  _id: string;
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  nativeCurrency: string;
  lists: ('portfolio' | 'watchlist')[];
  cachedData?: CachedData;
}
