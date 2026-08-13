import { RatioService } from './ratio.service';
import { RawQuote, RawFinancials } from '../types/domain';

const quote: RawQuote = {
  symbol: 'TEST', companyName: 'Test Co', sector: 'Tech',
  exchange: 'NASDAQ', country: 'US', currency: 'USD', currentPrice: 20
};

const financials: RawFinancials = {
  symbol: 'TEST',
  freeCashFlowHistory: [100, 110, 120, 130, 140],
  sharesOutstanding: 1000,
  bookValuePerShare: 10,
  earningsPerShare: 2,
  earningsGrowthRate: 10,
  currentRatio: 2,
  quickRatio: 1.6,
  dividendsPaidTTM: 50,
  netIncomeTTM: 200
};

test('computes priceToBook as price / bookValuePerShare', () => {
  const result = RatioService.compute(quote, financials);
  expect(result.priceToBook).toBeCloseTo(2); // 20 / 10
});

test('computes pegRatio as (price/EPS) / earningsGrowthRate when growth available', () => {
  const result = RatioService.compute(quote, financials);
  // P/E = 20/2 = 10, PEG = 10 / 10 = 1
  expect(result.pegRatio).toBeCloseTo(1);
});

test('omits pegRatio when earningsGrowthRate is missing', () => {
  const noGrowth = { ...financials, earningsGrowthRate: undefined };
  const result = RatioService.compute(quote, noGrowth);
  expect(result.pegRatio).toBeUndefined();
});

test('passes through currentRatio from Yahoo-computed financials data', () => {
  const result = RatioService.compute(quote, financials);
  expect(result.currentRatio).toBeCloseTo(2);
});

test('passes through quickRatio from Yahoo-computed financials data, distinct from currentRatio', () => {
  const result = RatioService.compute(quote, financials);
  expect(result.quickRatio).toBeCloseTo(1.6);
  expect(result.quickRatio).not.toBe(result.currentRatio);
});

test('computes payoutRatio as dividendsPaidTTM / netIncomeTTM when both available', () => {
  const result = RatioService.compute(quote, financials);
  expect(result.payoutRatio).toBeCloseTo(0.25); // 50/200
});

test('omits payoutRatio when netIncomeTTM is missing or zero', () => {
  const noIncome = { ...financials, netIncomeTTM: 0 };
  const result = RatioService.compute(quote, noIncome);
  expect(result.payoutRatio).toBeUndefined();
});
