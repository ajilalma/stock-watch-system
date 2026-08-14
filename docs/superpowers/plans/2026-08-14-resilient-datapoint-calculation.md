# Resilient Datapoint Calculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate every derived stock datapoint into its own non-throwing function so a single failed calculation records an error instead of blocking the whole ticker, and archive the raw provider payload to history for debugging.

**Architecture:** A new `datapoint-calculators.ts` module holds one small function per datapoint, each returning `{ value, error? }` and never throwing. `TickerService` becomes pure orchestration: call the provider once, call each calculator independently, assemble `cachedData` plus an `datapointErrors` map, write the ticker, then append a history snapshot carrying the raw provider response. The two Yahoo providers collapse to one (v4), with a single `getStockData()` entry point that returns quote, financials, and raw payload together.

**Tech Stack:** TypeScript, Node, Express, Mongoose 8, Jest + ts-jest, mongodb-memory-server, supertest, yahoo-finance2 v4.

**Spec:** `docs/superpowers/specs/2026-08-14-resilient-datapoint-calculation-design.md`

## Global Constraints

- All backend source lives under `backend/src/`. Run all commands from `backend/`.
- Test runner: `npm test` (Jest). Single file: `npx jest src/path/to/file.test.ts`. Single test: `npx jest -t "test name"`.
- Type check with `npx tsc --noEmit` before every commit. This codebase has no linter; the compiler is the gate.
- Every module that logs uses the shared logger: `import { logger } from '../logger'` with a `const SCOPE = 'ModuleName'` at the top, and calls `logger.info(SCOPE, message, meta)`. Follow this in every file you touch.
- Existing comment style: comments explain *why*, not *what*, and are written in full sentences. Match it. Do not add narration comments.
- Failure defaults, applied by every calculator: `0` for numbers, `"Unavailable"` for strings, `undefined` for dates. Two deliberate exceptions, both specified below: `fxRateToUsd` defaults to `1`, and optional-by-design fields (`pegRatio`, `payoutRatio`) return `undefined` with no error when the concept does not apply.
- `stockRawData` must never appear in any API response. It is written only to `tickerhistories`.
- TDD throughout: write the failing test, run it and see it fail, implement, run it and see it pass, commit.

---

## File Structure

**Created**
- `backend/src/services/datapoint-calculators.ts` — one isolated function per derived datapoint; the only place failure defaults and error strings are decided.
- `backend/src/services/datapoint-calculators.test.ts` — unit tests for the above.

**Deleted**
- `backend/src/providers/yahoo-finance.provider.ts` + its two test files — v2 provider, superseded.
- `backend/src/services/ratio.service.ts` + test — replaced by `datapoint-calculators.ts`.

**Modified**
- `backend/src/types/domain.ts` — `RawQuote` metadata fields become optional; `RatioResult` deleted.
- `backend/src/providers/stock-data-provider.interface.ts` — single `getStockData()` method plus a `StockData` type.
- `backend/src/providers/yahoo-finance-v4.provider.ts` — implement `getStockData()`, return the raw payload, drop the summary de-dupe cache and the metadata `'Unknown'` defaults.
- `backend/src/models/ticker.model.ts` — add `datapointErrors`, drop `fairValueError`.
- `backend/src/models/ticker-history.model.ts` — mixed `data`, add `datapointErrors` and `stockRawData`, add compound index.
- `backend/src/services/ticker.service.ts` — orchestration, history-on-every-write, `toTickerResponse`.
- `backend/src/routes/{portfolio,watchlist,tickers}.routes.ts` — return mapped responses.
- `backend/src/server.ts` — construct the v4 provider directly.
- `backend/package.json` — drop the `yahoo-finance2` v2 dependency.
- `frontend/src/app/shared/models/ticker.model.ts` — add `datapointErrors`, drop `fairValueError`.
- `TODO.md` — update stale items.

---

## Spec Amendment (apply first)

The spec's "Optional-by-design vs. failed" section says an inapplicable input
returns `{ value: 0 }` with no error. That would regress the UI: `pegRatio`
and `payoutRatio` are currently `undefined` when absent, and the stock table's
coloring pipes treat a stored `0` as a real value (a PEG of 0 reads as
excellent). Writing `0` for a company that simply pays no dividend would show
a fabricated figure.

Implement it as: **inapplicable → `undefined` with no error; failed → `0` with
an error.** This preserves current UI behavior exactly and still satisfies the
spec's intent (distinguishing "not applicable" from "broken"). The types are
`Calculated<number | undefined>` for these two fields only.

- [ ] **Step 1: Amend the spec to match**

In `docs/superpowers/specs/2026-08-14-resilient-datapoint-calculation-design.md`, replace this sentence in the "Optional-by-design vs. failed" paragraph:

```
two cases: an input that is absent *because the concept does not apply*
returns `{ value: 0 }` with **no** error, while an input that should exist but is
missing or malformed returns `{ value: 0, error: ... }`. Concretely:
```

with:

```
two cases: an input that is absent *because the concept does not apply*
returns `{ value: undefined }` with **no** error, while an input that should
exist but is missing or malformed returns `{ value: 0, error: ... }`. These two
fields keep the `number | undefined` type they already have in `CachedData` —
storing `0` for a company that pays no dividend would render as a real value
in the UI rather than as an absence. Concretely:
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-08-14-resilient-datapoint-calculation-design.md
git commit -m "docs: clarify optional-by-design datapoints stay undefined, not 0"
```

---

## Task 1: Collapse to a single provider with a raw payload

Removes the v2 provider and reshapes `StockDataProvider` into one call that returns quote, financials, and the untouched provider response together.

**Files:**
- Modify: `backend/src/types/domain.ts`
- Modify: `backend/src/providers/stock-data-provider.interface.ts`
- Modify: `backend/src/providers/yahoo-finance-v4.provider.ts`
- Modify: `backend/src/providers/yahoo-finance-v4.provider.test.ts`
- Modify: `backend/src/services/ticker.service.ts` (call site only)
- Modify: `backend/src/services/ticker.service.test.ts` (fake provider only)
- Modify: `backend/src/server.ts`
- Modify: `backend/package.json`
- Delete: `backend/src/providers/yahoo-finance.provider.ts`
- Delete: `backend/src/providers/yahoo-finance.provider.test.ts`
- Delete: `backend/src/providers/yahoo-finance.provider.live.test.ts`

**Interfaces:**
- Produces: `StockData { quote: RawQuote; financials: RawFinancials; raw: unknown }` and `StockDataProvider.getStockData(symbol: string): Promise<StockData>`, both exported from `providers/stock-data-provider.interface.ts`. `RawQuote.companyName`, `.sector`, `.exchange`, `.country` become `string | undefined`. Tasks 3 and 4 depend on both.

- [ ] **Step 1: Write the failing test**

Replace the whole of `backend/src/providers/yahoo-finance-v4.provider.test.ts` with:

