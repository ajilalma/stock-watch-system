import { Schema, model, Document } from 'mongoose';
import { CachedData } from './ticker.model';

export interface TickerHistoryDocument extends Omit<Document, 'errors'> {
  symbol: string;
  archivedAt: Date;
  data: CachedData;
  errors?: Record<string, string>;
  // The unprocessed provider response for this fetch. Lives only here, never
  // on the ticker document, which keeps the tickers collection light for the
  // UI and makes its absence from API responses structural.
  stockRawData?: unknown;
}

// `data` is Mixed rather than a copy of CachedData's field list: history is
// written and read as an opaque snapshot, and restating the schema means
// editing two files in lockstep every time a datapoint is added.
const tickerHistorySchema = new Schema<TickerHistoryDocument>({
  symbol: { type: String, required: true },
  archivedAt: { type: Date, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  errors: { type: Schema.Types.Mixed },
  stockRawData: { type: Schema.Types.Mixed }
});

// Per-symbol time-series reads are the access pattern this collection exists
// for. Snapshots are appended, never updated, so this collection grows with
// every add and refresh.
tickerHistorySchema.index({ symbol: 1, archivedAt: -1 });

export const TickerHistoryModel = model<TickerHistoryDocument>('TickerHistory', tickerHistorySchema);
