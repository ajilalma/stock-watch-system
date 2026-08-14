# Resilient Datapoint Calculation

## Context

`TickerService.fetchCachedData()` currently derives every datapoint for a
stock in one block: `RatioService.compute()` produces five ratios in a single
function, and `DcfFairValueCalculator.calculate()` produces fair value. Only
the DCF calculation is guarded — it is wrapped in a `try`/`catch` that falls
back to `fairValue = 0` and records `cachedData.fairValueError`.

Every other datapoint is unguarded. `priceToBook` divides by
`financials.bookValuePerShare` with no check that the value exists;
`pegRatio` divides by `earningsPerShare`; the provider returns `undefined`
for fields Yahoo does not supply for a given symbol. A single missing or
zero input either throws and aborts the whole add/refresh, or silently
stores `NaN`/`Infinity` in the database.

This blocks tracking a stock outright because one or two of its fifteen
datapoints cannot be derived — which is the wrong tradeoff for a personal
value-investing tool, where a partially-populated row is far more useful
than no row at all.

The existing `fairValueError` handling is the right shape. This spec
generalizes it to every derived datapoint, and adds the raw provider payload
to the history collection so an unhelpful error message can be traced back
to what the provider actually returned.

## Goals

- Isolate each datapoint calculation so a failure in one cannot prevent the
  others from being computed or the ticker from being tracked.
- Record a per-field reason for every failure, in the database and in the
  API responses, so the UI can explain a missing value in place.
- Preserve the raw provider response for debugging when an error message is
  not self-explanatory, without returning it from any API.
- Keep the `tickers` collection light and UI-shaped; move history and
  debugging weight into `tickerhistories`.

## Non-goals

- No UI work. This spec is backend-only. Rendering `datapointErrors` in the stock
  table is separate follow-up work.
- No new datapoints, and no change to how any existing datapoint is
  calculated when its inputs are present. Behavior changes only on failure.
- No retry, backoff, or alternative-source fallback when a datapoint cannot
  be derived. A failure is recorded, not worked around.
- No endpoint for reading `tickerhistories`. It is written to and inspected
  directly in MongoDB for now.

## Design

### 1. Provider consolidation

The codebase carries two Yahoo Finance providers: `YahooFinanceProvider`
(yahoo-finance2 v2, the current default) and `YahooFinanceV4Provider` (v4,
selected by `STOCK_DATA_PROVIDER=v4`). Maintaining both while also
threading a raw payload through doubles the work for no benefit.

**Delete v2.** Remove:

- `backend/src/providers/yahoo-finance.provider.ts`
- `backend/src/providers/yahoo-finance.provider.test.ts`
- `backend/src/providers/yahoo-finance.provider.live.test.ts`
- the `createStockDataProvider()` switch and `STOCK_DATA_PROVIDER` env var in
  `backend/src/server.ts`
- the `yahoo-finance2` dependency from `backend/package.json` (the v4 alias
  entry `yahoo-finance2-v4` stays)

`YahooFinanceV4Provider` becomes the only implementation, constructed
directly in `server.ts`.

The `StockDataProvider` interface collapses from two methods to one.
`TickerService` always needs both quote and financials, and the raw payload
must come from the same fetch that produced them:

```ts
export interface StockData {
  quote: RawQuote;
  financials: RawFinancials;
  raw: unknown;
}

export interface StockDataProvider {
  getStockData(symbol: string): Promise<StockData>;
}
```

`raw` is the unprocessed provider response, shaped as:

```ts
{
  quoteSummary: <full quoteSummary response>,
  fundamentalsTimeSeries: <full cash-flow response>
}
```

This removes the provider's `pendingSummaries` 10-second de-dupe cache and
its `setTimeout` cleanup, which existed only because `getQuote()` and
`getFinancials()` each fetched the same `quoteSummary`. With one entry point
the summary is fetched once per call by construction.

A failure of `getStockData` itself — symbol not found, network error, Yahoo
rate limit — still throws and aborts the add/refresh. Without a quote there
is no company to record. `SymbolNotFoundError` handling is unchanged.

### 2. Isolated datapoint calculators

New module `backend/src/services/datapoint-calculators.ts`. Delete
`backend/src/services/ratio.service.ts` and its test.
`backend/src/providers/dcf-fair-value.calculator.ts` and the
`FairValueCalculator` interface stay as they are and are wrapped.

Each calculator returns a result envelope and **never throws**:

```ts
export interface Calculated<T> {
  value: T;
  error?: string;
}
```