```ts
import { YahooFinanceV4Provider } from './yahoo-finance-v4.provider';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';

function makeProvider(summary: any, timeSeries: any[]): YahooFinanceV4Provider {
  const provider = new YahooFinanceV4Provider();
  (provider as any).client = {
    quoteSummary: jest.fn(async () => summary),
    fundamentalsTimeSeries: jest.fn(async () => timeSeries)
  };
  return provider;
}

const FULL_SUMMARY = {
  price: {
    symbol: 'AAPL', longName: 'Apple Inc.', exchangeName: 'NasdaqGS',
    currency: 'USD', regularMarketPrice: 190
  },
  summaryProfile: { sector: 'Technology' },
  defaultKeyStatistics: { sharesOutstanding: 15_000_000_000, bookValue: 4.5, trailingEps: 6.1 },
  financialData: { earningsGrowth: 0.12, currentRatio: 0.98, quickRatio: 0.84, netIncomeToCommon: 97_000_000_000 },
  summaryDetail: { exDividendDate: 1_700_000_000_000, dividendRate: 0.96 }
};

const TIME_SERIES = [
  { date: '2023-09-30', freeCashFlow: 99_000_000_000 },
  { date: '2021-09-30', freeCashFlow: 93_000_000_000 },
  { date: '2022-09-30', freeCashFlow: 111_000_000_000 }
];

test('getStockData returns quote, financials and the raw provider payload from one fetch', async () => {
  const provider = makeProvider(FULL_SUMMARY, TIME_SERIES);
  const result = await provider.getStockData('AAPL');

  expect(result.quote.symbol).toBe('AAPL');
  expect(result.quote.companyName).toBe('Apple Inc.');
  expect(result.quote.currentPrice).toBe(190);
  expect(result.financials.bookValuePerShare).toBe(4.5);
  expect((result.raw as any).quoteSummary).toEqual(FULL_SUMMARY);
  expect((result.raw as any).fundamentalsTimeSeries).toEqual(TIME_SERIES);
});

test('getStockData fetches the quote summary exactly once per call', async () => {
  const provider = makeProvider(FULL_SUMMARY, TIME_SERIES);
  await provider.getStockData('AAPL');
  expect((provider as any).client.quoteSummary).toHaveBeenCalledTimes(1);
});

test('getStockData sorts free cash flow history oldest-first regardless of response order', async () => {
  const provider = makeProvider(FULL_SUMMARY, TIME_SERIES);
  const result = await provider.getStockData('AAPL');
  expect(result.financials.freeCashFlowHistory).toEqual([93_000_000_000, 111_000_000_000, 99_000_000_000]);
});

test('getStockData leaves unresolvable metadata undefined rather than defaulting to a placeholder', async () => {
  const provider = makeProvider(
    { ...FULL_SUMMARY, summaryProfile: undefined, price: { ...FULL_SUMMARY.price, exchangeName: 'SomeUnmappedExchange' } },
    TIME_SERIES
  );
  const result = await provider.getStockData('AAPL');

  expect(result.quote.sector).toBeUndefined();
  expect(result.quote.exchange).toBe('SomeUnmappedExchange');
  expect(result.quote.country).toBeUndefined();
});

test('getStockData throws SymbolNotFoundError when Yahoo reports the symbol is not found', async () => {
  const provider = new YahooFinanceV4Provider();
  (provider as any).client = {
    quoteSummary: jest.fn(async () => { throw new Error('Quote not found for ticker symbol: ZZZZ'); }),
    fundamentalsTimeSeries: jest.fn(async () => [])
  };
  await expect(provider.getStockData('ZZZZ')).rejects.toThrow(SymbolNotFoundError);
});

test('getStockData throws SymbolNotFoundError when the response has no price module', async () => {
  const provider = makeProvider({ summaryProfile: { sector: 'Technology' } }, TIME_SERIES);
  await expect(provider.getStockData('ZZZZ')).rejects.toThrow(SymbolNotFoundError);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/providers/yahoo-finance-v4.provider.test.ts
```

Expected: FAIL — `provider.getStockData is not a function`.

- [ ] **Step 3: Reshape the provider interface**

Replace the whole of `backend/src/providers/stock-data-provider.interface.ts` with:

```ts
import { RawQuote, RawFinancials } from '../types/domain';

export interface StockData {
  quote: RawQuote;
  financials: RawFinancials;
  // The unprocessed provider response, archived to tickerhistories so an
  // unhelpful error message can be traced back to what the provider actually
  // returned. Deliberately untyped - its shape is the provider's business.
  raw: unknown;
}

export interface StockDataProvider {
  getStockData(symbol: string): Promise<StockData>;
}
```

- [ ] **Step 4: Make the quote metadata fields optional**

In `backend/src/types/domain.ts`, replace the `RawQuote` interface with:

```ts
export interface RawQuote {
  symbol: string;
  // Metadata the provider may not supply for every symbol. Left undefined
  // rather than defaulted here, so datapoint-calculators.ts is the single
  // place that decides the fallback value and the error message.
  companyName?: string;
  sector?: string;
  exchange?: string;
  country?: string;
  currency: string;
  currentPrice: number;
}
```

In the same file, delete the `RatioResult` interface entirely (its consumer is removed in Task 2).

- [ ] **Step 5: Rewrite the v4 provider**

Replace the whole of `backend/src/providers/yahoo-finance-v4.provider.ts` with:

```ts
// backend/src/providers/yahoo-finance-v4.provider.ts
//
// The only StockDataProvider implementation, built on yahoo-finance2 v4
// (installed under the package alias `yahoo-finance2-v4`).
//
// Field names below (price/summaryProfile/defaultKeyStatistics/financialData/
// summaryDetail modules) are verified against the installed package's
// TypeScript definitions, which is authoritative for field *existence* - but
// not yet against a live response, since Yahoo was rate-limiting when this
// was written. The "not found" error message pattern is likewise unverified.
// See TODO.md; spot-check once unblocked.
//
// Cash flow data is not available via quoteSummary in v4 - Yahoo moved it to
// fundamentalsTimeSeries - so a full fetch is two Yahoo requests.
import YahooFinance from 'yahoo-finance2-v4';
import { StockDataProvider, StockData } from './stock-data-provider.interface';
import { RawQuote, RawFinancials } from '../types/domain';
import { SymbolNotFoundError } from '../errors/symbol-not-found.error';
import { logger } from '../logger';

const SCOPE = 'YahooFinanceProvider(v4)';

// Derived empirically against the exchange names Yahoo returns. An exchange
// missing from this map yields an undefined country and a recorded error,
// which is how gaps here become visible.
const EXCHANGE_COUNTRY_MAP: Record<string, string> = {
  NasdaqGS: 'US', NASDAQ: 'US', NYSE: 'US', Toronto: 'CA', TSX: 'CA',
  NSE: 'IN', BSE: 'IN', LSE: 'GB', XETRA: 'DE'
};

const NOT_FOUND_MESSAGE_PATTERN = /not found/i;

function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && NOT_FOUND_MESSAGE_PATTERN.test(err.message);
}

const QUOTE_SUMMARY_MODULES = [
  'price',
  'summaryProfile',
  'defaultKeyStatistics',
  'financialData',
  'summaryDetail'
] as const;

// RawFinancials documents "up to 5 years" of freeCashFlowHistory.
const CASH_FLOW_HISTORY_YEARS = 5;

export class YahooFinanceV4Provider implements StockDataProvider {
  private client = new YahooFinance();

  async getStockData(symbol: string): Promise<StockData> {
    logger.info(SCOPE, `getStockData(${symbol}) - calling Yahoo quoteSummary`, { symbol, modules: QUOTE_SUMMARY_MODULES });
    const quoteSummary = await this.fetchQuoteSummary(symbol);

    logger.info(SCOPE, `getStockData(${symbol}) - calling fundamentalsTimeSeries for cash flow`, { symbol });
    const fundamentalsTimeSeries = await this.fetchFundamentalsTimeSeries(symbol);

    const quote = this.toQuote(symbol, quoteSummary);
    const financials = this.toFinancials(symbol, quoteSummary, fundamentalsTimeSeries);

    logger.info(SCOPE, `getStockData(${symbol}) - resolved`, {
      symbol, currentPrice: quote.currentPrice, currency: quote.currency,
      exchange: quote.exchange, freeCashFlowYears: financials.freeCashFlowHistory.length
    });

    return { quote, financials, raw: { quoteSummary, fundamentalsTimeSeries } };
  }

  private async fetchQuoteSummary(symbol: string): Promise<any> {
    try {
      return await this.client.quoteSummary(symbol, { modules: QUOTE_SUMMARY_MODULES } as any);
    } catch (err) {
      if (isNotFoundError(err)) {
        logger.warn(SCOPE, `fetchQuoteSummary(${symbol}) - Yahoo reports symbol not found`, { symbol });
        throw new SymbolNotFoundError(symbol);
      }
      logger.error(SCOPE, `fetchQuoteSummary(${symbol}) - Yahoo call failed`, { symbol, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  // fundamentalsTimeSeries returns one entry per period with a `date` and
  // `freeCashFlow`. Order across periods is not documented, so the mapping
  // sorts by date rather than assuming one.
  private async fetchFundamentalsTimeSeries(symbol: string): Promise<any[]> {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - CASH_FLOW_HISTORY_YEARS);

    return await (this.client as any).fundamentalsTimeSeries(symbol, {
      period1,
      type: 'annual',
      module: 'cash-flow'
    });
  }

  private toQuote(symbol: string, summary: any): RawQuote {
    const price = summary?.price;
    if (!price) {
      logger.warn(SCOPE, `toQuote(${symbol}) - no price module in response`, { symbol });
      throw new SymbolNotFoundError(symbol);
    }

    const exchange = price.exchangeName ?? price.exchange;
    return {
      symbol: price.symbol ?? symbol,
      companyName: price.longName ?? price.shortName,
      sector: summary.summaryProfile?.sector,
      exchange,
      country: exchange ? EXCHANGE_COUNTRY_MAP[exchange] : undefined,
      currency: price.currency,
      currentPrice: price.regularMarketPrice
    };
  }

  private toFinancials(symbol: string, summary: any, timeSeries: any[]): RawFinancials {
    const stats = summary.defaultKeyStatistics;
    const financialData = summary.financialData;
    const summaryDetail = summary.summaryDetail;

    return {
      symbol,
      freeCashFlowHistory: [...(timeSeries ?? [])]
        .filter(r => typeof r.freeCashFlow === 'number')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(r => r.freeCashFlow),
      sharesOutstanding: stats?.sharesOutstanding,
      bookValuePerShare: stats?.bookValue,
      earningsPerShare: stats?.trailingEps,
      earningsGrowthRate: financialData?.earningsGrowth
        ? financialData.earningsGrowth * 100
        : undefined,
      currentRatio: financialData?.currentRatio,
      quickRatio: financialData?.quickRatio,
      lastDividendDate: summaryDetail?.exDividendDate
        ? new Date(summaryDetail.exDividendDate)
        : undefined,
      lastDividendAmount: summaryDetail?.dividendRate,
      dividendsPaidTTM: summaryDetail?.dividendRate && stats?.sharesOutstanding
        ? summaryDetail.dividendRate * stats.sharesOutstanding
        : undefined,
      netIncomeTTM: financialData?.netIncomeToCommon,
      priceToBookIndustryAvg: undefined,
      currentRatioIndustryAvg: undefined,
      quickRatioIndustryAvg: undefined
    };
  }
}
```

