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
  // Per-datapoint failure reasons keyed by ticker or cachedData field name (e.g.
  // datapointErrors['fairValue']). A datapoint with an entry here fell back to a
  // default value - 0 for numbers, 'Unavailable' for strings - so the value
  // shown is not real and should be presented as missing.
  datapointErrors?: Record<string, string>;
}
