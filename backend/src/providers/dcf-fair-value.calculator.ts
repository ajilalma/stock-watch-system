import { FairValueCalculator } from './fair-value-calculator.interface';
import { RawFinancials, FairValueResult } from '../types/domain';
import { DCF_CONFIG } from '../config/dcf-config';

export class DcfFairValueCalculator implements FairValueCalculator {
  async calculate(financials: RawFinancials): Promise<FairValueResult> {
    const history = financials.freeCashFlowHistory;
    if (history.length < 2) {
      throw new Error('At least 2 years of free cash flow history are required for a DCF calculation');
    }

    const yearlyGrowthRates: number[] = [];
    for (let i = 1; i < history.length; i++) {
      yearlyGrowthRates.push((history[i] - history[i - 1]) / history[i - 1]);
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

    return {
      fairValue,
      assumptions: { growthRate, discountRate, terminalGrowthRate, projectionYears }
    };
  }
}