- [ ] **Step 6: Run the provider test to verify it passes**

```bash
npx jest src/providers/yahoo-finance-v4.provider.test.ts
```

Expected: PASS, all 6 tests.

- [ ] **Step 7: Delete the v2 provider and its tests**

```bash
git rm src/providers/yahoo-finance.provider.ts src/providers/yahoo-finance.provider.test.ts src/providers/yahoo-finance.provider.live.test.ts
```

- [ ] **Step 8: Wire the provider up directly in server.ts**

In `backend/src/server.ts`, delete the `YahooFinanceProvider` import, the `StockDataProvider` import, the entire `createStockDataProvider()` function and its comment block. Change the `TickerService` construction to:

```ts
  const tickerService = new TickerService(
    new YahooFinanceV4Provider(),
    new DcfFairValueCalculator(),
    new CachedCurrencyConverter(new FrankfurterConverter())
  );
```

- [ ] **Step 9: Update the TickerService call site**

In `backend/src/services/ticker.service.ts`, inside `fetchCachedData`, replace the two separate provider calls:

```ts
    logger.info(SCOPE, `fetchCachedData(${symbol}) - calling provider.getQuote`, { symbol });
    const quote = await this.provider.getQuote(symbol);
    logger.info(SCOPE, `fetchCachedData(${symbol}) - got quote`, { symbol, currentPrice: quote.currentPrice, currency: quote.currency, exchange: quote.exchange });

    logger.info(SCOPE, `fetchCachedData(${symbol}) - calling provider.getFinancials`, { symbol });
    const financials = await this.provider.getFinancials(symbol);
    logger.info(SCOPE, `fetchCachedData(${symbol}) - got financials`, { symbol, fcfYears: financials.freeCashFlowHistory.length });
```

with:

```ts
    logger.info(SCOPE, `fetchCachedData(${symbol}) - calling provider.getStockData`, { symbol });
    const { quote, financials } = await this.provider.getStockData(symbol);
    logger.info(SCOPE, `fetchCachedData(${symbol}) - got stock data`, { symbol, currentPrice: quote.currentPrice, currency: quote.currency, fcfYears: financials.freeCashFlowHistory.length });
```

Then fix the four places the now-optional metadata fields are returned. In the same method's return statement, replace:

```ts
      companyName: quote.companyName,
      sector: quote.sector,
      exchange: quote.exchange,
      country: quote.country,
```

with:

```ts
      companyName: quote.companyName ?? 'Unavailable',
      sector: quote.sector ?? 'Unavailable',
      exchange: quote.exchange ?? 'Unavailable',
      country: quote.country ?? 'Unavailable',
```

These stopgap `??` fallbacks are replaced by real calculators in Task 4. Also widen the method's return type annotation for those four fields if `tsc` complains.

- [ ] **Step 10: Update the fake provider in the service test**

In `backend/src/services/ticker.service.test.ts`, replace the `fakeProvider` const (lines 12–29) with:

```ts
const fakeProvider: StockDataProvider = {
  getStockData: async (symbol: string) => ({
    quote: {
      symbol, companyName: `${symbol} Inc.`, sector: 'Technology',
      exchange: 'NASDAQ', country: 'US', currency: 'USD', currentPrice: 100
    },
    financials: {
      symbol,
      freeCashFlowHistory: [10, 11, 12],
      sharesOutstanding: 100,
      bookValuePerShare: 50,
      earningsPerShare: 5,
      earningsGrowthRate: 10,
      currentRatio: 2,
      quickRatio: 1.6,
      dividendsPaidTTM: 20,
      netIncomeTTM: 100
    },
    raw: { quoteSummary: { stub: true }, fundamentalsTimeSeries: [] }
  })
};
```

Then replace the `echoingProvider` in the test named `'addTicker stores the canonical symbol Yahoo echoes back, not the raw route param'` with:

```ts
  const echoingProvider: StockDataProvider = {
    getStockData: async (symbol: string) => {
      const base = await fakeProvider.getStockData(symbol);
      return { ...base, quote: { ...base.quote, symbol: symbol.toUpperCase() } };
    }
  };
```

- [ ] **Step 11: Drop the v2 dependency**

In `backend/package.json`, remove the `"yahoo-finance2": "^2.11.3",` line from `dependencies`. Keep `"yahoo-finance2-v4"`. Then:

```bash
npm install
```

- [ ] **Step 12: Type check and run the full suite**

```bash
npx tsc --noEmit && npm test
```

Expected: PASS. All existing `ticker.service.test.ts`, `app.test.ts`, calculator and converter tests still pass — behavior is unchanged so far, only the provider shape moved.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor: collapse to a single Yahoo v4 provider with getStockData

