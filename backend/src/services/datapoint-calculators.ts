// backend/src/services/datapoint-calculators.ts
//
// One isolated calculation per stock datapoint. Every function here returns
// a value and never throws, so a datapoint that cannot be derived for a
// given company records a reason instead of preventing the company from
// being tracked at all. This module is the single place that decides what a
// failed datapoint falls back to and what the failure reads as.
import { RawQuote, RawFinancials } from '../types/domain';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';
import { logger } from '../logger';

const SCOPE = 'DatapointCalculators';

export interface Calculated<T> {
  value: T;
  error?: string;
}

export const UNAVAILABLE = 'Unavailable';

// A failed FX lookup falls back to 1 rather than 0: a zero rate would
// multiply currentPrice and fairValue to zero, making two working datapoints
// indistinguishable from failed ones. At 1 they stay in native currency -
// wrong, but recognizably so - and the error records why.
const FX_FALLBACK_RATE = 1;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isUsableDivisor(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0;
}

function isUsableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function failed<T>(field: string, value: T, error: string): Calculated<T> {
  logger.warn(SCOPE, `${field} could not be derived`, { field, error });
  return { value, error };
}

function requireFinite(field: string, result: number): Calculated<number> {
  if (!Number.isFinite(result)) {
    return failed(field, 0, `${field} calculation produced a non-finite result`);
  }
  return { value: result };
}

function requireText(field: string, label: string, value: string | undefined): Calculated<string> {
  if (typeof value === 'string' && value.trim() !== '') return { value };
  return failed(field, UNAVAILABLE, `${label} not provided by the data provider`);
}

export function computeCompanyName(quote: RawQuote): Calculated<string> {
  return requireText('companyName', 'Company name', quote.companyName);
}

export function computeSector(quote: RawQuote): Calculated<string> {
  return requireText('sector', 'Sector', quote.sector);
}

export function computeExchange(quote: RawQuote): Calculated<string> {
  return requireText('exchange', 'Exchange', quote.exchange);
}

// The provider resolves country from its exchange-to-country map, so an
// absent country with a present exchange means the map has a gap. Naming the
// exchange in the error is what makes that gap findable.
export function computeCountry(quote: RawQuote): Calculated<string> {
  if (typeof quote.country === 'string' && quote.country.trim() !== '') {
    return { value: quote.country };
  }
  if (typeof quote.exchange === 'string' && quote.exchange.trim() !== '') {
    return failed('country', UNAVAILABLE, `No country mapping for exchange "${quote.exchange}"`);
  }
  return failed('country', UNAVAILABLE, 'Country could not be derived: no exchange reported');
}

export async function computeFairValue(
  financials: RawFinancials,
  calculator: FairValueCalculator
): Promise<Calculated<number>> {
  try {
    const result = await calculator.calculate(financials);
    return requireFinite('fairValue', result.fairValue);
  } catch (err) {
    return failed('fairValue', 0, messageOf(err));
  }
}

export function computePriceToBook(quote: RawQuote, financials: RawFinancials): Calculated<number> {
  if (!isUsableNumber(quote.currentPrice)) {
    return failed('priceToBook', 0, 'Current price not provided by the data provider');
  }
  if (!isUsableDivisor(financials.bookValuePerShare)) {
    return failed('priceToBook', 0, 'Book value per share not provided by the data provider');
  }
  return requireFinite('priceToBook', quote.currentPrice / financials.bookValuePerShare);
}

// A company with no published earnings growth rate has no PEG - that is an
// absence, not a failure, so it records no error. A published growth rate
// with no usable EPS is a failure.
export function computePegRatio(quote: RawQuote, financials: RawFinancials): Calculated<number | undefined> {
  if (!isUsableDivisor(financials.earningsGrowthRate)) {
    return { value: undefined };
  }
  if (!isUsableNumber(quote.currentPrice)) {
    return failed('pegRatio', 0, 'Current price not provided by the data provider');
  }
  if (!isUsableDivisor(financials.earningsPerShare)) {
    return failed('pegRatio', 0, 'Earnings per share not provided by the data provider');
  }
  const priceToEarnings = quote.currentPrice / financials.earningsPerShare;
  return requireFinite('pegRatio', priceToEarnings / financials.earningsGrowthRate);
}

export function computeCurrentRatio(financials: RawFinancials): Calculated<number> {
  if (!isUsableNumber(financials.currentRatio)) {
    return failed('currentRatio', 0, 'Current ratio not provided by the data provider');
  }
  return { value: financials.currentRatio };
}

export function computeQuickRatio(financials: RawFinancials): Calculated<number> {
  if (!isUsableNumber(financials.quickRatio)) {
    return failed('quickRatio', 0, 'Quick ratio not provided by the data provider');
  }
  return { value: financials.quickRatio };
}

// A company that pays no dividend has no payout ratio - an absence, not a
// failure. Dividends paid with no usable net income is a failure.
export function computePayoutRatio(financials: RawFinancials): Calculated<number | undefined> {
  if (!isUsableNumber(financials.dividendsPaidTTM)) {
    return { value: undefined };
  }
  if (!isUsableDivisor(financials.netIncomeTTM)) {
    return failed('payoutRatio', 0, 'Net income (TTM) is zero or not provided by the data provider');
  }
  return requireFinite('payoutRatio', financials.dividendsPaidTTM / financials.netIncomeTTM);
}

export async function computeFxRate(
  quote: RawQuote,
  toCurrency: string,
  converter: CurrencyConverter
): Promise<Calculated<number>> {
  if (typeof quote.currency !== 'string' || quote.currency.trim() === '') {
    return failed('fxRateToUsd', FX_FALLBACK_RATE, 'Quote currency not provided by the data provider');
  }
  try {
    const rate = await converter.getRate(quote.currency, toCurrency);
    if (!isUsableDivisor(rate)) {
      return failed('fxRateToUsd', FX_FALLBACK_RATE, `Unusable ${quote.currency}/${toCurrency} rate returned: ${rate}`);
    }
    return { value: rate };
  } catch (err) {
    return failed('fxRateToUsd', FX_FALLBACK_RATE, messageOf(err));
  }
}

// Reduces a set of calculation results to just the failures, keyed by field
// name - the shape stored on the ticker document and returned by the API.
export function collectErrors(results: Record<string, Calculated<unknown>>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, result] of Object.entries(results)) {
    if (result.error) errors[field] = result.error;
  }
  return errors;
}