Functions:

```ts
computeFairValue(financials: RawFinancials, calculator: FairValueCalculator): Promise<Calculated<number>>
computePriceToBook(quote: RawQuote, financials: RawFinancials): Calculated<number>
computePegRatio(quote: RawQuote, financials: RawFinancials): Calculated<number>
computeCurrentRatio(financials: RawFinancials): Calculated<number>
computeQuickRatio(financials: RawFinancials): Calculated<number>
computePayoutRatio(financials: RawFinancials): Calculated<number>
computeFxRate(quote: RawQuote, converter: CurrencyConverter): Promise<Calculated<number>>
```

Each handles three failure modes, all producing a populated `error`:

1. **Thrown exception** — caught internally; the `Error.message` is used
   verbatim as the error string (`String(err)` for non-Errors). This is how
   DCF messages like "No historic data available" reach `datapointErrors.fairValue`.
2. **Missing or unusable input** — detected before calculating, with a
   human-readable message naming the input. For example, `computePriceToBook`
   returns `"Book value per share unavailable"` when
   `financials.bookValuePerShare` is `undefined`, `null`, or `0`.
3. **Non-finite result** — a computed `NaN` or `Infinity` is treated as a
   failure rather than stored, with a message naming the field.

On any failure the default value is returned alongside the error:

| Type | Default on failure |
| --- | --- |
| number | `0` |
| string | `"Unavailable"` |
| date | `undefined` |

**Exception — `fxRateToUsd` defaults to `1`, not `0`.** A `0` rate would
multiply `currentPrice` and `fairValue` to zero, making two working
datapoints indistinguishable from failed ones. Defaulting to `1` leaves
both in native currency, which is wrong but recognizable, and
`datapointErrors.fxRateToUsd` records the reason.

**Optional-by-design vs. failed.** `pegRatio` and `payoutRatio` are
legitimately absent for many companies — a company that pays no dividend has
no payout ratio, and that is not an error. These calculators distinguish the
two cases: an input
that is absent *because the concept does not apply* returns
`{ value: undefined }` with **no** error, while an input that should exist but
is missing or malformed returns `{ value: 0, error: ... }`. These two fields
keep the `number | undefined` type they already have in `CachedData` —
storing `0` for a company that pays no dividend would render as a real value
in the UI rather than as an absence. Concretely:

- `computePegRatio` — `earningsGrowthRate` absent or `0` → no error
  (growth rate not published). `earningsPerShare` absent or `0` → error.
- `computePayoutRatio` — `dividendsPaidTTM` absent → no error (no
  dividend). `dividendsPaidTTM` present but `netIncomeTTM` absent or `0` →
  error.

`lastDividendDate` and `lastDividendAmount` are pass-through values from
`RawFinancials`, not calculations. They get no calculator and no error
entry; they stay optional and are copied through as-is, absent for
non-dividend-paying companies.

The `industryAvg` fields (`priceToBookIndustryAvg`,
`currentRatioIndustryAvg`, `quickRatioIndustryAvg`) are pass-through values
the v4 provider does not currently supply at all — it hardcodes them to
`undefined`. They get no calculator and no error entry; they remain
optional and absent.

**Quote metadata strings.** `companyName`, `sector`, `exchange`, and
`country` currently default to `'Unknown'` inside the provider. These move
to the `"Unavailable"` convention with a recorded error, so the UI has one
signal to key on rather than two. `country` is derived from `exchange` via
`EXCHANGE_COUNTRY_MAP`; an exchange that is present but unmapped yields
`country: "Unavailable"` with an error naming the unmapped exchange, which
also makes gaps in the map visible.

`currentPrice`/`nativePrice` are raw provider values, not calculations. A
missing `regularMarketPrice` means the quote is unusable, which
`getStockData` already treats as a hard failure.

### 3. The `datapointErrors` object

New top-level field on the ticker document, sibling to `cachedData`:

```ts
export interface TickerDocument extends Document {
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  nativeCurrency: string;
  lists: ('portfolio' | 'watchlist')[];
  cachedData?: CachedData;
  datapointErrors?: Record<string, string>;
}
```

Keys are `cachedData` field names (plus the quote metadata field names).
Values are the error strings from the calculators. Only failing fields
appear; a fully successful fetch stores `{}`.

```js
{
  symbol: "NEWCO",
  cachedData: { fairValue: 0, priceToBook: 0, currentRatio: 1.8, ... },
  datapointErrors: {
    fairValue: "No historic data available",
    priceToBook: "Book value per share unavailable"
  }
}
```