Removes the v2 provider and the STOCK_DATA_PROVIDER switch. getQuote and
getFinancials merge into one getStockData call that also returns the raw
provider payload, which the history collection will archive for debugging.
Quote metadata fields become optional so a single place can decide their
fallbacks."
```

---

## Task 2: Isolated datapoint calculators

The core of the change: one non-throwing function per derived datapoint. Nothing consumes this module yet — Task 4 wires it in.

**Files:**
- Create: `backend/src/services/datapoint-calculators.ts`
- Create: `backend/src/services/datapoint-calculators.test.ts`
- Delete: `backend/src/services/ratio.service.ts`
- Delete: `backend/src/services/ratio.service.test.ts`

**Interfaces:**
- Consumes: `RawQuote`, `RawFinancials` from `types/domain` (Task 1 made the `RawQuote` metadata fields optional); `FairValueCalculator` from `providers/fair-value-calculator.interface`; `CurrencyConverter` from `providers/currency-converter.interface`.
- Produces, all exported from `services/datapoint-calculators.ts`:
  - `interface Calculated<T> { value: T; error?: string }`
  - `const UNAVAILABLE = 'Unavailable'`
  - `computeCompanyName(quote: RawQuote): Calculated<string>`
  - `computeSector(quote: RawQuote): Calculated<string>`
  - `computeExchange(quote: RawQuote): Calculated<string>`
  - `computeCountry(quote: RawQuote): Calculated<string>`
  - `computeFairValue(financials: RawFinancials, calculator: FairValueCalculator): Promise<Calculated<number>>`
  - `computePriceToBook(quote: RawQuote, financials: RawFinancials): Calculated<number>`
  - `computePegRatio(quote: RawQuote, financials: RawFinancials): Calculated<number | undefined>`
  - `computeCurrentRatio(financials: RawFinancials): Calculated<number>`
  - `computeQuickRatio(financials: RawFinancials): Calculated<number>`
  - `computePayoutRatio(financials: RawFinancials): Calculated<number | undefined>`
  - `computeFxRate(quote: RawQuote, toCurrency: string, converter: CurrencyConverter): Promise<Calculated<number>>`
  - `collectErrors(results: Record<string, Calculated<unknown>>): Record<string, string>`

  Task 4 calls every one of these by exactly these names.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/datapoint-calculators.test.ts`:

```ts
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
  const result = computePriceToBook(quote, { ...financials, bookValuePerShare: undefined as any });
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
  const result = computePegRatio(quote, { ...financials, earningsPerShare: undefined as any });
  expect(result.value).toBe(0);
  expect(result.error).toMatch(/earnings per share/i);
});

// --- current / quick ratios ---

test('computeCurrentRatio passes through the provider value', () => {
  expect(computeCurrentRatio(financials)).toEqual({ value: 2 });
});

test('computeCurrentRatio returns 0 and an error when the provider omits it', () => {
  const result = computeCurrentRatio({ ...financials, currentRatio: undefined as any });
  expect(result.value).toBe(0);
  expect(result.error).toBeTruthy();
});

test('computeQuickRatio passes through the provider value, distinct from currentRatio', () => {
  expect(computeQuickRatio(financials)).toEqual({ value: 1.6 });
});

test('computeQuickRatio returns 0 and an error when the provider omits it', () => {
  const result = computeQuickRatio({ ...financials, quickRatio: undefined as any });
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/services/datapoint-calculators.test.ts
```

Expected: FAIL — `Cannot find module './datapoint-calculators'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/datapoint-calculators.ts`:

```ts
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
    return failed('payoutRatio', 0, 'Net income (TTM) not provided by the data provider');
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest src/services/datapoint-calculators.test.ts
```

Expected: PASS, all 26 tests.

- [ ] **Step 5: Delete the ratio service**

Its cases are covered above (price-to-book, PEG present/absent, current and quick ratio pass-through, payout ratio present/absent).

```bash
git rm src/services/ratio.service.ts src/services/ratio.service.test.ts
```

- [ ] **Step 6: Confirm the build breaks only where expected**

```bash
npx tsc --noEmit
```

Expected: FAIL, with errors only in `src/services/ticker.service.ts` about the missing `./ratio.service` import. Task 4 fixes them. If any other file errors, stop and investigate — nothing else should import `RatioService`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add isolated per-datapoint calculators

Each function returns {value, error?} and never throws, so a datapoint that
cannot be derived falls back to a default and records why instead of failing
the whole ticker. Replaces RatioService. Not yet wired into TickerService -
the build is intentionally broken there until the next commit."
```

Note: this commit leaves the build broken by design (the compiler catches it in Task 4 Step 8). If you prefer a green tree at every commit, squash this with Task 4's commit.

---

## Task 3: Model changes

Adds the `datapointErrors` field and reshapes the history document to carry errors and the raw payload.

**Files:**
- Modify: `backend/src/models/ticker.model.ts`
- Modify: `backend/src/models/ticker-history.model.ts`
- Modify: `backend/src/models/ticker.model.test.ts`

**Interfaces:**
- Produces: `TickerDocument.datapointErrors?: Map<string, string>` on `models/ticker.model.ts`; `CachedData` without `fairValueError`; `TickerHistoryDocument { symbol, archivedAt, data, datapointErrors?, stockRawData? }` on `models/ticker-history.model.ts`. Tasks 4 and 5 depend on both.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/models/ticker.model.test.ts`:

```ts
test('stores a datapointErrors map keyed by datapoint field name', async () => {
  await TickerModel.create({
    symbol: 'BROKEN',
    companyName: 'Broken Co',
    sector: 'Technology',
    exchange: 'NASDAQ',
    country: 'US',
    nativeCurrency: 'USD',
    lists: ['watchlist'],
    datapointErrors: { fairValue: 'No historic data available' }
  });

  const found = await TickerModel.findOne({ symbol: 'BROKEN' });
  expect(found?.datapointErrors?.get('fairValue')).toBe('No historic data available');
});

test('serializes the datapointErrors map to a plain object in JSON', async () => {
  await TickerModel.create({
    symbol: 'BROKEN2',
    companyName: 'Broken Co 2',
    sector: 'Technology',
    exchange: 'NASDAQ',
    country: 'US',
    nativeCurrency: 'USD',
    lists: ['watchlist'],
    datapointErrors: { fairValue: 'No historic data available' }
  });

  const found = await TickerModel.findOne({ symbol: 'BROKEN2' });
  expect(JSON.parse(JSON.stringify(found)).datapointErrors).toEqual({ fairValue: 'No historic data available' });
});
```

Create `backend/src/models/ticker-history.model.test.ts`:

```ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TickerHistoryModel } from './ticker-history.model';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await TickerHistoryModel.deleteMany({});
});

test('stores a snapshot with its datapointErrors and the raw provider payload', async () => {
  await TickerHistoryModel.create({
    symbol: 'AAPL',
    archivedAt: new Date('2026-08-14T00:00:00Z'),
    data: { fetchedAt: new Date('2026-08-14T00:00:00Z'), currentPrice: 190, fairValue: 0 },
    datapointErrors: { fairValue: 'No historic data available' },
    stockRawData: { quoteSummary: { price: { regularMarketPrice: 190 } }, fundamentalsTimeSeries: [] }
  });

  const found = await TickerHistoryModel.findOne({ symbol: 'AAPL' });
  expect((found?.data as any).currentPrice).toBe(190);
  expect((found?.datapointErrors as any).fairValue).toBe('No historic data available');
  expect((found?.stockRawData as any).quoteSummary.price.regularMarketPrice).toBe(190);
});

test('accepts snapshots without datapointErrors or raw data, so pre-existing history still reads', async () => {
  await TickerHistoryModel.create({
    symbol: 'MSFT',
    archivedAt: new Date('2026-01-01T00:00:00Z'),
    data: { fetchedAt: new Date('2026-01-01T00:00:00Z'), currentPrice: 400 }
  });

  const found = await TickerHistoryModel.findOne({ symbol: 'MSFT' });
  expect(found?.datapointErrors).toBeUndefined();
  expect(found?.stockRawData).toBeUndefined();
});

test('appends rather than replaces, so repeated snapshots for one symbol all persist', async () => {
  for (const price of [100, 101, 102]) {
    await TickerHistoryModel.create({
      symbol: 'AAPL',
      archivedAt: new Date(),
      data: { fetchedAt: new Date(), currentPrice: price }
    });
  }

  expect(await TickerHistoryModel.countDocuments({ symbol: 'AAPL' })).toBe(3);
});

test('indexes symbol with archivedAt descending for per-symbol time-series reads', () => {
  const indexes = TickerHistoryModel.schema.indexes();
  const compound = indexes.find(([fields]) => 'symbol' in fields && 'archivedAt' in fields);
  expect(compound?.[0]).toEqual({ symbol: 1, archivedAt: -1 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/models/
```

