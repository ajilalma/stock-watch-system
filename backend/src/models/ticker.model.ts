import { Schema, model, Document } from 'mongoose';

export interface CachedData {
  fetchedAt: Date;
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
  lastDividendDate?: Date;
  lastDividendAmount?: number;
  payoutRatio?: number;
}

export interface TickerDocument extends Document {
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  nativeCurrency: string;
  lists: ('portfolio' | 'watchlist')[];
  cachedData?: CachedData;
  // Per-datapoint failure reasons, keyed by cachedData field name (e.g.
  // datapointErrors.fairValue). Replaced wholesale on every fetch rather than merged,
  // so a datapoint that starts working again stops reporting an error.
  datapointErrors?: Map<string, string>;
}

const cachedDataSchema = new Schema<CachedData>({
  fetchedAt: { type: Date, required: true },
  currentPrice: { type: Number, required: true },
  fairValue: { type: Number, required: true },
  nativePrice: { type: Number, required: true },
  nativeFairValue: { type: Number, required: true },
  fxRateToUsd: { type: Number, required: true },
  priceToBook: { type: Number, required: true },
  priceToBookIndustryAvg: Number,
  pegRatio: Number,
  currentRatio: { type: Number, required: true },
  currentRatioIndustryAvg: Number,
  quickRatio: { type: Number, required: true },
  quickRatioIndustryAvg: Number,
  lastDividendDate: Date,
  lastDividendAmount: Number,
  payoutRatio: Number
}, { _id: false });

const tickerSchema = new Schema<TickerDocument>({
  symbol: { type: String, required: true, unique: true },
  companyName: { type: String, required: true },
  sector: { type: String, required: true },
  exchange: { type: String, required: true },
  country: { type: String, required: true },
  nativeCurrency: { type: String, required: true },
  lists: {
    type: [{ type: String, enum: ['portfolio', 'watchlist'] }],
    required: true,
    default: []
  },
  cachedData: cachedDataSchema,
  // A Map rather than a fixed sub-schema so adding a datapoint later needs no
  // schema change. Mongoose serializes Maps to plain objects in JSON, so API
  // consumers see an ordinary object.
  datapointErrors: { type: Map, of: String, default: {} }
});

export const TickerModel = model<TickerDocument>('Ticker', tickerSchema);
