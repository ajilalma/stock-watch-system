import { DcfFairValueCalculator } from './dcf-fair-value.calculator';
import { RawFinancials } from '../types/domain';

const financials: RawFinancials = {
  symbol: 'TEST',
  freeCashFlowHistory: [100, 110, 121, 133, 146], // ~10% YoY growth
  sharesOutstanding: 100,
  bookValuePerShare: 10,
  earningsPerShare: 2,
  currentAssets: 500,
  currentLiabilities: 250,
  inventory: 100
};

test('calculates a positive fair value per share using capped historical growth', async () => {
  const calculator = new DcfFairValueCalculator();
  const result = await calculator.calculate(financials);
  expect(result.fairValue).toBeGreaterThan(0);
  expect(result.assumptions.discountRate).toBe(0.09);
  expect(result.assumptions.terminalGrowthRate).toBe(0.025);
  expect(result.assumptions.projectionYears).toBe(10);
  expect(result.assumptions.growthRate).toBeLessThanOrEqual(0.15); // capped
});

test('caps growth rate at 15% even when historical growth is much higher', async () => {
  const explosiveGrowth: RawFinancials = {
    ...financials,
    freeCashFlowHistory: [10, 20, 40, 80, 160] // 100% YoY
  };
  const calculator = new DcfFairValueCalculator();
  const result = await calculator.calculate(explosiveGrowth);
  expect(result.assumptions.growthRate).toBe(0.15);
});

test('throws if fewer than 2 years of free cash flow history are provided', async () => {
  const calculator = new DcfFairValueCalculator();
  await expect(
    calculator.calculate({ ...financials, freeCashFlowHistory: [100] })
  ).rejects.toThrow();
});