Expected: FAIL — `found?.datapointErrors` is undefined on the ticker test, and the history model rejects `datapointErrors`/`stockRawData` as unknown paths.

- [ ] **Step 3: Add datapointErrors to the ticker model**

In `backend/src/models/ticker.model.ts`:

Remove `fairValueError?: string;` and the four-line comment above it from the `CachedData` interface. Remove `fairValueError: String` from `cachedDataSchema`.

Add to the `TickerDocument` interface, after `cachedData`:

```ts
  // Per-datapoint failure reasons, keyed by cachedData field name (e.g.
  // datapointErrors.fairValue). Replaced wholesale on every fetch rather than merged,
  // so a datapoint that starts working again stops reporting an error.
  datapointErrors?: Map<string, string>;
```

Add to `tickerSchema`, after `cachedData`:

```ts
  // A Map rather than a fixed sub-schema so adding a datapoint later needs no
  // schema change. Mongoose serializes Maps to plain objects in JSON, so API
  // consumers see an ordinary object.
  datapointErrors: { type: Map, of: String, default: {} }
```

- [ ] **Step 4: Rewrite the history model**

Replace the whole of `backend/src/models/ticker-history.model.ts` with:

```ts
import { Schema, model, Document } from 'mongoose';
import { CachedData } from './ticker.model';

export interface TickerHistoryDocument extends Document {
  symbol: string;
  archivedAt: Date;
  data: CachedData;
  datapointErrors?: Record<string, string>;
  // The unprocessed provider response for this fetch. Lives only here, never
  // on the ticker document, which keeps the tickers collection light for the
  // UI and makes its absence from API responses structural.
  stockRawData?: unknown;
}

// `data` is Mixed rather than a copy of CachedData's field list: history is
// written and read as an opaque snapshot, and restating the schema means
// editing two files in lockstep every time a datapoint is added.
const tickerHistorySchema = new Schema<TickerHistoryDocument>({
  symbol: { type: String, required: true },
  archivedAt: { type: Date, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  datapointErrors: { type: Schema.Types.Mixed },
  stockRawData: { type: Schema.Types.Mixed }
});

// Per-symbol time-series reads are the access pattern this collection exists
// for. Snapshots are appended, never updated, so this collection grows with
// every add and refresh.
tickerHistorySchema.index({ symbol: 1, archivedAt: -1 });

export const TickerHistoryModel = model<TickerHistoryDocument>('TickerHistory', tickerHistorySchema);
```

- [ ] **Step 5: Run the model tests to verify they pass**

```bash
npx jest src/models/
```

Expected: PASS, all 6 tests.

- [ ] **Step 6: Commit**

Note: `npx tsc --noEmit` still fails here — dropping `fairValueError` from
`CachedData` breaks `ticker.service.ts`, which is still the previous version.
The model tests pass because they do not import the service. Task 4 restores a
green build.

```bash
git add -A
git commit -m "feat: add datapointErrors map to tickers, raw payload to history

datapointErrors is a Mongoose Map keyed by datapoint field name, replacing the single
cachedData.fairValueError. History documents gain datapointErrors and stockRawData,
their data field becomes Mixed so it needn't track CachedData, and the
collection gains a {symbol, archivedAt} index for time-series reads."
```

---

## Task 4: Rewire TickerService

Turns `fetchCachedData` into pure orchestration and makes every write to `tickers` append a history snapshot.

**Files:**
- Modify: `backend/src/services/ticker.service.ts`
- Modify: `backend/src/services/ticker.service.test.ts`

**Interfaces:**
- Consumes: `getStockData`/`StockData` (Task 1); every `compute*` function and `collectErrors` (Task 2); `TickerDocument.datapointErrors` and the new `TickerHistoryDocument` (Task 3).
- Produces: `TickerService.fetchStockData()` private method returning `{ symbol, companyName, sector, exchange, country, nativeCurrency, cachedData, datapointErrors, raw }`. Task 5 depends on `TickerDocument.datapointErrors` being populated.

- [ ] **Step 1: Write the failing test**

In `backend/src/services/ticker.service.test.ts`:

First, delete the two obsolete tests — `'addTicker falls back to fairValue=0 and records fairValueError when the DCF calculation fails'` and `'a later successful refresh clears a previously-recorded fairValueError'` — and the test `'refreshTicker archives the previous cachedData into tickerHistory before overwriting'`. They are replaced below.

Then fix the two `ensureFresh` tests, whose history-count expectations invert under the new behavior:

- In `'ensureFresh refreshes a ticker whose cachedData is older than 15 days'`, change `expect(historyEntries).toHaveLength(1)` to `expect(historyEntries).toHaveLength(2)` — one from the add, one from the refresh.
- In `'ensureFresh does not refresh a ticker whose cachedData is within 15 days'`, change `expect(historyEntries).toHaveLength(0)` to `expect(historyEntries).toHaveLength(1)` — the add alone writes one.

Also consolidate the two separate `afterEach` blocks (lines 58–60 and 162–164) into one at the top:

```ts
afterEach(async () => {
  await TickerModel.deleteMany({});
  await TickerHistoryModel.deleteMany({});
});
```

Then append:

```ts
const failingConverter: CurrencyConverter = {
  getRate: async () => { throw new Error('Frankfurter unreachable'); }
};

test('a failed datapoint records an error and leaves every other datapoint intact', async () => {
  const service = new TickerService(fakeProvider, failingCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(ticker.cachedData?.fairValue).toBe(0);
  expect(ticker.cachedData?.nativeFairValue).toBe(0);
  expect(ticker.datapointErrors?.get('fairValue')).toBe(
    'At least one valid year-over-year comparison with a positive prior-year free cash flow is required for a DCF calculation'
  );
  expect(ticker.cachedData?.currentPrice).toBe(100);
  expect(ticker.cachedData?.priceToBook).toBe(2);
  expect(ticker.cachedData?.currentRatio).toBe(2);
});

test('two independent failures each record their own error without affecting the rest', async () => {
  const brokenProvider: StockDataProvider = {
    getStockData: async (symbol: string) => {
      const base = await fakeProvider.getStockData(symbol);
      return {
        ...base,
        financials: { ...base.financials, bookValuePerShare: 0, quickRatio: undefined as any }
      };
    }
  };
  const service = new TickerService(brokenProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(Object.keys(Object.fromEntries(ticker.datapointErrors!)).sort()).toEqual(['priceToBook', 'quickRatio']);
  expect(ticker.cachedData?.priceToBook).toBe(0);
  expect(ticker.cachedData?.quickRatio).toBe(0);
  expect(ticker.cachedData?.fairValue).toBe(120);
  expect(ticker.cachedData?.currentRatio).toBe(2);
});

test('a successful fetch stores an empty datapointErrors object', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  expect(Object.fromEntries(ticker.datapointErrors!)).toEqual({});
});

test('a refresh replaces the datapointErrors object rather than merging, so recovered datapoints clear', async () => {
  const service = new TickerService(fakeProvider, failingCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  expect(ticker.datapointErrors?.get('fairValue')).toBeDefined();

  const recoveredService = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const refreshed = await recoveredService.refreshTicker('AAPL');

  expect(refreshed.datapointErrors?.get('fairValue')).toBeUndefined();
  expect(refreshed.cachedData?.fairValue).toBe(120);
});

test('a failed FX lookup falls back to rate 1 so prices stay in native currency, not zero', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, failingConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(ticker.cachedData?.fxRateToUsd).toBe(1);
  expect(ticker.cachedData?.currentPrice).toBe(100);
  expect(ticker.cachedData?.nativeFairValue).toBe(120);
  expect(ticker.datapointErrors?.get('fxRateToUsd')).toBe('Frankfurter unreachable');
});

test('addTicker writes one history snapshot carrying the raw provider payload', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');

  const history = await TickerHistoryModel.find({ symbol: 'AAPL' });
  expect(history).toHaveLength(1);
  expect((history[0].data as any).currentPrice).toBe(100);
  expect((history[0].stockRawData as any).quoteSummary).toEqual({ stub: true });
});

test('each refresh appends another history snapshot rather than replacing one', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');
  await service.refreshTicker('AAPL');
  await service.refreshTicker('AAPL');
  await service.refreshTicker('AAPL');

  expect(await TickerHistoryModel.countDocuments({ symbol: 'AAPL' })).toBe(4);
});

test('a history snapshot records the datapointErrors from its own fetch', async () => {
  const service = new TickerService(fakeProvider, failingCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');

  const history = await TickerHistoryModel.findOne({ symbol: 'AAPL' });
  expect((history?.datapointErrors as any).fairValue).toBeTruthy();
});

test('a history write failure is logged but does not fail the add', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const createSpy = jest.spyOn(TickerHistoryModel, 'create')
    .mockRejectedValueOnce(new Error('history collection unavailable') as never);

  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(ticker.cachedData?.currentPrice).toBe(100);
  expect(await TickerModel.countDocuments({ symbol: 'AAPL' })).toBe(1);
  createSpy.mockRestore();
});

test('a provider failure still aborts the add entirely and writes nothing', async () => {
  const deadProvider: StockDataProvider = {
    getStockData: async () => { throw new Error('Yahoo unreachable'); }
  };
  const service = new TickerService(deadProvider, fakeCalculator, fakeConverter);

  await expect(service.addTicker('AAPL', 'portfolio')).rejects.toThrow('Yahoo unreachable');
  expect(await TickerModel.countDocuments({ symbol: 'AAPL' })).toBe(0);
  expect(await TickerHistoryModel.countDocuments({ symbol: 'AAPL' })).toBe(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/services/ticker.service.test.ts
```

