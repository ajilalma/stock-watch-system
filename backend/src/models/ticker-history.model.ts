import { Schema, model, Document } from 'mongoose';
import { CachedData } from './ticker.model';

export interface TickerHistoryDocument extends Document {
  symbol: string;
  archivedAt: Date;
  data: CachedData;
}

const historyDataSchema = new Schema<CachedData>({
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
  payoutRatio: Number,
  fairValueError: String
}, { _id: false });

const tickerHistorySchema = new Schema<TickerHistoryDocument>({
  symbol: { type: String, required: true },
  archivedAt: { type: Date, required: true },
  data: { type: historyDataSchema, required: true }
});

export const TickerHistoryModel = model<TickerHistoryDocument>('TickerHistory', tickerHistorySchema);
