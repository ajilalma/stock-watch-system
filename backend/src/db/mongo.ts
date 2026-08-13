import mongoose from 'mongoose';
import { logger } from '../logger';

const SCOPE = 'mongo';

export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    logger.error(SCOPE, 'MONGO_URI environment variable is not set');
    throw new Error('MONGO_URI environment variable is not set');
  }
  logger.info(SCOPE, 'connecting to MongoDB', { uri });
  try {
    await mongoose.connect(uri);
    logger.info(SCOPE, 'connected to MongoDB');
  } catch (err) {
    logger.error(SCOPE, 'failed to connect to MongoDB', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
