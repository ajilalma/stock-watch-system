export interface RawQuote {
  symbol: string;
  // Metadata the provider may not supply for every symbol. Left undefined
  // rather than defaulted here, so datapoint-calculators.ts is the single
  // place that decides the fallback value and the error message.
  companyName?: string;
  sector?: string;
  exchange?: string;
  country?: string;
  currency: string;
  currentPrice: number;
}

export interface RawFinancials {
  symbol: string;
  freeCashFlowHistory: number[]; // oldest first, most recent last, up to 5 years
  sharesOutstanding: number;
  bookValuePerShare: number;
  earningsPerShare: number;
  earningsGrowthRate?: number; // for PEG, as a percentage e.g. 12 = 12%
  // Yahoo's `financialData` module returns these as finished ratios rather
  // than raw balance-sheet line items (verified empirically: `financialData`
  // does not expose totalCurrentAssets, and `balanceSheetHistory` no longer
  // returns real balance-sheet figures for most symbols via the public API -
  // see yahoo-finance.provider.ts for details). Carrying the ratios through
  // directly avoids reconstructing them from unavailable/fabricated inputs.
  currentRatio: number;
  quickRatio: number;
  lastDividendDate?: Date;
  lastDividendAmount?: number;
  dividendsPaidTTM?: number;
  netIncomeTTM?: number;
  priceToBookIndustryAvg?: number;
  currentRatioIndustryAvg?: number;
  quickRatioIndustryAvg?: number;
}

export interface FairValueAssumptions {
  growthRate: number;
  discountRate: number;
  terminalGrowthRate: number;
  projectionYears: number;
}

export interface FairValueResult {
  fairValue: number; // native currency, per share
  assumptions: FairValueAssumptions;
}