The whole object is **replaced** on every fetch, not merged, so a datapoint
that starts working again stops reporting an error.

Declared in the schema as `{ type: Map, of: String, default: {} }` rather
than a fixed sub-schema, so adding a datapoint later needs no schema change.
Mongoose `Map` fields serialize to plain objects in JSON, so API consumers
see a normal object.

`cachedData.fairValueError` is removed — from `CachedData` in
`backend/src/models/ticker.model.ts`, from the history model's data schema,
and from `CachedData` in
`frontend/src/app/shared/models/ticker.model.ts`. It is replaced by
`datapointErrors.fairValue`. This also resolves the first item in `TODO.md`, which
should be updated to point at `datapointErrors` instead.

### 4. History and raw data

The history relationship inverts. Today `refreshTicker()` archives the
*previous* `cachedData` into `tickerhistories` immediately before
overwriting it, so `addTicker()` writes no history at all and the newest
snapshot only ever lives in `tickers`.

**New behavior: every write to `tickers` also appends a copy to
`tickerhistories`.** This applies to both `addTicker()` (on initial fetch)
and `refreshTicker()`. The pre-overwrite archive step is removed.

```ts
export interface TickerHistoryDocument extends Document {
  symbol: string;
  archivedAt: Date;
  data: CachedData;
  datapointErrors?: Record<string, string>;
  stockRawData?: unknown;
}
```

- `archivedAt` is the snapshot's `fetchedAt` — the time the data was
  fetched, not the time the row was written.
- `stockRawData` is the provider's `raw` payload, stored as `Schema.Types.Mixed`.
- `data` becomes `Schema.Types.Mixed` as well, rather than a hand-maintained
  duplicate of `CachedData`'s field list. The current history schema
  restates all seventeen fields and has to be edited in lockstep with the
  ticker schema; history is written and read as an opaque snapshot, so the
  duplication buys nothing.

**`stockRawData` exists only on history documents.** It is never written to
the ticker document, which keeps `tickers` light for the UI and makes its
absence from API responses structural rather than a matter of remembering to
strip it.

Records are **appended, never updated** — `TickerHistoryModel.create()` with
a fresh `_id` per write, no upsert and no match-on-symbol. Three refreshes
produce three history documents; an add followed by three refreshes produces
four.

Two consequences, both accepted:

- **Index.** Add a compound index `{ symbol: 1, archivedAt: -1 }` to the
  history schema. Per-symbol time-series reads are the obvious access
  pattern and the collection has no index today.
- **Duplicate snapshots.** `ensureFresh()` guards automatic refreshes with a
  15-day staleness check, but manual refresh has no such guard — three
  clicks in a minute write three near-identical rows and three copies of the
  raw payload. These are still written. Distinguishing "unchanged" from
  "changed back" adds logic for little gain, and adjacent raw payloads are
  exactly what is wanted when debugging why two fetches disagreed. The
  collection therefore grows with clicks, not only with time. No TTL or cap
  for now; revisit if it becomes a problem.

If the history write fails, it is logged as an error but does not fail the
add/refresh — the same reasoning that motivates the whole spec. The ticker
document is the source of truth for the UI; history is supporting data.

### 5. API responses

`datapointErrors` is returned by both the list endpoints (`GET /api/portfolio`,
`GET /api/watchlist`) and every endpoint returning a single ticker
(`POST /api/portfolio/:symbol`, `POST /api/watchlist/:symbol`,
`POST /api/tickers/:symbol/refresh`, `POST /api/tickers/refresh`,
`POST /api/tickers/refresh-all`).

`stockRawData` is never returned. It is not on the ticker document and no
route reads `tickerhistories`.

Routes currently pass the raw Mongoose document to `res.json()`, which
leaks whatever the schema happens to hold. Add a `toTickerResponse(doc)`
mapper in `TickerService` that builds the response explicitly:

```ts
{ _id, symbol, companyName, sector, exchange, country,
  nativeCurrency, lists, cachedData, datapointErrors }
```

All routes return mapped objects. The frontend `Ticker` interface gains
`datapointErrors?: Record<string, string>` to match.

### 6. Flow

`TickerService.fetchCachedData()` becomes pure orchestration:

1. `provider.getStockData(symbol)` → `{ quote, financials, raw }`. Throws on
   hard failure; nothing below runs.
2. Resolve quote metadata (`companyName`, `sector`, `exchange`, `country`),
   collecting defaults and datapointErrors.