Expected: FAIL — compilation errors from the missing `./ratio.service` import, plus `ticker.datapointErrors` undefined.

- [ ] **Step 3: Rewrite the service's fetch and write paths**

In `backend/src/services/ticker.service.ts`, replace the imports at the top:

```ts
import { StockDataProvider } from '../providers/stock-data-provider.interface';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';
import { RatioService } from './ratio.service';
import { TickerModel, TickerDocument, CachedData } from '../models/ticker.model';
import { TickerHistoryModel } from '../models/ticker-history.model';
import { logger } from '../logger';
```

with:

```ts
import { StockDataProvider } from '../providers/stock-data-provider.interface';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';
import {
  computeCompanyName, computeSector, computeExchange, computeCountry,
  computeFairValue, computePriceToBook, computePegRatio,
  computeCurrentRatio, computeQuickRatio, computePayoutRatio,
  computeFxRate, collectErrors
} from './datapoint-calculators';
import { TickerModel, TickerDocument, CachedData } from '../models/ticker.model';
import { TickerHistoryModel } from '../models/ticker-history.model';
import { logger } from '../logger';
```

Add this type above the class:

```ts
interface FetchedStock {
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  nativeCurrency: string;
  cachedData: CachedData;
  datapointErrors: Record<string, string>;
  raw: unknown;
}
```

Replace the entire `fetchCachedData` method with:

```ts
  // Pure orchestration: fetch once, then run each datapoint calculation
  // independently. None of the calculators throw, so a company missing one or
  // two derivable figures still produces a complete document with the reasons
  // recorded alongside it.
  private async fetchStockData(symbol: string): Promise<FetchedStock> {
    logger.info(SCOPE, `fetchStockData(${symbol}) - calling provider`, { symbol });
    const { quote, financials, raw } = await this.provider.getStockData(symbol);
    logger.info(SCOPE, `fetchStockData(${symbol}) - got stock data`, {
      symbol, currentPrice: quote.currentPrice, currency: quote.currency,
      fcfYears: financials.freeCashFlowHistory.length
    });

    const companyName = computeCompanyName(quote);
    const sector = computeSector(quote);
    const exchange = computeExchange(quote);
    const country = computeCountry(quote);
    const fairValue = await computeFairValue(financials, this.calculator);
    const priceToBook = computePriceToBook(quote, financials);
    const pegRatio = computePegRatio(quote, financials);
    const currentRatio = computeCurrentRatio(financials);
    const quickRatio = computeQuickRatio(financials);
    const payoutRatio = computePayoutRatio(financials);
    const fxRateToUsd = await computeFxRate(quote, DISPLAY_CURRENCY, this.converter);

    const errors = collectErrors({
      companyName, sector, exchange, country, fairValue, priceToBook,
      pegRatio, currentRatio, quickRatio, payoutRatio, fxRateToUsd
    });

    // Native values are stored pre-conversion, so a failed FX lookup leaves
    // them correct regardless of what the rate fell back to.
    const cachedData: CachedData = {
      fetchedAt: new Date(),
      currentPrice: quote.currentPrice * fxRateToUsd.value,
      fairValue: fairValue.value * fxRateToUsd.value,
      nativePrice: quote.currentPrice,
      nativeFairValue: fairValue.value,
      fxRateToUsd: fxRateToUsd.value,
      priceToBook: priceToBook.value,
      priceToBookIndustryAvg: financials.priceToBookIndustryAvg,
      pegRatio: pegRatio.value,
      currentRatio: currentRatio.value,
      currentRatioIndustryAvg: financials.currentRatioIndustryAvg,
      quickRatio: quickRatio.value,
      quickRatioIndustryAvg: financials.quickRatioIndustryAvg,
      lastDividendDate: financials.lastDividendDate,
      lastDividendAmount: financials.lastDividendAmount,
      payoutRatio: payoutRatio.value
    };

    logger.info(SCOPE, `fetchStockData(${symbol}) - assembled`, { symbol, errorFields: Object.keys(errors) });

    return {
      symbol: quote.symbol,
      companyName: companyName.value,
      sector: sector.value,
      exchange: exchange.value,
      country: country.value,
      nativeCurrency: quote.currency,
      cachedData,
      datapointErrors,
      raw
    };
  }

  // Every write to the tickers collection appends a snapshot here, so the
  // tickers collection stays light for the UI while history carries both the
  // time series and the raw payload for debugging. A failure to archive is
  // logged but never fails the add/refresh - the ticker document is what the
  // UI needs; history is supporting data.
  private async archiveSnapshot(symbol: string, fetched: FetchedStock): Promise<void> {
    try {
      await TickerHistoryModel.create({
        symbol,
        archivedAt: fetched.cachedData.fetchedAt,
        data: fetched.cachedData,
        datapointErrors: fetched.datapointErrors,
        stockRawData: fetched.raw
      });
      logger.info(SCOPE, `archiveSnapshot(${symbol}) - snapshot written`, { symbol, archivedAt: fetched.cachedData.fetchedAt });
    } catch (err) {
      logger.error(SCOPE, `archiveSnapshot(${symbol}) - failed to write snapshot, continuing`, {
        symbol, error: err instanceof Error ? err.message : String(err)
      });
    }
  }
```

- [ ] **Step 4: Update addTicker to write datapointErrors and archive**

In `addTicker`, replace the destructuring and creation block:

```ts
    logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - no existing document, fetching fresh data`, { symbol: normalizedSymbol });
    const { companyName, sector, exchange, country, nativeCurrency, cachedData, symbol: canonicalSymbol } =
      await this.fetchCachedData(normalizedSymbol);

    const created = await TickerModel.create({
      symbol: canonicalSymbol, companyName, sector, exchange, country, nativeCurrency,
      lists: [list], cachedData
    });
    logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - saved new document to MongoDB`, { symbol: canonicalSymbol, id: String(created._id) });
    return created;
```

with:

