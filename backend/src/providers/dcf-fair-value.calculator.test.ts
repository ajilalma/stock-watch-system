import { DcfFairValueCalculator } from './dcf-fair-value.calculator';
import { RawFinancials } from '../types/domain';

const financials: RawFinancials = {
  symbol: 'TEST',
  freeCashFlowHistory: [100, 110, 121, 133, 146], // ~10% YoY growth
  sharesOutstanding: 100,
  bookValuePerShare: 10,
  earningsPerShare: 2,
  currentRatio: 2,
  quickRatio: 1.6
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

test('excludes year-over-year comparisons where the prior year FCF was zero or negative', async () => {
  // -50 -> 100 would be a nonsensical growth rate (dividing by a negative base);
  // that comparison should be skipped, leaving only 100 -> 110 (10% growth).
  const negativePriorYear: RawFinancials = {
    ...financials,
    freeCashFlowHistory: [-50, 100, 110]
  };
  const calculator = new DcfFairValueCalculator();
  const result = await calculator.calculate(negativePriorYear);
  expect(Number.isFinite(result.fairValue)).toBe(true);
  expect(result.assumptions.growthRate).toBeCloseTo(0.1);
});

test('excludes zero prior-year FCF from the growth rate calculation', async () => {
  const zeroPriorYear: RawFinancials = {
    ...financials,
    freeCashFlowHistory: [0, 100, 110]
  };
  const calculator = new DcfFairValueCalculator();
  const result = await calculator.calculate(zeroPriorYear);
  expect(Number.isFinite(result.fairValue)).toBe(true);
  expect(result.assumptions.growthRate).toBeCloseTo(0.1);
});

test('throws a clear error when every year-over-year comparison has a non-positive prior year', async () => {
  const allNonPositive: RawFinancials = {
    ...financials,
    freeCashFlowHistory: [-100, -50, 0]
  };
  const calculator = new DcfFairValueCalculator();
  await expect(calculator.calculate(allNonPositive)).rejects.toThrow(
    /positive prior-year free cash flow/
  );
});

test('throws a clear error when shares outstanding is missing', async () => {
  const calculator = new DcfFairValueCalculator();
  await expect(
    calculator.calculate({ ...financials, sharesOutstanding: undefined })
  ).rejects.toThrow(/shares outstanding/i);
});

test('throws a clear error when shares outstanding is zero', async () => {
  const calculator = new DcfFairValueCalculator();
  await expect(
    calculator.calculate({ ...financials, sharesOutstanding: 0 })
  ).rejects.toThrow(/shares outstanding/i);
});
