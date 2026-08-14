import {
  computeCompanyName, computeSector, computeExchange, computeCountry,
  computeFairValue, computePriceToBook, computePegRatio,
  computeCurrentRatio, computeQuickRatio, computePayoutRatio,
  computeFxRate, collectErrors, UNAVAILABLE
} from './datapoint-calculators';
import { RawQuote, RawFinancials } from '../types/domain';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';

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

const workingCalculator: FairValueCalculator = {
  calculate: async () => ({
    fairValue: 42,
    assumptions: { growthRate: 0.1, discountRate: 0.09, terminalGrowthRate: 0.025, projectionYears: 10 }
  })
};

const throwingCalculator: FairValueCalculator = {
  calculate: async () => { throw new Error('No historic data available'); }
};

const nonFiniteCalculator: FairValueCalculator = {
  calculate: async () => ({
    fairValue: Infinity,
    assumptions: { growthRate: 0.1, discountRate: 0.09, terminalGrowthRate: 0.025, projectionYears: 10 }
  })
};

const workingConverter: CurrencyConverter = { getRate: async () => 0.8 };
const throwingConverter: CurrencyConverter = {
  getRate: async () => { throw new Error('Frankfurter unreachable'); }
};

// --- metadata strings ---

test('computeCompanyName returns the provider value when present', () => {
  expect(computeCompanyName(quote)).toEqual({ value: 'Test Co' });
});

test('computeCompanyName defaults to Unavailable with an error when the provider omits it', () => {
  const result = computeCompanyName({ ...quote, companyName: undefined });
  expect(result.value).toBe(UNAVAILABLE);
  expect(result.error).toBeTruthy();
});

test('computeSector defaults to Unavailable with an error when the provider omits it', () => {
  const result = computeSector({ ...quote, sector: undefined });
  expect(result.value).toBe(UNAVAILABLE);
  expect(result.error).toBeTruthy();
});

test('computeExchange defaults to Unavailable with an error when the provider omits it', () => {
  const result = computeExchange({ ...quote, exchange: undefined });
  expect(result.value).toBe(UNAVAILABLE);
  expect(result.error).toBeTruthy();
});

test('computeCountry names the unmapped exchange in its error so map gaps are visible', () => {
  const result = computeCountry({ ...quote, country: undefined, exchange: 'SomeUnmappedExchange' });
  expect(result.value).toBe(UNAVAILABLE);
  expect(result.error).toContain('SomeUnmappedExchange');
});

test('computeCountry reports a missing exchange rather than an unmapped one when there is no exchange', () => {
  const result = computeCountry({ ...quote, country: undefined, exchange: undefined });
  expect(result.value).toBe(UNAVAILABLE);
  expect(result.error).toBeTruthy();
});

// --- fair value ---

test('computeFairValue returns the calculated value with no error on success', async () => {
  await expect(computeFairValue(financials, workingCalculator)).resolves.toEqual({ value: 42 });
});

test('computeFairValue returns 0 and the thrown message when the calculator throws', async () => {
  const result = await computeFairValue(financials, throwingCalculator);
  expect(result).toEqual({ value: 0, error: 'No historic data available' });
});

test('computeFairValue returns 0 and an error rather than storing a non-finite result', async () => {
  const result = await computeFairValue(financials, nonFiniteCalculator);
  expect(result.value).toBe(0);
  expect(result.error).toBeTruthy();
});

// --- price to book ---

test('computePriceToBook divides price by book value per share', () => {
  expect(computePriceToBook(quote, financials)).toEqual({ value: 2 });
});

test('computePriceToBook returns 0 and names the missing input when book value is absent', () => {
  const result = computePriceToBook(quote, { ...financials, bookValuePerShare: undefined });
  expect(result.value).toBe(0);
  expect(result.error).toMatch(/book value/i);
});