```ts
    logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - no existing document, fetching fresh data`, { symbol: normalizedSymbol });
    const fetched = await this.fetchStockData(normalizedSymbol);

    const created = await TickerModel.create({
      symbol: fetched.symbol, companyName: fetched.companyName, sector: fetched.sector,
      exchange: fetched.exchange, country: fetched.country, nativeCurrency: fetched.nativeCurrency,
      lists: [list], cachedData: fetched.cachedData, datapointErrors: fetched.datapointErrors
    });
    logger.info(SCOPE, `addTicker(${normalizedSymbol}, ${list}) - saved new document to MongoDB`, { symbol: fetched.symbol, id: String(created._id) });

    await this.archiveSnapshot(fetched.symbol, fetched);
    return created;
```

- [ ] **Step 5: Update refreshTicker to archive after, not before**

Replace the body of `refreshTicker` after the not-found guard:

```ts
    if (ticker.cachedData) {
      await TickerHistoryModel.create({
        symbol,
        archivedAt: ticker.cachedData.fetchedAt,
        data: ticker.cachedData
      });
      logger.info(SCOPE, `refreshTicker(${symbol}) - archived previous snapshot to history`, { symbol, archivedAt: ticker.cachedData.fetchedAt });
    }

    const { cachedData } = await this.fetchCachedData(symbol);
    ticker.cachedData = cachedData;
    await ticker.save();
    logger.info(SCOPE, `refreshTicker(${symbol}) - saved refreshed data to MongoDB`, { symbol, fetchedAt: cachedData.fetchedAt });
    return ticker;
```

with:

```ts
    const fetched = await this.fetchStockData(symbol);
    ticker.cachedData = fetched.cachedData;
    // Assigned wholesale rather than merged, so a datapoint that recovered
    // since the last fetch drops its stale error.
    ticker.datapointErrors = new Map(Object.entries(fetched.datapointErrors));
    await ticker.save();
    logger.info(SCOPE, `refreshTicker(${symbol}) - saved refreshed data to MongoDB`, { symbol, fetchedAt: fetched.cachedData.fetchedAt, errorFields: Object.keys(fetched.datapointErrors) });

    await this.archiveSnapshot(symbol, fetched);
    return ticker;
```

- [ ] **Step 6: Run the service tests to verify they pass**

```bash
npx jest src/services/ticker.service.test.ts
```

Expected: PASS. If `ticker.datapointErrors?.get(...)` is undefined right after `TickerModel.create`, the Map is being set from a plain object — confirm the schema uses `{ type: Map, of: String }` from Task 3.

- [ ] **Step 7: Type check**

```bash
npx tsc --noEmit
```

Expected: PASS. Every `ratio.service` reference is gone.

- [ ] **Step 8: Run the full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: isolate datapoint failures in TickerService

fetchStockData now calls each calculator independently and assembles an
datapointErrors map alongside cachedData, so one underivable datapoint no longer
blocks tracking a stock. History inverts: instead of archiving the previous
snapshot before a refresh, every add and refresh appends the snapshot it just
wrote, carrying that fetch's datapointErrors and raw provider payload. A failed
archive is logged, not propagated."
```

---

## Task 5: Return datapointErrors from the API

Adds an explicit response mapper so `datapointErrors` is returned and nothing unintended leaks.

**Files:**
- Modify: `backend/src/services/ticker.service.ts`
- Modify: `backend/src/routes/portfolio.routes.ts`
- Modify: `backend/src/routes/watchlist.routes.ts`
- Modify: `backend/src/routes/tickers.routes.ts`
- Modify: `backend/src/app.test.ts`

**Interfaces:**
- Consumes: `TickerDocument` with `datapointErrors` (Task 3).
- Produces: `TickerResponse` interface and `toTickerResponse(doc: TickerDocument): TickerResponse`, both exported from `services/ticker.service.ts`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/app.test.ts`:

```ts
function makeTickerDoc(overrides: any = {}): any {
  return {
    _id: 'abc123',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Technology',
    exchange: 'NASDAQ',
    country: 'US',
    nativeCurrency: 'USD',
    lists: ['portfolio'],
    cachedData: { fetchedAt: new Date('2026-08-14T00:00:00Z'), currentPrice: 190, fairValue: 0 },
    datapointErrors: new Map([['fairValue', 'No historic data available']]),
    ...overrides
  };
}

test('GET /api/portfolio returns the datapointErrors object so the UI can explain missing datapoints', async () => {
  const service = makeFakeService();
  service.getList.mockImplementation(async () => [makeTickerDoc()]);
  const app = createApp(service);

  const res = await request(app).get('/api/portfolio');
  expect(res.status).toBe(200);
  expect(res.body[0].datapointErrors).toEqual({ fairValue: 'No historic data available' });
});

test('POST /api/tickers/:symbol/refresh returns the datapointErrors object', async () => {
  const service = makeFakeService();
  service.refreshTicker.mockImplementation(async () => makeTickerDoc());
  const app = createApp(service);

  const res = await request(app).post('/api/tickers/AAPL/refresh');
  expect(res.body.datapointErrors).toEqual({ fairValue: 'No historic data available' });
});

test('POST /api/portfolio/:symbol returns the datapointErrors object', async () => {
  const service = makeFakeService();
  service.addTicker.mockImplementation(async () => makeTickerDoc());
  const app = createApp(service);

  const res = await request(app).post('/api/portfolio/AAPL');
  expect(res.body.datapointErrors).toEqual({ fairValue: 'No historic data available' });
});

test('responses never include stockRawData, however the document was populated', async () => {
  const service = makeFakeService();
  service.getList.mockImplementation(async () => [makeTickerDoc({ stockRawData: { quoteSummary: { secret: true } } })]);
  const app = createApp(service);

  const res = await request(app).get('/api/portfolio');
  expect(res.body[0].stockRawData).toBeUndefined();
  expect(JSON.stringify(res.body)).not.toContain('secret');
});

