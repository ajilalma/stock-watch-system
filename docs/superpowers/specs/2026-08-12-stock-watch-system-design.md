# Stock Watch System — Design Spec

Date: 2026-08-12

## Purpose

A local-only tool to track stocks in a Portfolio and a Watchlist, showing value-investing metrics (DCF fair value, P/B, PEG, current/quick ratio, dividends, payout ratio) with color-coded thresholds, across US, Canadian, Indian, and EU exchanges, normalized to a single display currency.

## Architecture

Single Git repo using npm workspaces, no global installs, everything runs from within the project folder:

```
value-investing/
├── package.json          # root: workspaces + `npm start` (concurrently)
├── backend/               # Node.js + TypeScript + Express
├── frontend/               # Angular, single app, two feature modules
└── docs/superpowers/specs/
```

- **Backend**: Express + TypeScript, connects to a locally-running MongoDB instance via connection string in `backend/.env` (not committed, user runs Mongo themselves — the app does not manage the Mongo process).
- **Frontend**: Single Angular application (not true micro-frontends/module federation — unnecessary for two sections). `PortfolioModule` and `WatchlistModule` as routed feature modules, sharing a `StockTableComponent` and color-indicator pipes/directives.
- **Startup**: root `npm start` runs `concurrently` to launch the backend dev server (e.g. `:3000`) and `ng serve` (e.g. `:4200`) together; `Ctrl+C` stops both. All dependencies install into this repo's own `node_modules` — nothing touches other projects or global environment.

## Backend: Abstraction Layers

Three swappable interfaces so third-party libraries can be replaced without touching calling code:

```typescript
interface StockDataProvider {
  getQuote(symbol: string): Promise<RawQuote>;           // price, sector, industry, exchange, currency
  getFinancials(symbol: string): Promise<RawFinancials>; // balance sheet, cash flow, dividends
}

interface FairValueCalculator {
  calculate(financials: RawFinancials): Promise<FairValueResult>; // DCF fair value + assumptions used
}

interface CurrencyConverter {
  getRate(fromCurrency: string, toCurrency: string): Promise<number>;
}
```

- `YahooFinanceProvider implements StockDataProvider` — wraps the `yahoo-finance2` npm package.
- `DcfFairValueCalculator implements FairValueCalculator` — standard DCF:
  - Growth rate: derived from 5-year historical average FCF growth, capped at 15% to avoid wild extrapolation.
  - Discount rate: fixed at 9% (WACC assumption).
  - Projection horizon: 10 years, plus terminal value using a 2.5% terminal growth rate.
  - All DCF/ratio assumptions live in one config object for easy tuning later.
- `FrankfurterConverter implements CurrencyConverter` — calls `frankfurter.app` (ECB-based, free, no API key required).
- `RatioService` — pure math (P/B, PEG, current ratio, quick ratio, payout ratio) computed directly from `RawFinancials`; not swappable, no third-party dependency to abstract.
- Routes and the DB layer depend only on these interfaces, never directly on `yahoo-finance2`, DCF internals, or the FX library.

DCF and ratio math run in the stock's **native reporting currency** (financial statements are reported natively); USD conversion happens only at the display/storage boundary (`currentPrice`, `fairValue`).

## Data Model (MongoDB)

### `tickers` — one document per symbol, shared across lists

```typescript
{
  _id: ObjectId,
  symbol: string,          // full Yahoo-style symbol, e.g. "RELIANCE.NS", "SHOP.TO", "AAPL"
  companyName: string,
  sector: string,
  exchange: string,        // e.g. "NSE", "TSX", "NASDAQ"
  country: string,
  nativeCurrency: string,  // e.g. "INR", "CAD", "USD"
  lists: ("portfolio" | "watchlist")[],  // which section(s) this ticker belongs to
  cachedData: {
    fetchedAt: Date,
    currentPrice: number,        // normalized to display currency (USD)
    fairValue: number,           // normalized to display currency (USD)
    nativePrice: number,         // original value in nativeCurrency, kept for reference
    nativeFairValue: number,
    fxRateToUsd: number,         // FX rate used at fetch time
    priceToBook: number,
    priceToBookIndustryAvg?: number,
    pegRatio?: number,
    currentRatio: number,
    currentRatioIndustryAvg?: number,
    quickRatio: number,
    quickRatioIndustryAvg?: number,
    lastDividendDate?: Date,
    lastDividendAmount?: number,
    payoutRatio?: number
  }
}
```