test('computePriceToBook returns 0 and an error when book value is zero, rather than Infinity', () => {
  const result = computePriceToBook(quote, { ...financials, bookValuePerShare: 0 });
  expect(result.value).toBe(0);
  expect(result.error).toBeTruthy();
});

// --- PEG ---

test('computePegRatio divides P/E by the growth rate', () => {
  // P/E = 20/2 = 10, PEG = 10 / 10 = 1
  expect(computePegRatio(quote, financials)).toEqual({ value: 1 });
});

test('computePegRatio is undefined with no error when no growth rate is published', () => {
  const result = computePegRatio(quote, { ...financials, earningsGrowthRate: undefined });
  expect(result.value).toBeUndefined();
  expect(result.error).toBeUndefined();
});

test('computePegRatio returns 0 and an error when EPS is missing but growth is published', () => {
  const result = computePegRatio(quote, { ...financials, earningsPerShare: undefined });
  expect(result.value).toBe(0);
  expect(result.error).toMatch(/earnings per share/i);
});

// --- current / quick ratios ---

test('computeCurrentRatio passes through the provider value', () => {
  expect(computeCurrentRatio(financials)).toEqual({ value: 2 });
});

test('computeCurrentRatio returns 0 and an error when the provider omits it', () => {
  const result = computeCurrentRatio({ ...financials, currentRatio: undefined });
  expect(result.value).toBe(0);
  expect(result.error).toBeTruthy();
});

test('computeQuickRatio passes through the provider value, distinct from currentRatio', () => {
  expect(computeQuickRatio(financials)).toEqual({ value: 1.6 });
});

test('computeQuickRatio returns 0 and an error when the provider omits it', () => {
  const result = computeQuickRatio({ ...financials, quickRatio: undefined });
  expect(result.value).toBe(0);
  expect(result.error).toBeTruthy();
});

// --- payout ratio ---

test('computePayoutRatio divides dividends paid by net income', () => {
  expect(computePayoutRatio(financials)).toEqual({ value: 0.25 });
});

test('computePayoutRatio is undefined with no error for a company that pays no dividend', () => {
  const result = computePayoutRatio({ ...financials, dividendsPaidTTM: undefined });
  expect(result.value).toBeUndefined();
  expect(result.error).toBeUndefined();
});

test('computePayoutRatio returns 0 and an error when a dividend is paid but net income is missing', () => {
  const result = computePayoutRatio({ ...financials, netIncomeTTM: 0 });
  expect(result.value).toBe(0);
  expect(result.error).toMatch(/net income/i);
});

// --- FX ---

test('computeFxRate returns the converter rate on success', async () => {
  await expect(computeFxRate(quote, 'USD', workingConverter)).resolves.toEqual({ value: 0.8 });
});

test('computeFxRate falls back to 1, not 0, so prices stay recognizable when the lookup fails', async () => {
  const result = await computeFxRate(quote, 'USD', throwingConverter);
  expect(result.value).toBe(1);
  expect(result.error).toBe('Frankfurter unreachable');
});

test('computeFxRate falls back to 1 with an error when the converter returns a zero rate', async () => {
  const zeroConverter: CurrencyConverter = { getRate: async () => 0 };
  const result = await computeFxRate(quote, 'USD', zeroConverter);
  expect(result.value).toBe(1);
  expect(result.error).toBeTruthy();
});

// --- error collection ---

test('collectErrors keeps only the failing fields, keyed by field name', () => {
  const errors = collectErrors({
    fairValue: { value: 0, error: 'No historic data available' },
    priceToBook: { value: 2 },
    currentRatio: { value: 0, error: 'Current ratio not provided by the data provider' }
  });
  expect(errors).toEqual({
    fairValue: 'No historic data available',
    currentRatio: 'Current ratio not provided by the data provider'
  });
});

test('collectErrors returns an empty object when everything succeeded', () => {
  expect(collectErrors({ priceToBook: { value: 2 }, currentRatio: { value: 1.5 } })).toEqual({});
});