test('a ticker with no failures returns an empty datapointErrors object rather than omitting it', async () => {
  const service = makeFakeService();
  service.getList.mockImplementation(async () => [makeTickerDoc({ datapointErrors: new Map() })]);
  const app = createApp(service);

  const res = await request(app).get('/api/portfolio');
  expect(res.body[0].datapointErrors).toEqual({});
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest src/app.test.ts
```

Expected: FAIL — `datapointErrors` comes back as `{}` or absent (a `Map` does not survive `JSON.stringify` on a plain object), and `stockRawData` leaks through.

- [ ] **Step 3: Add the response mapper**

At the bottom of `backend/src/services/ticker.service.ts`, after the class:

```ts
export interface TickerResponse {
  _id: string;
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  nativeCurrency: string;
  lists: ('portfolio' | 'watchlist')[];
  cachedData?: CachedData;
  datapointErrors: Record<string, string>;
}

// Builds the API shape explicitly instead of serializing the Mongoose
// document, so what routes return is a decision rather than a side effect of
// the schema. stockRawData lives only on history documents and so cannot
// appear here, but an explicit allowlist keeps that true as fields are added.
export function toTickerResponse(doc: TickerDocument): TickerResponse {
  const errors = doc.datapointErrors instanceof Map
    ? Object.fromEntries(doc.datapointErrors)
    : ((doc.datapointErrors ?? {}) as Record<string, string>);

  const response: TickerResponse = {
    _id: String(doc._id),
    symbol: doc.symbol,
    companyName: doc.companyName,
    sector: doc.sector,
    exchange: doc.exchange,
    country: doc.country,
    nativeCurrency: doc.nativeCurrency,
    lists: doc.lists,
    cachedData: doc.cachedData,
    datapointErrors
  };

  // Drop keys the document did not carry, so partially-populated documents
  // serialize the same way they did before the mapper existed.
  return Object.fromEntries(
    Object.entries(response).filter(([, value]) => value !== undefined)
  ) as TickerResponse;
}
```

- [ ] **Step 4: Map every route response**

In `backend/src/routes/portfolio.routes.ts`, change the import line:

```ts
import { TickerService } from '../services/ticker.service';
```

to:

```ts
import { TickerService, toTickerResponse } from '../services/ticker.service';
```

Then change `res.json(list)` to `res.json(list.map(toTickerResponse))` and `res.status(201).json(ticker)` to `res.status(201).json(toTickerResponse(ticker))`.

Make the identical changes in `backend/src/routes/watchlist.routes.ts`.

In `backend/src/routes/tickers.routes.ts`, change the import the same way, then:
- `res.status(200).json(ticker)` → `res.status(200).json(toTickerResponse(ticker))`
- both `res.status(200).json(tickers)` → `res.status(200).json(tickers.map(toTickerResponse))`

- [ ] **Step 5: Run the route tests to verify they pass**

```bash
npx jest src/app.test.ts
```

Expected: PASS, including the pre-existing tests — the `undefined`-stripping in Step 3 keeps the old sparse fake documents serializing as before.

- [ ] **Step 6: Run the full suite and type check**

```bash
npx tsc --noEmit && npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: return the datapointErrors object from the ticker APIs

Routes now map documents through toTickerResponse rather than serializing the
Mongoose document, so the response shape is explicit and stockRawData cannot
leak as fields are added."
```

---

## Task 6: Frontend model and documentation

Brings the frontend type in line and clears the stale TODO entries.

**Files:**
- Modify: `frontend/src/app/shared/models/ticker.model.ts`
- Modify: `TODO.md`

**Interfaces:**
- Consumes: the API shape from Task 5.
- Produces: `Ticker.datapointErrors?: Record<string, string>` for the follow-up UI work.

- [ ] **Step 1: Update the frontend model**

In `frontend/src/app/shared/models/ticker.model.ts`, delete `fairValueError?: string;` and the two-line comment above it from `CachedData`. Add to the `Ticker` interface, after `cachedData`:

```ts
  // Per-datapoint failure reasons keyed by cachedData field name (e.g.
  // datapointErrors['fairValue']). A datapoint with an entry here fell back to a
  // default value - 0 for numbers, 'Unavailable' for strings - so the value
  // shown is not real and should be presented as missing.
  datapointErrors?: Record<string, string>;
}
```

- [ ] **Step 2: Verify the frontend still builds**

```bash
cd ../frontend && npx tsc --noEmit -p tsconfig.json
```

Expected: PASS. If anything referenced `fairValueError`, it would fail here — the earlier grep found no consumers, only the declaration.

- [ ] **Step 3: Update TODO.md**

From the repository root, replace the first bullet in `TODO.md`:

```
- Surface `cachedData.fairValueError` in the UI when Fair Value is 0 due to a failed DCF calculation, instead of only being visible in the DB/backend logs. The field already exists on `Ticker.cachedData` in both backend (`backend/src/models/ticker.model.ts`) and frontend (`frontend/src/app/shared/models/ticker.model.ts`) — needs a way to show it in `StockTableComponent` (e.g. a tooltip/title on the Fair Value cell, or a warning icon) so the reason is visible at a glance without leaving the app.
```

with:

```
- Surface the `datapointErrors` object in the UI. Any datapoint with an entry in `Ticker.datapointErrors` (keyed by `cachedData` field name) fell back to a default — 0 for numbers, "Unavailable" for strings — so the displayed value is not real. `StockTableComponent` needs a way to show this per cell (e.g. a tooltip/title carrying the error text, plus a warning marker) so a fabricated 0 is never mistaken for a real figure. The field is returned by the list and detail APIs and exists on `Ticker` in both backend (`backend/src/models/ticker.model.ts`) and frontend (`frontend/src/app/shared/models/ticker.model.ts`).
```

Replace the second bullet (the `YahooFinanceV4Provider` verification item) with:

```
- Verify `YahooFinanceV4Provider` (`backend/src/providers/yahoo-finance-v4.provider.ts`) against a live response once Yahoo's rate limit clears. It is now the only provider, so this is the one that matters. Field names are verified against the installed package's TypeScript definitions (authoritative for existence) but not against real runtime data — check the `price`/`summaryProfile`/`financialData`/`summaryDetail` field values and the `fundamentalsTimeSeries` cash-flow response for a real symbol (e.g. AAPL). Raw responses for every fetch are now archived to the `tickerhistories` collection as `stockRawData`, which is the fastest way to inspect what Yahoo actually returned.
```

Delete the third bullet entirely (the v2 `price`-module verification item — the v2 provider no longer exists).

- [ ] **Step 4: Run the full backend suite one final time**

```bash
cd backend && npx tsc --noEmit && npm test
```

Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: align frontend Ticker model with the datapointErrors object

Replaces fairValueError with the generalized datapointErrors map and updates TODO.md:
the UI item now covers every datapoint, and the dead v2-provider item is
removed."
```

---

## Manual Verification

Automated tests use fakes throughout; these steps exercise the real Yahoo path once.

- [ ] **Step 1: Start the backend**

```bash
cd backend && npm run dev
```

- [ ] **Step 2: Add a well-covered symbol and confirm a clean fetch**

```bash
curl -s -X POST http://localhost:3000/api/watchlist/AAPL | python3 -m json.tool
```

Expected: 201 with populated `cachedData` and `"datapointErrors": {}` (or a small number of entries if Yahoo omits something for AAPL). No `stockRawData` key anywhere in the output.

- [ ] **Step 3: Add a symbol likely to fail a datapoint**

Pick a recently-listed or loss-making company (the DCF needs a positive prior-year free cash flow). For example:

```bash
curl -s -X POST http://localhost:3000/api/watchlist/RIVN | python3 -m json.tool
```

Expected: 201, not an error. `cachedData.fairValue` is `0` and `datapointErrors.fairValue` explains why. Other datapoints are still populated. This is the whole point of the change — before it, this call could fail outright.

- [ ] **Step 4: Confirm the raw payload reached history**

```bash
mongosh --quiet --eval 'db.tickerhistories.find({symbol:"RIVN"}, {symbol:1, archivedAt:1, datapointErrors:1, "stockRawData.quoteSummary.price.regularMarketPrice":1}).pretty()' value-investing
```

(Substitute the database name from `backend/.env` `MONGO_URI` if it differs.)

Expected: one document, with `datapointErrors` matching the API response and a real price under `stockRawData`.

- [ ] **Step 5: Refresh twice and confirm snapshots append**

```bash
curl -s -X POST http://localhost:3000/api/tickers/RIVN/refresh > /dev/null
curl -s -X POST http://localhost:3000/api/tickers/RIVN/refresh > /dev/null
mongosh --quiet --eval 'db.tickerhistories.countDocuments({symbol:"RIVN"})' value-investing
```

Expected: `3` — one from the add, two from the refreshes.

- [ ] **Step 6: Confirm the tickers collection stays light**

```bash
mongosh --quiet --eval 'db.tickers.findOne({symbol:"RIVN"})' value-investing
```

Expected: no `stockRawData` field on the document.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| 1. Provider consolidation | Task 1 |
| 2. Isolated datapoint calculators | Task 2 |
| 3. The `datapointErrors` object | Task 3 (schema), Task 4 (population) |
| 4. History and raw data | Task 3 (schema, index), Task 4 (write path) |
| 5. API responses | Task 5 |
| 6. Flow | Task 4 |
| Testing | Tasks 1–5, each behind its own TDD cycle |
| Migration | No code — verified by the history model test accepting snapshots without `datapointErrors`/`stockRawData`, and by `datapointErrors` being optional on the ticker schema |
| Files (deleted/added/modified) | All accounted for across Tasks 1–6 |

One deliberate deviation from the spec, amended in the spec itself before Task 1: optional-by-design datapoints return `undefined`, not `0`.

**Type consistency:** `Calculated<T>`, `UNAVAILABLE`, and all eleven `compute*` names plus `collectErrors` are defined in Task 2 and consumed under exactly those names in Task 4. `StockData`/`getStockData` are defined in Task 1 and consumed in Tasks 1 and 4. `TickerResponse`/`toTickerResponse` are defined in Task 5 and consumed by the three route files in the same task. `TickerDocument.datapointErrors` is a `Map<string, string>` in Task 3, written as a `Map` in Task 4, and converted to a plain object in Task 5.