One document per ticker (not duplicated per list) since a symbol can belong to both Portfolio and Watchlist simultaneously — avoids stale-data drift between two copies.

### `tickerHistory` — append-only archive, same data shape as `cachedData`

```typescript
{
  _id: ObjectId,
  symbol: string,
  archivedAt: Date,   // = the fetchedAt of the snapshot being replaced
  data: {
    // exact same shape as tickers.cachedData above, including
    // currentPrice, fairValue, nativePrice, nativeFairValue, fxRateToUsd,
    // and all ratio/dividend fields
  }
}
```

On every refresh (auto-TTL or manual, single or bulk), the ticker's current `cachedData` is copied into `tickerHistory` **before** being overwritten with fresh data — one history entry per refresh, no deduplication. This preserves trend history across currency/price/ratio changes over time.

### `fxRates` — small cache, independent TTL from stock data

```typescript
{
  from: string,     // currency code
  to: string,        // currency code (display currency, e.g. "USD")
  rate: number,
  fetchedAt: Date
}
```
Reused for 5 days before re-fetching from Frankfurter.app.

## Backend API

```
GET    /api/portfolio                    → tickers where lists contains "portfolio", grouped by sector, sorted by company name within sector
GET    /api/watchlist                    → same, for "watchlist"

POST   /api/portfolio/:symbol            → add symbol to portfolio (validates via StockDataProvider, fetches+caches if new ticker)
DELETE /api/portfolio/:symbol            → remove symbol from portfolio list (deletes ticker doc if it belongs to no list)
POST   /api/watchlist/:symbol            → add to watchlist
DELETE /api/watchlist/:symbol            → remove from watchlist

POST   /api/tickers/:symbol/refresh      → force-refresh one ticker (manual refresh button), archives old snapshot first
POST   /api/tickers/refresh              body: { symbols: string[] }  → refresh a selected set (bulk)
POST   /api/tickers/refresh-all          → refresh every ticker currently in portfolio+watchlist
```

**Cache freshness on `GET`**: any ticker whose `cachedData.fetchedAt` is older than 15 days is auto-refreshed (with archiving) before being returned. The manual/bulk refresh endpoints bypass the 15-day check.

**Add-ticker flow**: user enters the full Yahoo-style symbol (e.g. `RELIANCE.NS`, not just `RELIANCE`). Backend validates it via `StockDataProvider.getQuote()` and derives exchange/country/currency from the quote response; bare US symbols (e.g. `AAPL`) work as-is since no suffix is needed for NYSE/NASDAQ.

## Frontend Design

Two routed sections, `Portfolio` and `Watchlist`, each rendering a shared `StockTableComponent`:

- **Grouping/sorting**: rows grouped by sector (sector header row), sorted by company name within each sector group.
- **Bulk actions**: checkbox column (row-level + header "select all"), toolbar above the table with "Refresh Selected" (enabled when ≥1 row checked) and "Refresh All" buttons, calling the bulk/refresh-all endpoints.
- **Add/remove**: an "Add ticker" input (accepts full Yahoo-style symbol) and a remove (✕) action per row.
- **Color-coded columns**:
  | Column | Green | Yellow | Red |
  |---|---|---|---|
  | Price vs Fair Value (margin of safety) | price ≥20% below fair value | within ±20% | price >20% above fair value |
  | Price to Book | ≤ 1 | ≤ 3 | > 3 |
  | PEG ratio | ≤ 1 | ≤ 2 | > 2 |
  | Current ratio | > 1 | — | < 1 |
  | Quick ratio | > 1 | — | < 1 |
  | Payout ratio | 0–50% | 50–80% | > 80% |
- **Columns shown**: Ticker, Company, Sector (grouping), Current Price, Fair Value (DCF), Price/Book (+ industry avg if available), PEG (if available), Current Ratio (+ industry avg if available), Quick Ratio (+ industry avg if available), Last Dividend Date, Last Dividend Amount, Payout Ratio. All monetary values shown in normalized display currency (USD).

## Out of Scope

- Historical trend charts/UI for `tickerHistory` data (the collection is built now; visualizing it is a future iteration).
- Authentication/multi-user support (single local user).
- Real-time/streaming price updates (cache-based only, 15-day TTL + manual refresh).
- Automated background scheduler (refresh is on-demand: page load with stale cache, or explicit button).
