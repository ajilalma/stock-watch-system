import { FairValueCalculator } from './fair-value-calculator.interface';
import { RawFinancials, FairValueResult } from '../types/domain';
import { DCF_CONFIG } from '../config/dcf-config';
import { logger } from '../logger';

const SCOPE = 'DcfFairValueCalculator';

export class DcfFairValueCalculator implements FairValueCalculator {
  async calculate(financials: RawFinancials): Promise<FairValueResult> {
    const history = financials.freeCashFlowHistory;
    logger.info(SCOPE, `calculate(${financials.symbol}) - starting`, { symbol: financials.symbol, fcfHistory: history });
    if (history.length < 2) {
      logger.error(SCOPE, `calculate(${financials.symbol}) - insufficient FCF history`, { symbol: financials.symbol, years: history.length });
      throw new Error('At least 2 years of free cash flow history are required for a DCF calculation');
    }
    if (typeof financials.sharesOutstanding !== 'number' || !Number.isFinite(financials.sharesOutstanding) || financials.sharesOutstanding === 0) {
      logger.error(SCOPE, `calculate(${financials.symbol}) - shares outstanding not usable`, { symbol: financials.symbol, sharesOutstanding: financials.sharesOutstanding });
      throw new Error('Shares outstanding not provided by the data provider, required for a DCF calculation');
    }

    const yearlyGrowthRates: number[] = [];
    for (let i = 1; i < history.length; i++) {
      // Skip any comparison where the prior year's FCF was zero or negative:
      // dividing by a non-positive base inverts the sign or produces
      // Infinity/NaN, which would otherwise corrupt the whole calculation.
      if (history[i - 1] <= 0) continue;
      yearlyGrowthRates.push((history[i] - history[i - 1]) / history[i - 1]);
    }
    if (yearlyGrowthRates.length === 0) {
      throw new Error(
        'At least one valid year-over-year comparison with a positive prior-year free cash flow is required for a DCF calculation'
      );
    }
    const avgGrowthRate = yearlyGrowthRates.reduce((sum, r) => sum + r, 0) / yearlyGrowthRates.length;
    const growthRate = Math.min(avgGrowthRate, DCF_CONFIG.maxGrowthRateCap);

    const { discountRate, terminalGrowthRate, projectionYears } = DCF_CONFIG;
    const lastFcf = history[history.length - 1];

    let presentValueSum = 0;
    let projectedFcf = lastFcf;
    for (let year = 1; year <= projectionYears; year++) {
      projectedFcf = projectedFcf * (1 + growthRate);
      presentValueSum += projectedFcf / Math.pow(1 + discountRate, year);
    }

    const terminalValue =
      (projectedFcf * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
    const presentTerminalValue = terminalValue / Math.pow(1 + discountRate, projectionYears);

    const totalEquityValue = presentValueSum + presentTerminalValue;
    const fairValue = totalEquityValue / financials.sharesOutstanding;

    logger.info(SCOPE, `calculate(${financials.symbol}) - done`, { symbol: financials.symbol, fairValue, growthRate, sharesOutstanding: financials.sharesOutstanding });

    return {
      fairValue,
      assumptions: { growthRate, discountRate, terminalGrowthRate, projectionYears }
    };
  }
}