3. Call each calculator independently, collecting `{ value, error? }`.
4. Assemble `cachedData` from the values, applying `fxRateToUsd` to
   `currentPrice` and `fairValue` to produce their USD forms alongside the
   native ones.
5. Assemble `datapointErrors` from the non-empty error strings.
6. Return `{ metadata, cachedData, datapointErrors, raw }`.

`addTicker()` and `refreshTicker()` each write the ticker document and then
append the history document carrying `raw` as `stockRawData`.

Ordering note: `nativeFairValue` and `nativePrice` are stored pre-conversion,
so a failed FX lookup leaves them correct regardless.

## Testing

**Calculators** (`datapoint-calculators.test.ts`) — for each function:

- success path with valid inputs produces the expected value and no `error`
- a dependency that throws produces the default value and the thrown
  message as `error`
- a missing or zero required input produces the default value and a
  message naming that input
- an input combination producing `NaN`/`Infinity` produces the default
  value and an error rather than storing the non-finite value
- `computePegRatio` / `computePayoutRatio`: an optional-by-design absence
  produces the default value with **no** error
- `computeFxRate`: a converter failure defaults to `1`, not `0`

**TickerService** (`ticker.service.test.ts`, extending existing coverage):

- a fetch where two datapoints fail still writes a complete ticker
  document, with the remaining datapoints correct and exactly two `datapointErrors`
  entries
- a datapoint that failed on a previous fetch and succeeds on refresh has
  its error cleared — `datapointErrors` is replaced, not merged
- `addTicker` writes one history document containing `stockRawData`
- each `refreshTicker` appends an additional history document; three
  refreshes after an add leave four history documents for that symbol
- refresh no longer archives the previous snapshot separately (no
  duplicate-per-refresh rows from the old path)
- a history write failure is logged but does not fail the add/refresh
- a hard `getStockData` failure still throws and writes nothing

**Routes** (`app.test.ts`, extending existing coverage):

- `datapointErrors` is present on list and single-ticker responses
- `stockRawData` is absent from every response

Existing cases in `ratio.service.test.ts` carry over into the calculator
tests before that file is deleted. `dcf-fair-value.calculator.test.ts`,
`frankfurter.converter.test.ts`, and `cached-currency.converter.test.ts` are
unaffected.

## Migration

Ticker documents written before this change have `cachedData.fairValueError`
and no `datapointErrors` field. No migration script: `datapointErrors` is optional and
absent-means-no-known-errors, and the first refresh of any ticker replaces
`cachedData` wholesale and populates `datapointErrors`. Stale `fairValueError` values
on unrefreshed documents are simply ignored — the field is dropped from the
model, so it is not read and not returned.

Existing `tickerhistories` documents have no `datapointErrors` or `stockRawData`.
Both are optional; older rows read as snapshots without them.

## Files

**Deleted**

- `backend/src/providers/yahoo-finance.provider.ts`
- `backend/src/providers/yahoo-finance.provider.test.ts`
- `backend/src/providers/yahoo-finance.provider.live.test.ts`
- `backend/src/services/ratio.service.ts`
- `backend/src/services/ratio.service.test.ts`

**Added**

- `backend/src/services/datapoint-calculators.ts`
- `backend/src/services/datapoint-calculators.test.ts`

**Modified**

- `backend/src/providers/stock-data-provider.interface.ts` — single
  `getStockData` method, `StockData` type
- `backend/src/providers/yahoo-finance-v4.provider.ts` — implement
  `getStockData`, return raw payload, drop `pendingSummaries`
- `backend/src/models/ticker.model.ts` — add `datapointErrors`, drop `fairValueError`
- `backend/src/models/ticker-history.model.ts` — `datapointErrors`, `stockRawData`,
  mixed `data`, compound index
- `backend/src/services/ticker.service.ts` — orchestration, history-on-every-write,
  `toTickerResponse`
- `backend/src/routes/*.routes.ts` — return mapped responses
- `backend/src/server.ts` — construct v4 provider directly
- `backend/package.json` — drop `yahoo-finance2`
- `frontend/src/app/shared/models/ticker.model.ts` — add `datapointErrors`, drop
  `fairValueError`
- `TODO.md` — update the `fairValueError` item to reference `datapointErrors`; drop
  the v2 `price`-module verification item (v2 is deleted). The v4 live-response
  verification item stays and becomes more pressing, since v4 is now the only
  provider — but the `STOCK_DATA_PROVIDER` instructions in it are no longer
  accurate and should be removed.
