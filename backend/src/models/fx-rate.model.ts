import { Schema, model, Document } from 'mongoose';

export interface FxRateDocument extends Document {
  from: string;
  to: string;
  rate: number;
  fetchedAt: Date;
}

const fxRateSchema = new Schema<FxRateDocument>({
  from: { type: String, required: true },
  to: { type: String, required: true },
  rate: { type: Number, required: true },
  fetchedAt: { type: Date, required: true }
});

fxRateSchema.index({ from: 1, to: 1 }, { unique: true });

export const FxRateModel = model<FxRateDocument>('FxRate', fxRateSchema);
