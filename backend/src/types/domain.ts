export interface RawQuote {
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
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
  currentAssets: number;
  currentLiabilities: number;
  inventory: number;
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

export interface RatioResult {
  priceToBook: number;
  pegRatio?: number;
  currentRatio: number;
  quickRatio: number;
  payoutRatio?: number;
}
