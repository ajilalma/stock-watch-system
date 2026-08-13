import { RawFinancials, FairValueResult } from '../types/domain';

export interface FairValueCalculator {
  calculate(financials: RawFinancials): Promise<FairValueResult>;
}
