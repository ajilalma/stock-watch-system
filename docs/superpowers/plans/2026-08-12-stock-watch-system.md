# Stock Watch System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Portfolio/Watchlist stock tracker: TypeScript/Express backend with swappable data/fair-value/currency providers backed by MongoDB, and a single Angular app (two feature modules) that renders color-coded value-investing metrics, sorted/grouped by sector.

**Architecture:** Monorepo with npm workspaces (`backend/`, `frontend/`). Backend exposes a REST API over Mongoose models; all third-party integration (Yahoo Finance, DCF math, FX rates) sits behind three interfaces so implementations can be swapped without touching routes or services. Frontend is a single Angular app with `PortfolioModule` and `WatchlistModule` sharing a `StockTableComponent` and color pipes.

**Tech Stack:** Node.js, TypeScript, Express, Mongoose, `yahoo-finance2`, Jest + Supertest (backend tests), Angular (latest stable), Jasmine/Karma (frontend tests, Angular CLI default), `concurrently`.

## Global Constraints

- Everything installs into this repo's own `node_modules` via npm workspaces — no global installs, nothing touches other projects or environments (spec: Architecture).
- MongoDB is a locally-running instance the user manages themselves; backend only holds a connection string in `backend/.env` (gitignored) — never start/manage the Mongo process from this app (spec: Architecture).
- Stock data cache TTL: 15 days, auto-refreshed on GET when stale (spec: Backend API).
- FX rate cache TTL: 5 days, independent of stock data TTL (spec: `fxRates`).
- Every refresh (auto, manual single, or bulk) archives the prior `cachedData` into `tickerHistory` before overwriting — one entry per refresh, no dedup (spec: `tickerHistory`).
- DCF assumptions: discount rate 9%, growth rate = 5yr historical avg FCF growth capped at 15%, 10-year projection, terminal growth rate 2.5% — all in one config object (spec: Backend Abstraction Layers).
- Color thresholds (exact, from spec table):
  - Margin of safety (price vs fair value): green if price ≥20% below fair value, yellow within ±20%, red if price >20% above fair value.
  - Price/Book: green ≤1, yellow ≤3, red >3.
  - PEG: green ≤1, yellow ≤2, red >2.
  - Current ratio: green >1, red <1 (no yellow).
  - Quick ratio: green >1, red <1 (no yellow).
  - Payout ratio: green 0–50%, yellow 50–80%, red >80%.
- All monetary values displayed/stored in USD (normalized); native currency values also kept (`nativePrice`, `nativeFairValue`) (spec: International Tickers & Currency Normalization).
- DCF and ratio math run in native currency; USD conversion happens only at the display/storage boundary (spec: Backend Abstraction Layers).
- Ticker symbols are full Yahoo-style symbols (e.g. `RELIANCE.NS`, `SHOP.TO`, bare `AAPL` for US) (spec: Backend API — Add-ticker flow).

---

## File Structure

```
value-investing/
├── package.json                          # workspaces + `npm start` (concurrently)
├── .gitignore
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   ├── .env.example
│   └── src/
│       ├── config/dcf-config.ts
│       ├── types/domain.ts               # RawQuote, RawFinancials, FairValueResult, RatioResult
│       ├── db/mongo.ts
│       ├── models/ticker.model.ts
│       ├── models/ticker-history.model.ts
│       ├── models/fx-rate.model.ts
│       ├── providers/stock-data-provider.interface.ts
│       ├── providers/yahoo-finance.provider.ts
│       ├── providers/fair-value-calculator.interface.ts
│       ├── providers/dcf-fair-value.calculator.ts
│       ├── providers/currency-converter.interface.ts
│       ├── providers/frankfurter.converter.ts
│       ├── services/ratio.service.ts
│       ├── services/ticker.service.ts
│       ├── routes/portfolio.routes.ts
│       ├── routes/watchlist.routes.ts
│       ├── routes/tickers.routes.ts
│       ├── app.ts
│       └── server.ts
└── frontend/
    └── src/app/
        ├── app-routing.module.ts
        ├── app.module.ts / app.component.ts
        ├── shared/models/ticker.model.ts
        ├── shared/services/stock-api.service.ts
        ├── shared/pipes/margin-of-safety-color.pipe.ts
        ├── shared/pipes/price-to-book-color.pipe.ts
        ├── shared/pipes/peg-color.pipe.ts
        ├── shared/pipes/ratio-color.pipe.ts        # shared by current & quick ratio
        ├── shared/pipes/payout-ratio-color.pipe.ts
        ├── shared/stock-table/stock-table.component.ts/html/scss
        ├── portfolio/portfolio.module.ts
        ├── portfolio/portfolio.component.ts/html/scss
        ├── watchlist/watchlist.module.ts
        └── watchlist/watchlist.component.ts/html/scss
```

---

## Backend Tasks

### Task 1: Repo & backend project scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/jest.config.js`
- Create: `backend/.env.example`
- Create: `backend/src/server.ts` (placeholder entry, just logs startup)

**Interfaces:**
- Produces: a runnable `backend` workspace with `npm run dev` (ts-node-dev) and `npm test` (jest) scripts.

- [ ] **Step 1: Create root `package.json` with npm workspaces**

```json
{
  "name": "value-investing",
  "private": true,
  "workspaces": ["backend", "frontend"],
  "scripts": {
    "start": "concurrently -n backend,frontend -c blue,green \"npm run dev -w backend\" \"npm start -w frontend\""
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
.env
*.log
.angular/
```

- [ ] **Step 3: Create `backend/package.json`**

```json
{
  "name": "backend",
  "version": "1.0.0",
  "private": true,
  "main": "dist/server.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.19.2",
    "mongoose": "^8.5.1",
    "yahoo-finance2": "^2.11.3",
    "dotenv": "^16.4.5",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "ts-node-dev": "^2.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.4",
    "@types/jest": "^29.5.12",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.14.15",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2"
  }
}
```

- [ ] **Step 4: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `backend/jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts']
};
```

- [ ] **Step 6: Create `backend/.env.example`**

```
MONGO_URI=mongodb://localhost:27017/stock-watch
PORT=3000
```

- [ ] **Step 7: Create placeholder `backend/src/server.ts`**

```typescript
console.log('backend scaffold ok');
```

- [ ] **Step 8: Install dependencies and verify**

Run: `npm install` (from repo root)
Expected: installs succeed, `backend/node_modules` and root `node_modules` created, no errors.

Run: `npm run dev -w backend`
Expected: prints `backend scaffold ok`, then Ctrl+C to stop.

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore backend/package.json backend/tsconfig.json backend/jest.config.js backend/.env.example backend/src/server.ts
git commit -m "chore: scaffold backend workspace"
```

---

### Task 2: Domain types and DCF config

**Files:**
- Create: `backend/src/types/domain.ts`
- Create: `backend/src/config/dcf-config.ts`

**Interfaces:**
- Produces: `RawQuote`, `RawFinancials`, `FairValueResult`, `RatioResult` types and `DCF_CONFIG` constant, consumed by every provider/service task below.

- [ ] **Step 1: Write `backend/src/types/domain.ts`**

```typescript
export interface RawQuote {
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  currency: string;
  currentPrice: number;
}

export interface RawFinancials {
  symbol: string;
  freeCashFlowHistory: number[]; // oldest first, most recent last, up to 5 years
  sharesOutstanding: number;
  bookValuePerShare: number;
  earningsPerShare: number;
  earningsGrowthRate?: number; // for PEG, as a percentage e.g. 12 = 12%
  currentAssets: number;
  currentLiabilities: number;
  inventory: number;
  lastDividendDate?: Date;
  lastDividendAmount?: number;
  dividendsPaidTTM?: number;
  netIncomeTTM?: number;
  priceToBookIndustryAvg?: number;
  currentRatioIndustryAvg?: number;
  quickRatioIndustryAvg?: number;
}

export interface FairValueAssumptions {
  growthRate: number;
  discountRate: number;
  terminalGrowthRate: number;
  projectionYears: number;
}

export interface FairValueResult {
  fairValue: number; // native currency, per share
  assumptions: FairValueAssumptions;
}

export interface RatioResult {
  priceToBook: number;
  pegRatio?: number;
  currentRatio: number;
  quickRatio: number;
  payoutRatio?: number;
}
```

- [ ] **Step 2: Write `backend/src/config/dcf-config.ts`**

```typescript
export const DCF_CONFIG = {
  discountRate: 0.09,
  terminalGrowthRate: 0.025,
  projectionYears: 10,
  maxGrowthRateCap: 0.15
};
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p backend/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/types/domain.ts backend/src/config/dcf-config.ts
git commit -m "feat: add domain types and DCF config"
```

---

### Task 3: RatioService (pure math)

**Files:**
- Create: `backend/src/services/ratio.service.ts`
- Test: `backend/src/services/ratio.service.test.ts`

**Interfaces:**
- Consumes: `RawQuote`, `RawFinancials`, `RatioResult` from `../types/domain`.
- Produces: `RatioService.compute(quote: RawQuote, financials: RawFinancials): RatioResult`, used by `ticker.service.ts` (Task 9).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/services/ratio.service.test.ts
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
  currentAssets: 500,
  currentLiabilities: 250,
  inventory: 100,
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

test('computes currentRatio as currentAssets / currentLiabilities', () => {
  const result = RatioService.compute(quote, financials);
  expect(result.currentRatio).toBeCloseTo(2); // 500 / 250
});

test('computes quickRatio as (currentAssets - inventory) / currentLiabilities', () => {
  const result = RatioService.compute(quote, financials);
  expect(result.quickRatio).toBeCloseTo(1.6); // (500-100)/250
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest ratio.service -w backend --config backend/jest.config.js` (or `npm test -w backend -- ratio.service`)
Expected: FAIL — `Cannot find module './ratio.service'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/services/ratio.service.ts
import { RawQuote, RawFinancials, RatioResult } from '../types/domain';

export class RatioService {
  static compute(quote: RawQuote, financials: RawFinancials): RatioResult {
    const priceToBook = quote.currentPrice / financials.bookValuePerShare;

    const currentRatio = financials.currentAssets / financials.currentLiabilities;
    const quickRatio = (financials.currentAssets - financials.inventory) / financials.currentLiabilities;

    let pegRatio: number | undefined;
    if (financials.earningsGrowthRate && financials.earningsGrowthRate !== 0) {
      const priceToEarnings = quote.currentPrice / financials.earningsPerShare;
      pegRatio = priceToEarnings / financials.earningsGrowthRate;
    }

    let payoutRatio: number | undefined;
    if (financials.dividendsPaidTTM !== undefined && financials.netIncomeTTM) {
      payoutRatio = financials.dividendsPaidTTM / financials.netIncomeTTM;
    }

    return { priceToBook, pegRatio, currentRatio, quickRatio, payoutRatio };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w backend -- ratio.service`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ratio.service.ts backend/src/services/ratio.service.test.ts
git commit -m "feat: add RatioService with P/B, PEG, current/quick, payout ratios"
```

---

### Task 4: CurrencyConverter interface + Frankfurter implementation

**Files:**
- Create: `backend/src/providers/currency-converter.interface.ts`
- Create: `backend/src/providers/frankfurter.converter.ts`
- Test: `backend/src/providers/frankfurter.converter.test.ts`

**Interfaces:**
- Produces: `CurrencyConverter` interface (`getRate(from: string, to: string): Promise<number>`) and `FrankfurterConverter implements CurrencyConverter`, consumed by `ticker.service.ts` (Task 9) and `fx-rate.model.ts` caching (Task 8, folded into TickerService there).

- [ ] **Step 1: Write `backend/src/providers/currency-converter.interface.ts`**

```typescript
export interface CurrencyConverter {
  getRate(fromCurrency: string, toCurrency: string): Promise<number>;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// backend/src/providers/frankfurter.converter.test.ts
import { FrankfurterConverter } from './frankfurter.converter';

describe('FrankfurterConverter', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () =>
      ({
        ok: true,
        json: async () => ({ amount: 1, base: 'INR', date: '2026-08-12', rates: { USD: 0.012 } })
      } as Response)
    );
  });

  test('returns rate from Frankfurter API response', async () => {
    const converter = new FrankfurterConverter();
    const rate = await converter.getRate('INR', 'USD');
    expect(rate).toBe(0.012);
    expect(global.fetch).toHaveBeenCalledWith('https://api.frankfurter.app/latest?from=INR&to=USD');
  });

  test('returns 1 when converting a currency to itself, without calling fetch', async () => {
    const converter = new FrankfurterConverter();
    const rate = await converter.getRate('USD', 'USD');
    expect(rate).toBe(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w backend -- frankfurter.converter`
Expected: FAIL — `Cannot find module './frankfurter.converter'`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// backend/src/providers/frankfurter.converter.ts
import { CurrencyConverter } from './currency-converter.interface';

export class FrankfurterConverter implements CurrencyConverter {
  async getRate(fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`
    );
    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.status}`);
    }
    const data = await response.json() as { rates: Record<string, number> };
    return data.rates[toCurrency];
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w backend -- frankfurter.converter`
Expected: PASS, both tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/providers/currency-converter.interface.ts backend/src/providers/frankfurter.converter.ts backend/src/providers/frankfurter.converter.test.ts
git commit -m "feat: add CurrencyConverter interface and Frankfurter implementation"
```

---

### Task 5: FairValueCalculator interface + DCF implementation

**Files:**
- Create: `backend/src/providers/fair-value-calculator.interface.ts`
- Create: `backend/src/providers/dcf-fair-value.calculator.ts`
- Test: `backend/src/providers/dcf-fair-value.calculator.test.ts`

**Interfaces:**
- Consumes: `RawFinancials`, `FairValueResult`, `DCF_CONFIG`.
- Produces: `FairValueCalculator` interface (`calculate(financials: RawFinancials, sharesOutstanding: number): Promise<FairValueResult>`) and `DcfFairValueCalculator`, consumed by `ticker.service.ts` (Task 9).

- [ ] **Step 1: Write `backend/src/providers/fair-value-calculator.interface.ts`**

```typescript
import { RawFinancials, FairValueResult } from '../types/domain';

export interface FairValueCalculator {
  calculate(financials: RawFinancials): Promise<FairValueResult>;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// backend/src/providers/dcf-fair-value.calculator.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w backend -- dcf-fair-value.calculator`
Expected: FAIL — `Cannot find module './dcf-fair-value.calculator'`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// backend/src/providers/dcf-fair-value.calculator.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w backend -- dcf-fair-value.calculator`
Expected: PASS, all 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/providers/fair-value-calculator.interface.ts backend/src/providers/dcf-fair-value.calculator.ts backend/src/providers/dcf-fair-value.calculator.test.ts
git commit -m "feat: add FairValueCalculator interface and DCF implementation"
```

---

### Task 6: StockDataProvider interface + Yahoo Finance implementation

**Files:**
- Create: `backend/src/providers/stock-data-provider.interface.ts`
- Create: `backend/src/providers/yahoo-finance.provider.ts`
- Test: `backend/src/providers/yahoo-finance.provider.test.ts`

**Interfaces:**
- Consumes: `RawQuote`, `RawFinancials`.
- Produces: `StockDataProvider` interface (`getQuote`, `getFinancials`) and `YahooFinanceProvider`, consumed by `ticker.service.ts` (Task 9).

- [ ] **Step 1: Write `backend/src/providers/stock-data-provider.interface.ts`**

```typescript
import { RawQuote, RawFinancials } from '../types/domain';

export interface StockDataProvider {
  getQuote(symbol: string): Promise<RawQuote>;
  getFinancials(symbol: string): Promise<RawFinancials>;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// backend/src/providers/yahoo-finance.provider.test.ts
import { YahooFinanceProvider } from './yahoo-finance.provider';

jest.mock('yahoo-finance2', () => ({
  __esModule: true,
  default: {
    quote: jest.fn(async () => ({
      symbol: 'AAPL',
      longName: 'Apple Inc.',
      sector: 'Technology',
      fullExchangeName: 'NASDAQ',
      currency: 'USD',
      regularMarketPrice: 190
    })),
    quoteSummary: jest.fn(async () => ({
      defaultKeyStatistics: { sharesOutstanding: 15000000000, bookValue: 4.5 },
      financialData: { currentRatio: 1.1, quickRatio: 0.9, earningsGrowth: 0.08 },
      summaryDetail: {
        payoutRatio: 0.16,
        dividendRate: 1.0,
        priceToBook: 42
      },
      cashflowStatementHistory: {
        cashflowStatements: [
          { freeCashFlow: 90000000000 },
          { freeCashFlow: 95000000000 }
        ]
      }
    }))
  }
}));

test('getQuote maps Yahoo quote fields to RawQuote', async () => {
  const provider = new YahooFinanceProvider();
  const quote = await provider.getQuote('AAPL');
  expect(quote).toEqual({
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Technology',
    exchange: 'NASDAQ',
    country: expect.any(String),
    currency: 'USD',
    currentPrice: 190
  });
});

test('getFinancials maps Yahoo quoteSummary fields to RawFinancials', async () => {
  const provider = new YahooFinanceProvider();
  const financials = await provider.getFinancials('AAPL');
  expect(financials.sharesOutstanding).toBe(15000000000);
  expect(financials.freeCashFlowHistory).toEqual([90000000000, 95000000000]);
  expect(financials.currentAssets).toBeUndefined; // not asserted directly; ratios come from financialData below instead
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w backend -- yahoo-finance.provider`
Expected: FAIL — `Cannot find module './yahoo-finance.provider'`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// backend/src/providers/yahoo-finance.provider.ts
import yahooFinance from 'yahoo-finance2';
import { StockDataProvider } from './stock-data-provider.interface';
import { RawQuote, RawFinancials } from '../types/domain';

const EXCHANGE_COUNTRY_MAP: Record<string, string> = {
  NASDAQ: 'US', NYSE: 'US', TSX: 'CA', NSE: 'IN', BSE: 'IN',
  LSE: 'GB', XETRA: 'DE'
};

export class YahooFinanceProvider implements StockDataProvider {
  async getQuote(symbol: string): Promise<RawQuote> {
    const quote: any = await yahooFinance.quote(symbol);
    return {
      symbol: quote.symbol,
      companyName: quote.longName ?? quote.shortName ?? quote.symbol,
      sector: quote.sector ?? 'Unknown',
      exchange: quote.fullExchangeName ?? quote.exchange ?? 'Unknown',
      country: EXCHANGE_COUNTRY_MAP[quote.exchange] ?? 'Unknown',
      currency: quote.currency,
      currentPrice: quote.regularMarketPrice
    };
  }

  async getFinancials(symbol: string): Promise<RawFinancials> {
    const summary: any = await yahooFinance.quoteSummary(symbol, {
      modules: [
        'defaultKeyStatistics',
        'financialData',
        'summaryDetail',
        'cashflowStatementHistory'
      ]
    });

    const cashflowStatements = summary.cashflowStatementHistory?.cashflowStatements ?? [];
    const freeCashFlowHistory = [...cashflowStatements]
      .reverse()
      .map((s: any) => s.freeCashFlow)
      .filter((v: number | undefined) => typeof v === 'number');

    return {
      symbol,
      freeCashFlowHistory,
      sharesOutstanding: summary.defaultKeyStatistics?.sharesOutstanding,
      bookValuePerShare: summary.defaultKeyStatistics?.bookValue,
      earningsPerShare: summary.defaultKeyStatistics?.trailingEps,
      earningsGrowthRate: summary.financialData?.earningsGrowth
        ? summary.financialData.earningsGrowth * 100
        : undefined,
      currentAssets: summary.financialData?.currentRatio && summary.financialData?.totalCurrentLiabilities
        ? summary.financialData.currentRatio * summary.financialData.totalCurrentLiabilities
        : summary.financialData?.currentRatio, // fallback if raw asset/liability figures unavailable
      currentLiabilities: summary.financialData?.totalCurrentLiabilities ?? 1,
      inventory: summary.financialData?.inventory ?? 0,
      lastDividendDate: summary.summaryDetail?.exDividendDate
        ? new Date(summary.summaryDetail.exDividendDate)
        : undefined,
      lastDividendAmount: summary.summaryDetail?.dividendRate,
      dividendsPaidTTM: summary.summaryDetail?.dividendRate && summary.defaultKeyStatistics?.sharesOutstanding
        ? summary.summaryDetail.dividendRate * summary.defaultKeyStatistics.sharesOutstanding
        : undefined,
      netIncomeTTM: summary.financialData?.netIncomeToCommon,
      priceToBookIndustryAvg: undefined,
      currentRatioIndustryAvg: undefined,
      quickRatioIndustryAvg: undefined
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w backend -- yahoo-finance.provider`
Expected: PASS, both tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/providers/stock-data-provider.interface.ts backend/src/providers/yahoo-finance.provider.ts backend/src/providers/yahoo-finance.provider.test.ts
git commit -m "feat: add StockDataProvider interface and Yahoo Finance implementation"
```

**Note for implementer:** `yahoo-finance2`'s exact `quoteSummary` field names can shift between versions. If a field listed above doesn't exist on the installed version, run `npx tsc --noEmit` to surface the mismatch and adjust the mapping — the shape of `RawFinancials` itself must not change, since `RatioService` and `DcfFairValueCalculator` (Tasks 3 and 5) already depend on it.

---

### Task 7: Mongoose models (Ticker, TickerHistory, FxRate)

**Files:**
- Create: `backend/src/models/ticker.model.ts`
- Create: `backend/src/models/ticker-history.model.ts`
- Create: `backend/src/models/fx-rate.model.ts`
- Create: `backend/src/db/mongo.ts`
- Test: `backend/src/models/ticker.model.test.ts` (uses `mongodb-memory-server` for an isolated in-process Mongo)

**Interfaces:**
- Produces: `TickerModel`, `TickerDocument`, `CachedData` type; `TickerHistoryModel`; `FxRateModel`; `connectMongo(): Promise<void>`. Consumed by `ticker.service.ts` (Task 9).

- [ ] **Step 1: Add `mongodb-memory-server` as a dev dependency**

Edit `backend/package.json` devDependencies to add:
```json
"mongodb-memory-server": "^9.4.1"
```
Run: `npm install -w backend`

- [ ] **Step 2: Write the failing test**

```typescript
// backend/src/models/ticker.model.test.ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TickerModel } from './ticker.model';

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
  await TickerModel.deleteMany({});
});

test('creates and retrieves a ticker with required fields', async () => {
  await TickerModel.create({
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Technology',
    exchange: 'NASDAQ',
    country: 'US',
    nativeCurrency: 'USD',
    lists: ['portfolio']
  });

  const found = await TickerModel.findOne({ symbol: 'AAPL' });
  expect(found?.companyName).toBe('Apple Inc.');
  expect(found?.lists).toContain('portfolio');
});

test('rejects a lists value outside portfolio/watchlist', async () => {
  await expect(
    TickerModel.create({
      symbol: 'BAD',
      companyName: 'Bad Co',
      sector: 'Tech',
      exchange: 'NASDAQ',
      country: 'US',
      nativeCurrency: 'USD',
      lists: ['not-a-real-list']
    })
  ).rejects.toThrow();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w backend -- ticker.model`
Expected: FAIL — `Cannot find module './ticker.model'`.

- [ ] **Step 4: Write `backend/src/models/ticker.model.ts`**

```typescript
import { Schema, model, Document } from 'mongoose';

export interface CachedData {
  fetchedAt: Date;
  currentPrice: number;
  fairValue: number;
  nativePrice: number;
  nativeFairValue: number;
  fxRateToUsd: number;
  priceToBook: number;
  priceToBookIndustryAvg?: number;
  pegRatio?: number;
  currentRatio: number;
  currentRatioIndustryAvg?: number;
  quickRatio: number;
  quickRatioIndustryAvg?: number;
  lastDividendDate?: Date;
  lastDividendAmount?: number;
  payoutRatio?: number;
}

export interface TickerDocument extends Document {
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  nativeCurrency: string;
  lists: ('portfolio' | 'watchlist')[];
  cachedData?: CachedData;
}

const cachedDataSchema = new Schema<CachedData>({
  fetchedAt: { type: Date, required: true },
  currentPrice: { type: Number, required: true },
  fairValue: { type: Number, required: true },
  nativePrice: { type: Number, required: true },
  nativeFairValue: { type: Number, required: true },
  fxRateToUsd: { type: Number, required: true },
  priceToBook: { type: Number, required: true },
  priceToBookIndustryAvg: Number,
  pegRatio: Number,
  currentRatio: { type: Number, required: true },
  currentRatioIndustryAvg: Number,
  quickRatio: { type: Number, required: true },
  quickRatioIndustryAvg: Number,
  lastDividendDate: Date,
  lastDividendAmount: Number,
  payoutRatio: Number
}, { _id: false });

const tickerSchema = new Schema<TickerDocument>({
  symbol: { type: String, required: true, unique: true },
  companyName: { type: String, required: true },
  sector: { type: String, required: true },
  exchange: { type: String, required: true },
  country: { type: String, required: true },
  nativeCurrency: { type: String, required: true },
  lists: {
    type: [{ type: String, enum: ['portfolio', 'watchlist'] }],
    required: true,
    default: []
  },
  cachedData: cachedDataSchema
});

export const TickerModel = model<TickerDocument>('Ticker', tickerSchema);
```

- [ ] **Step 5: Write `backend/src/models/ticker-history.model.ts`**

```typescript
import { Schema, model, Document } from 'mongoose';
import { CachedData } from './ticker.model';

export interface TickerHistoryDocument extends Document {
  symbol: string;
  archivedAt: Date;
  data: CachedData;
}

const historyDataSchema = new Schema<CachedData>({
  fetchedAt: { type: Date, required: true },
  currentPrice: { type: Number, required: true },
  fairValue: { type: Number, required: true },
  nativePrice: { type: Number, required: true },
  nativeFairValue: { type: Number, required: true },
  fxRateToUsd: { type: Number, required: true },
  priceToBook: { type: Number, required: true },
  priceToBookIndustryAvg: Number,
  pegRatio: Number,
  currentRatio: { type: Number, required: true },
  currentRatioIndustryAvg: Number,
  quickRatio: { type: Number, required: true },
  quickRatioIndustryAvg: Number,
  lastDividendDate: Date,
  lastDividendAmount: Number,
  payoutRatio: Number
}, { _id: false });

const tickerHistorySchema = new Schema<TickerHistoryDocument>({
  symbol: { type: String, required: true },
  archivedAt: { type: Date, required: true },
  data: { type: historyDataSchema, required: true }
});

export const TickerHistoryModel = model<TickerHistoryDocument>('TickerHistory', tickerHistorySchema);
```

- [ ] **Step 6: Write `backend/src/models/fx-rate.model.ts`**

```typescript
import { Schema, model, Document } from 'mongoose';

export interface FxRateDocument extends Document {
  from: string;
  to: string;
  rate: number;
  fetchedAt: Date;
}

const fxRateSchema = new Schema<FxRateDocument>({
  from: { type: String, required: true },
  to: { type: String, required: true },
  rate: { type: Number, required: true },
  fetchedAt: { type: Date, required: true }
});

fxRateSchema.index({ from: 1, to: 1 }, { unique: true });

export const FxRateModel = model<FxRateDocument>('FxRate', fxRateSchema);
```

- [ ] **Step 7: Write `backend/src/db/mongo.ts`**

```typescript
import mongoose from 'mongoose';

export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI environment variable is not set');
  }
  await mongoose.connect(uri);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -w backend -- ticker.model`
Expected: PASS, both tests green.

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/src/models backend/src/db
git commit -m "feat: add Mongoose models for Ticker, TickerHistory, FxRate"
```

---

### Task 8: TickerService — add/remove/list (no refresh yet)

**Files:**
- Create: `backend/src/services/ticker.service.ts`
- Test: `backend/src/services/ticker.service.test.ts`

**Interfaces:**
- Consumes: `StockDataProvider`, `FairValueCalculator`, `CurrencyConverter`, `RatioService`, `TickerModel`, `TickerHistoryModel`, `FxRateModel`.
- Produces (this task): `TickerService` class with constructor `(provider: StockDataProvider, calculator: FairValueCalculator, converter: CurrencyConverter)`, methods `addTicker(symbol, list)`, `removeTicker(symbol, list)`, `getList(list): Promise<TickerDocument[]>`. Refresh methods added in Task 9.

- [ ] **Step 1: Write the failing test (using in-memory Mongo + fake providers)**

```typescript
// backend/src/services/ticker.service.test.ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TickerService } from './ticker.service';
import { TickerModel } from '../models/ticker.model';
import { StockDataProvider } from '../providers/stock-data-provider.interface';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';

let mongod: MongoMemoryServer;

const fakeProvider: StockDataProvider = {
  getQuote: async (symbol: string) => ({
    symbol, companyName: `${symbol} Inc.`, sector: 'Technology',
    exchange: 'NASDAQ', country: 'US', currency: 'USD', currentPrice: 100
  }),
  getFinancials: async (symbol: string) => ({
    symbol,
    freeCashFlowHistory: [10, 11, 12],
    sharesOutstanding: 100,
    bookValuePerShare: 50,
    earningsPerShare: 5,
    earningsGrowthRate: 10,
    currentAssets: 200,
    currentLiabilities: 100,
    inventory: 20,
    dividendsPaidTTM: 20,
    netIncomeTTM: 100
  })
};

const fakeCalculator: FairValueCalculator = {
  calculate: async () => ({
    fairValue: 120,
    assumptions: { growthRate: 0.1, discountRate: 0.09, terminalGrowthRate: 0.025, projectionYears: 10 }
  })
};

const fakeConverter: CurrencyConverter = {
  getRate: async () => 1
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await TickerModel.deleteMany({});
});

test('addTicker creates a new ticker doc with fetched+cached data', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');

  expect(ticker.symbol).toBe('AAPL');
  expect(ticker.lists).toEqual(['portfolio']);
  expect(ticker.cachedData?.currentPrice).toBe(100);
  expect(ticker.cachedData?.fairValue).toBe(120);
});

test('addTicker adds a second list to an existing ticker instead of duplicating', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');
  const updated = await service.addTicker('AAPL', 'watchlist');

  expect(updated.lists.sort()).toEqual(['portfolio', 'watchlist']);
  const count = await TickerModel.countDocuments({ symbol: 'AAPL' });
  expect(count).toBe(1);
});

test('removeTicker removes only the given list, keeping the doc if still in another list', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');
  await service.addTicker('AAPL', 'watchlist');

  await service.removeTicker('AAPL', 'portfolio');
  const remaining = await TickerModel.findOne({ symbol: 'AAPL' });
  expect(remaining?.lists).toEqual(['watchlist']);
});

test('removeTicker deletes the doc entirely when its last list is removed', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('AAPL', 'portfolio');
  await service.removeTicker('AAPL', 'portfolio');

  const remaining = await TickerModel.findOne({ symbol: 'AAPL' });
  expect(remaining).toBeNull();
});

test('getList returns tickers for the given list, sorted by sector then company name', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  await service.addTicker('ZZZ', 'portfolio');
  await service.addTicker('AAA', 'portfolio');
  await TickerModel.updateOne({ symbol: 'ZZZ' }, { sector: 'Energy' });
  await TickerModel.updateOne({ symbol: 'AAA' }, { sector: 'Technology' });

  const list = await service.getList('portfolio');
  expect(list.map(t => t.symbol)).toEqual(['ZZZ', 'AAA']); // Energy before Technology
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w backend -- ticker.service`
Expected: FAIL — `Cannot find module './ticker.service'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/services/ticker.service.ts
import { StockDataProvider } from '../providers/stock-data-provider.interface';
import { FairValueCalculator } from '../providers/fair-value-calculator.interface';
import { CurrencyConverter } from '../providers/currency-converter.interface';
import { RatioService } from './ratio.service';
import { TickerModel, TickerDocument, CachedData } from '../models/ticker.model';

const DISPLAY_CURRENCY = 'USD';

export class TickerService {
  constructor(
    private provider: StockDataProvider,
    private calculator: FairValueCalculator,
    private converter: CurrencyConverter
  ) {}

  private async fetchCachedData(symbol: string): Promise<{
    companyName: string; sector: string; exchange: string; country: string; nativeCurrency: string;
    cachedData: CachedData;
  }> {
    const quote = await this.provider.getQuote(symbol);
    const financials = await this.provider.getFinancials(symbol);
    const fairValueResult = await this.calculator.calculate(financials);
    const ratios = RatioService.compute(quote, financials);
    const fxRateToUsd = await this.converter.getRate(quote.currency, DISPLAY_CURRENCY);

    const cachedData: CachedData = {
      fetchedAt: new Date(),
      currentPrice: quote.currentPrice * fxRateToUsd,
      fairValue: fairValueResult.fairValue * fxRateToUsd,
      nativePrice: quote.currentPrice,
      nativeFairValue: fairValueResult.fairValue,
      fxRateToUsd,
      priceToBook: ratios.priceToBook,
      priceToBookIndustryAvg: financials.priceToBookIndustryAvg,
      pegRatio: ratios.pegRatio,
      currentRatio: ratios.currentRatio,
      currentRatioIndustryAvg: financials.currentRatioIndustryAvg,
      quickRatio: ratios.quickRatio,
      quickRatioIndustryAvg: financials.quickRatioIndustryAvg,
      lastDividendDate: financials.lastDividendDate,
      lastDividendAmount: financials.lastDividendAmount,
      payoutRatio: ratios.payoutRatio
    };

    return {
      companyName: quote.companyName,
      sector: quote.sector,
      exchange: quote.exchange,
      country: quote.country,
      nativeCurrency: quote.currency,
      cachedData
    };
  }

  async addTicker(symbol: string, list: 'portfolio' | 'watchlist'): Promise<TickerDocument> {
    const existing = await TickerModel.findOne({ symbol });
    if (existing) {
      if (!existing.lists.includes(list)) {
        existing.lists.push(list);
        await existing.save();
      }
      return existing;
    }

    const { companyName, sector, exchange, country, nativeCurrency, cachedData } =
      await this.fetchCachedData(symbol);

    return TickerModel.create({
      symbol, companyName, sector, exchange, country, nativeCurrency,
      lists: [list], cachedData
    });
  }

  async removeTicker(symbol: string, list: 'portfolio' | 'watchlist'): Promise<void> {
    const ticker = await TickerModel.findOne({ symbol });
    if (!ticker) return;

    ticker.lists = ticker.lists.filter(l => l !== list);
    if (ticker.lists.length === 0) {
      await TickerModel.deleteOne({ symbol });
    } else {
      await ticker.save();
    }
  }

  async getList(list: 'portfolio' | 'watchlist'): Promise<TickerDocument[]> {
    return TickerModel.find({ lists: list }).sort({ sector: 1, companyName: 1 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w backend -- ticker.service`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ticker.service.ts backend/src/services/ticker.service.test.ts
git commit -m "feat: add TickerService add/remove/list operations"
```

---

### Task 9: TickerService — refresh with history archiving and 15-day TTL

**Files:**
- Modify: `backend/src/services/ticker.service.ts`
- Modify: `backend/src/services/ticker.service.test.ts`

**Interfaces:**
- Consumes: `TickerHistoryModel` (new).
- Produces: `refreshTicker(symbol): Promise<TickerDocument>`, `ensureFresh(ticker): Promise<TickerDocument>` (15-day TTL check), consumed by routes in Task 11.

- [ ] **Step 1: Write the failing tests (append to existing test file)**

```typescript
// append to backend/src/services/ticker.service.test.ts
import { TickerHistoryModel } from '../models/ticker-history.model';

afterEach(async () => {
  await TickerHistoryModel.deleteMany({});
});

test('refreshTicker archives the previous cachedData into tickerHistory before overwriting', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const original = await service.addTicker('AAPL', 'portfolio');
  const originalFetchedAt = original.cachedData!.fetchedAt;

  await service.refreshTicker('AAPL');

  const historyEntries = await TickerHistoryModel.find({ symbol: 'AAPL' });
  expect(historyEntries).toHaveLength(1);
  expect(historyEntries[0].data.currentPrice).toBe(original.cachedData!.currentPrice);
  expect(historyEntries[0].archivedAt.getTime()).toBe(originalFetchedAt.getTime());
});

test('refreshTicker updates cachedData.fetchedAt to a newer timestamp', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const original = await service.addTicker('AAPL', 'portfolio');
  const originalFetchedAt = original.cachedData!.fetchedAt;

  await new Promise(resolve => setTimeout(resolve, 5));
  const refreshed = await service.refreshTicker('AAPL');

  expect(refreshed.cachedData!.fetchedAt.getTime()).toBeGreaterThan(originalFetchedAt.getTime());
});

test('ensureFresh refreshes a ticker whose cachedData is older than 15 days', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  const staleDate = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000);
  ticker.cachedData!.fetchedAt = staleDate;
  await ticker.save();

  const result = await service.ensureFresh(ticker);
  expect(result.cachedData!.fetchedAt.getTime()).toBeGreaterThan(staleDate.getTime());

  const historyEntries = await TickerHistoryModel.find({ symbol: 'AAPL' });
  expect(historyEntries).toHaveLength(1);
});

test('ensureFresh does not refresh a ticker whose cachedData is within 15 days', async () => {
  const service = new TickerService(fakeProvider, fakeCalculator, fakeConverter);
  const ticker = await service.addTicker('AAPL', 'portfolio');
  const freshFetchedAt = ticker.cachedData!.fetchedAt;

  const result = await service.ensureFresh(ticker);
  expect(result.cachedData!.fetchedAt.getTime()).toBe(freshFetchedAt.getTime());

  const historyEntries = await TickerHistoryModel.find({ symbol: 'AAPL' });
  expect(historyEntries).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w backend -- ticker.service`
Expected: FAIL — `refreshTicker`/`ensureFresh` are not functions.

- [ ] **Step 3: Add refresh methods to `ticker.service.ts`**

```typescript
// add to backend/src/services/ticker.service.ts, inside the TickerService class,
// and add this import at the top:
// import { TickerHistoryModel } from '../models/ticker-history.model';

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

// ...inside the class:
  async refreshTicker(symbol: string): Promise<TickerDocument> {
    const ticker = await TickerModel.findOne({ symbol });
    if (!ticker) {
      throw new Error(`Ticker ${symbol} not found`);
    }

    if (ticker.cachedData) {
      await TickerHistoryModel.create({
        symbol,
        archivedAt: ticker.cachedData.fetchedAt,
        data: ticker.cachedData
      });
    }

    const { cachedData } = await this.fetchCachedData(symbol);
    ticker.cachedData = cachedData;
    await ticker.save();
    return ticker;
  }

  async refreshTickers(symbols: string[]): Promise<TickerDocument[]> {
    const results: TickerDocument[] = [];
    for (const symbol of symbols) {
      results.push(await this.refreshTicker(symbol));
    }
    return results;
  }

  async refreshAll(): Promise<TickerDocument[]> {
    const all = await TickerModel.find({});
    return this.refreshTickers(all.map(t => t.symbol));
  }

  async ensureFresh(ticker: TickerDocument): Promise<TickerDocument> {
    const fetchedAt = ticker.cachedData?.fetchedAt;
    const isStale = !fetchedAt || (Date.now() - fetchedAt.getTime()) > FIFTEEN_DAYS_MS;
    if (!isStale) return ticker;
    return this.refreshTicker(ticker.symbol);
  }
```

Also update `getList` to run `ensureFresh` on each result:

```typescript
  async getList(list: 'portfolio' | 'watchlist'): Promise<TickerDocument[]> {
    const tickers = await TickerModel.find({ lists: list }).sort({ sector: 1, companyName: 1 });
    return Promise.all(tickers.map(t => this.ensureFresh(t)));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w backend -- ticker.service`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ticker.service.ts backend/src/services/ticker.service.test.ts
git commit -m "feat: add refresh, bulk refresh, and 15-day TTL to TickerService"
```

---

### Task 10: Express app, routes, and server entrypoint

**Files:**
- Create: `backend/src/routes/portfolio.routes.ts`
- Create: `backend/src/routes/watchlist.routes.ts`
- Create: `backend/src/routes/tickers.routes.ts`
- Create: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/src/app.test.ts`

**Interfaces:**
- Consumes: `TickerService`, `YahooFinanceProvider`, `DcfFairValueCalculator`, `FrankfurterConverter`.
- Produces: `createApp(tickerService: TickerService): Express` — an Express app factory taking a `TickerService` so tests can inject fakes; `server.ts` wires the real providers and calls `connectMongo()`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/app.test.ts
import request from 'supertest';
import { createApp } from './app';
import { TickerService } from './services/ticker.service';

function makeFakeService(): jest.Mocked<TickerService> {
  return {
    addTicker: jest.fn(async (symbol: string, list: string) => ({ symbol, lists: [list] } as any)),
    removeTicker: jest.fn(async () => {}),
    getList: jest.fn(async (list: string) => ([{ symbol: 'AAPL', lists: [list] } as any])),
    refreshTicker: jest.fn(async (symbol: string) => ({ symbol } as any)),
    refreshTickers: jest.fn(async (symbols: string[]) => symbols.map(s => ({ symbol: s } as any))),
    refreshAll: jest.fn(async () => ([{ symbol: 'AAPL' } as any])),
    ensureFresh: jest.fn(async (t: any) => t)
  } as any;
}

test('GET /api/portfolio returns the portfolio list', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).get('/api/portfolio');
  expect(res.status).toBe(200);
  expect(res.body).toEqual([{ symbol: 'AAPL', lists: ['portfolio'] }]);
  expect(service.getList).toHaveBeenCalledWith('portfolio');
});

test('POST /api/portfolio/:symbol adds a ticker to the portfolio', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).post('/api/portfolio/AAPL');
  expect(res.status).toBe(201);
  expect(service.addTicker).toHaveBeenCalledWith('AAPL', 'portfolio');
});

test('DELETE /api/watchlist/:symbol removes a ticker from the watchlist', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).delete('/api/watchlist/AAPL');
  expect(res.status).toBe(204);
  expect(service.removeTicker).toHaveBeenCalledWith('AAPL', 'watchlist');
});

test('POST /api/tickers/:symbol/refresh refreshes a single ticker', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).post('/api/tickers/AAPL/refresh');
  expect(res.status).toBe(200);
  expect(service.refreshTicker).toHaveBeenCalledWith('AAPL');
});

test('POST /api/tickers/refresh refreshes a set of symbols', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).post('/api/tickers/refresh').send({ symbols: ['AAPL', 'MSFT'] });
  expect(res.status).toBe(200);
  expect(service.refreshTickers).toHaveBeenCalledWith(['AAPL', 'MSFT']);
});

test('POST /api/tickers/refresh-all refreshes every tracked ticker', async () => {
  const service = makeFakeService();
  const app = createApp(service);
  const res = await request(app).post('/api/tickers/refresh-all');
  expect(res.status).toBe(200);
  expect(service.refreshAll).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w backend -- app.test`
Expected: FAIL — `Cannot find module './app'`.

- [ ] **Step 3: Write `backend/src/routes/portfolio.routes.ts`**

```typescript
import { Router } from 'express';
import { TickerService } from '../services/ticker.service';

export function portfolioRoutes(service: TickerService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const list = await service.getList('portfolio');
    res.json(list);
  });

  router.post('/:symbol', async (req, res) => {
    const ticker = await service.addTicker(req.params.symbol, 'portfolio');
    res.status(201).json(ticker);
  });

  router.delete('/:symbol', async (req, res) => {
    await service.removeTicker(req.params.symbol, 'portfolio');
    res.status(204).send();
  });

  return router;
}
```

- [ ] **Step 4: Write `backend/src/routes/watchlist.routes.ts`**

```typescript
import { Router } from 'express';
import { TickerService } from '../services/ticker.service';

export function watchlistRoutes(service: TickerService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const list = await service.getList('watchlist');
    res.json(list);
  });

  router.post('/:symbol', async (req, res) => {
    const ticker = await service.addTicker(req.params.symbol, 'watchlist');
    res.status(201).json(ticker);
  });

  router.delete('/:symbol', async (req, res) => {
    await service.removeTicker(req.params.symbol, 'watchlist');
    res.status(204).send();
  });

  return router;
}
```

- [ ] **Step 5: Write `backend/src/routes/tickers.routes.ts`**

```typescript
import { Router } from 'express';
import { TickerService } from '../services/ticker.service';

export function tickersRoutes(service: TickerService): Router {
  const router = Router();

  router.post('/:symbol/refresh', async (req, res) => {
    const ticker = await service.refreshTicker(req.params.symbol);
    res.status(200).json(ticker);
  });

  router.post('/refresh', async (req, res) => {
    const symbols: string[] = req.body.symbols ?? [];
    const tickers = await service.refreshTickers(symbols);
    res.status(200).json(tickers);
  });

  router.post('/refresh-all', async (_req, res) => {
    const tickers = await service.refreshAll();
    res.status(200).json(tickers);
  });

  return router;
}
```

- [ ] **Step 6: Write `backend/src/app.ts`**

```typescript
import express, { Express } from 'express';
import cors from 'cors';
import { TickerService } from './services/ticker.service';
import { portfolioRoutes } from './routes/portfolio.routes';
import { watchlistRoutes } from './routes/watchlist.routes';
import { tickersRoutes } from './routes/tickers.routes';

export function createApp(tickerService: TickerService): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/portfolio', portfolioRoutes(tickerService));
  app.use('/api/watchlist', watchlistRoutes(tickerService));
  app.use('/api/tickers', tickersRoutes(tickerService));

  return app;
}
```

- [ ] **Step 7: Write `backend/src/server.ts`**

```typescript
import 'dotenv/config';
import { createApp } from './app';
import { connectMongo } from './db/mongo';
import { TickerService } from './services/ticker.service';
import { YahooFinanceProvider } from './providers/yahoo-finance.provider';
import { DcfFairValueCalculator } from './providers/dcf-fair-value.calculator';
import { FrankfurterConverter } from './providers/frankfurter.converter';

async function main() {
  await connectMongo();

  const tickerService = new TickerService(
    new YahooFinanceProvider(),
    new DcfFairValueCalculator(),
    new FrankfurterConverter()
  );
  const app = createApp(tickerService);

  const port = process.env.PORT ?? 3000;
  app.listen(port, () => console.log(`Backend listening on port ${port}`));
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -w backend -- app.test`
Expected: PASS, all 6 tests green.

- [ ] **Step 9: Run the full backend test suite**

Run: `npm test -w backend`
Expected: all suites pass (ratio.service, frankfurter.converter, dcf-fair-value.calculator, yahoo-finance.provider, ticker.model, ticker.service, app.test).

- [ ] **Step 10: Manual smoke test against local MongoDB**

```bash
cp backend/.env.example backend/.env
# ensure your local MongoDB is running on the URI in backend/.env
npm run dev -w backend
```
In another terminal:
```bash
curl -X POST http://localhost:3000/api/portfolio/AAPL
curl http://localhost:3000/api/portfolio
```
Expected: first call returns a created ticker with `cachedData`; second call returns an array containing it. Stop the dev server with Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add backend/src/routes backend/src/app.ts backend/src/server.ts backend/src/app.test.ts
git commit -m "feat: add Express routes and server entrypoint"
```

---

## Frontend Tasks

### Task 11: Angular app scaffolding and routing

**Files:**
- Create: `frontend/` (via Angular CLI)
- Modify: `frontend/src/app/app-routing.module.ts`
- Modify: `frontend/src/app/app.component.html`
- Modify: root `package.json` (frontend workspace already declared in Task 1)

**Interfaces:**
- Produces: a runnable Angular app on `:4200` with `/portfolio` and `/watchlist` routes (placeholder redirects for now), consumed by Tasks 14/15.

- [ ] **Step 1: Scaffold the Angular app**

Run from repo root:
```bash
npx -p @angular/cli ng new frontend --routing --style=scss --skip-git --package-manager=npm
```
When prompted for SSR, choose No (this is a local dev tool, not needing SSR).

- [ ] **Step 2: Verify workspace wiring**

Run: `npm install` (from repo root, picks up the new `frontend` workspace)
Run: `npm start -w frontend`
Expected: Angular dev server starts on `http://localhost:4200`, default Angular welcome page loads. Stop with Ctrl+C.

- [ ] **Step 3: Set up routing to Portfolio/Watchlist placeholders**

Edit `frontend/src/app/app-routing.module.ts`:

```typescript
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'portfolio', pathMatch: 'full' },
  { path: 'portfolio', loadChildren: () => import('./portfolio/portfolio.module').then(m => m.PortfolioModule) },
  { path: 'watchlist', loadChildren: () => import('./watchlist/watchlist.module').then(m => m.WatchlistModule) }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
```

Replace `frontend/src/app/app.component.html` with:

```html
<nav>
  <a routerLink="/portfolio" routerLinkActive="active">Portfolio</a>
  <a routerLink="/watchlist" routerLinkActive="active">Watchlist</a>
</nav>
<router-outlet></router-outlet>
```

- [ ] **Step 4: Verify build (modules don't exist yet, so this step just confirms routing config is valid TypeScript)**

Run: `npx tsc --noEmit -p frontend/tsconfig.app.json 2>&1 | head -20`
Expected: errors about missing `./portfolio/portfolio.module` and `./watchlist/watchlist.module` — expected until Tasks 14/15. No other errors.

- [ ] **Step 5: Commit**

```bash
git add frontend package.json package-lock.json
git commit -m "chore: scaffold Angular app with portfolio/watchlist routing"
```

---

### Task 12: Shared Ticker model and StockApiService

**Files:**
- Create: `frontend/src/app/shared/models/ticker.model.ts`
- Create: `frontend/src/app/shared/services/stock-api.service.ts`
- Test: `frontend/src/app/shared/services/stock-api.service.spec.ts`

**Interfaces:**
- Produces: `Ticker` interface (mirrors backend `TickerDocument` JSON shape) and `StockApiService` with `getPortfolio()`, `getWatchlist()`, `addToPortfolio(symbol)`, `removeFromPortfolio(symbol)`, `addToWatchlist(symbol)`, `removeFromWatchlist(symbol)`, `refreshOne(symbol)`, `refreshMany(symbols)`, `refreshAll()` — all returning `Observable<...>`. Consumed by `PortfolioComponent`/`WatchlistComponent` (Tasks 14/15).

- [ ] **Step 1: Write `frontend/src/app/shared/models/ticker.model.ts`**

```typescript
export interface CachedData {
  fetchedAt: string;
  currentPrice: number;
  fairValue: number;
  nativePrice: number;
  nativeFairValue: number;
  fxRateToUsd: number;
  priceToBook: number;
  priceToBookIndustryAvg?: number;
  pegRatio?: number;
  currentRatio: number;
  currentRatioIndustryAvg?: number;
  quickRatio: number;
  quickRatioIndustryAvg?: number;
  lastDividendDate?: string;
  lastDividendAmount?: number;
  payoutRatio?: number;
}

export interface Ticker {
  _id: string;
  symbol: string;
  companyName: string;
  sector: string;
  exchange: string;
  country: string;
  nativeCurrency: string;
  lists: ('portfolio' | 'watchlist')[];
  cachedData?: CachedData;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// frontend/src/app/shared/services/stock-api.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StockApiService } from './stock-api.service';

describe('StockApiService', () => {
  let service: StockApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [StockApiService]
    });
    service = TestBed.inject(StockApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getPortfolio GETs /api/portfolio', () => {
    service.getPortfolio().subscribe();
    const req = httpMock.expectOne('/api/portfolio');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('addToPortfolio POSTs /api/portfolio/:symbol', () => {
    service.addToPortfolio('AAPL').subscribe();
    const req = httpMock.expectOne('/api/portfolio/AAPL');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('removeFromWatchlist DELETEs /api/watchlist/:symbol', () => {
    service.removeFromWatchlist('AAPL').subscribe();
    const req = httpMock.expectOne('/api/watchlist/AAPL');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('refreshMany POSTs /api/tickers/refresh with symbols body', () => {
    service.refreshMany(['AAPL', 'MSFT']).subscribe();
    const req = httpMock.expectOne('/api/tickers/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ symbols: ['AAPL', 'MSFT'] });
    req.flush([]);
  });

  it('refreshAll POSTs /api/tickers/refresh-all', () => {
    service.refreshAll().subscribe();
    const req = httpMock.expectOne('/api/tickers/refresh-all');
    expect(req.request.method).toBe('POST');
    req.flush([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w frontend -- --include='**/stock-api.service.spec.ts'`
Expected: FAIL — `Cannot find module './stock-api.service'`.

- [ ] **Step 4: Write `frontend/src/app/shared/services/stock-api.service.ts`**

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Ticker } from '../models/ticker.model';

@Injectable({ providedIn: 'root' })
export class StockApiService {
  constructor(private http: HttpClient) {}

  getPortfolio(): Observable<Ticker[]> {
    return this.http.get<Ticker[]>('/api/portfolio');
  }

  getWatchlist(): Observable<Ticker[]> {
    return this.http.get<Ticker[]>('/api/watchlist');
  }

  addToPortfolio(symbol: string): Observable<Ticker> {
    return this.http.post<Ticker>(`/api/portfolio/${symbol}`, {});
  }

  removeFromPortfolio(symbol: string): Observable<void> {
    return this.http.delete<void>(`/api/portfolio/${symbol}`);
  }

  addToWatchlist(symbol: string): Observable<Ticker> {
    return this.http.post<Ticker>(`/api/watchlist/${symbol}`, {});
  }

  removeFromWatchlist(symbol: string): Observable<void> {
    return this.http.delete<void>(`/api/watchlist/${symbol}`);
  }

  refreshOne(symbol: string): Observable<Ticker> {
    return this.http.post<Ticker>(`/api/tickers/${symbol}/refresh`, {});
  }

  refreshMany(symbols: string[]): Observable<Ticker[]> {
    return this.http.post<Ticker[]>('/api/tickers/refresh', { symbols });
  }

  refreshAll(): Observable<Ticker[]> {
    return this.http.post<Ticker[]>('/api/tickers/refresh-all', {});
  }
}
```

- [ ] **Step 5: Add `provideHttpClient` to app config**

Edit `frontend/src/app/app.module.ts` (or `app.config.ts` if using standalone bootstrap — Angular CLI's default `ng new` with `--routing` generates an `NgModule`-based app unless `--standalone` is passed, which it wasn't in Task 11) to import `HttpClientModule`:

```typescript
import { HttpClientModule } from '@angular/common/http';
// add HttpClientModule to the imports array of @NgModule
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w frontend -- --include='**/stock-api.service.spec.ts'`
Expected: PASS, all 5 tests green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/shared frontend/src/app/app.module.ts
git commit -m "feat: add Ticker model and StockApiService"
```

---

### Task 13: Color-indicator pipes

**Files:**
- Create: `frontend/src/app/shared/pipes/margin-of-safety-color.pipe.ts`
- Create: `frontend/src/app/shared/pipes/price-to-book-color.pipe.ts`
- Create: `frontend/src/app/shared/pipes/peg-color.pipe.ts`
- Create: `frontend/src/app/shared/pipes/ratio-color.pipe.ts`
- Create: `frontend/src/app/shared/pipes/payout-ratio-color.pipe.ts`
- Test: one `.spec.ts` per pipe

**Interfaces:**
- Produces: pipes each named `Pipe({name: '...'})`, transform signature `transform(value: number | undefined, ...args): 'green' | 'yellow' | 'red' | 'none'`. Consumed by `StockTableComponent` (Task 14).

- [ ] **Step 1: Write failing tests for all five pipes**

```typescript
// frontend/src/app/shared/pipes/margin-of-safety-color.pipe.spec.ts
import { MarginOfSafetyColorPipe } from './margin-of-safety-color.pipe';

describe('MarginOfSafetyColorPipe', () => {
  const pipe = new MarginOfSafetyColorPipe();
  it('green when price is >=20% below fair value', () => {
    expect(pipe.transform(80, 100)).toBe('green'); // 20% below
  });
  it('yellow when price is within +-20% of fair value', () => {
    expect(pipe.transform(95, 100)).toBe('yellow');
  });
  it('red when price is more than 20% above fair value', () => {
    expect(pipe.transform(130, 100)).toBe('red');
  });
  it('none when either value is undefined', () => {
    expect(pipe.transform(undefined, 100)).toBe('none');
  });
});
```

```typescript
// frontend/src/app/shared/pipes/price-to-book-color.pipe.spec.ts
import { PriceToBookColorPipe } from './price-to-book-color.pipe';

describe('PriceToBookColorPipe', () => {
  const pipe = new PriceToBookColorPipe();
  it('green when <= 1', () => expect(pipe.transform(1)).toBe('green'));
  it('yellow when <= 3', () => expect(pipe.transform(3)).toBe('yellow'));
  it('red when > 3', () => expect(pipe.transform(3.1)).toBe('red'));
  it('none when undefined', () => expect(pipe.transform(undefined)).toBe('none'));
});
```

```typescript
// frontend/src/app/shared/pipes/peg-color.pipe.spec.ts
import { PegColorPipe } from './peg-color.pipe';

describe('PegColorPipe', () => {
  const pipe = new PegColorPipe();
  it('green when <= 1', () => expect(pipe.transform(1)).toBe('green'));
  it('yellow when <= 2', () => expect(pipe.transform(2)).toBe('yellow'));
  it('red when > 2', () => expect(pipe.transform(2.1)).toBe('red'));
  it('none when undefined', () => expect(pipe.transform(undefined)).toBe('none'));
});
```

```typescript
// frontend/src/app/shared/pipes/ratio-color.pipe.spec.ts
import { RatioColorPipe } from './ratio-color.pipe';

describe('RatioColorPipe', () => {
  const pipe = new RatioColorPipe();
  it('green when > 1', () => expect(pipe.transform(1.5)).toBe('green'));
  it('red when < 1', () => expect(pipe.transform(0.5)).toBe('red'));
  it('red when exactly 1 (not > 1)', () => expect(pipe.transform(1)).toBe('red'));
  it('none when undefined', () => expect(pipe.transform(undefined)).toBe('none'));
});
```

```typescript
// frontend/src/app/shared/pipes/payout-ratio-color.pipe.spec.ts
import { PayoutRatioColorPipe } from './payout-ratio-color.pipe';

describe('PayoutRatioColorPipe', () => {
  const pipe = new PayoutRatioColorPipe();
  it('green when 0-50%', () => expect(pipe.transform(0.5)).toBe('green'));
  it('yellow when 50-80%', () => expect(pipe.transform(0.8)).toBe('yellow'));
  it('red when > 80%', () => expect(pipe.transform(0.81)).toBe('red'));
  it('none when undefined', () => expect(pipe.transform(undefined)).toBe('none'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w frontend -- --include='**/*-color.pipe.spec.ts'`
Expected: FAIL — pipe modules not found.

- [ ] **Step 3: Write `frontend/src/app/shared/pipes/margin-of-safety-color.pipe.ts`**

```typescript
import { Pipe, PipeTransform } from '@angular/core';

export type ColorLevel = 'green' | 'yellow' | 'red' | 'none';

@Pipe({ name: 'marginOfSafetyColor' })
export class MarginOfSafetyColorPipe implements PipeTransform {
  transform(currentPrice: number | undefined, fairValue: number | undefined): ColorLevel {
    if (currentPrice === undefined || fairValue === undefined || fairValue === 0) return 'none';
    const percentDiff = (currentPrice - fairValue) / fairValue; // negative = below fair value
    if (percentDiff <= -0.20) return 'green';
    if (percentDiff > 0.20) return 'red';
    return 'yellow';
  }
}
```

- [ ] **Step 4: Write `frontend/src/app/shared/pipes/price-to-book-color.pipe.ts`**

```typescript
import { Pipe, PipeTransform } from '@angular/core';
import { ColorLevel } from './margin-of-safety-color.pipe';

@Pipe({ name: 'priceToBookColor' })
export class PriceToBookColorPipe implements PipeTransform {
  transform(value: number | undefined): ColorLevel {
    if (value === undefined) return 'none';
    if (value <= 1) return 'green';
    if (value <= 3) return 'yellow';
    return 'red';
  }
}
```

- [ ] **Step 5: Write `frontend/src/app/shared/pipes/peg-color.pipe.ts`**

```typescript
import { Pipe, PipeTransform } from '@angular/core';
import { ColorLevel } from './margin-of-safety-color.pipe';

@Pipe({ name: 'pegColor' })
export class PegColorPipe implements PipeTransform {
  transform(value: number | undefined): ColorLevel {
    if (value === undefined) return 'none';
    if (value <= 1) return 'green';
    if (value <= 2) return 'yellow';
    return 'red';
  }
}
```

- [ ] **Step 6: Write `frontend/src/app/shared/pipes/ratio-color.pipe.ts`** (shared by current ratio and quick ratio — both use the same green >1 / red <1 rule, no yellow)

```typescript
import { Pipe, PipeTransform } from '@angular/core';
import { ColorLevel } from './margin-of-safety-color.pipe';

@Pipe({ name: 'ratioColor' })
export class RatioColorPipe implements PipeTransform {
  transform(value: number | undefined): ColorLevel {
    if (value === undefined) return 'none';
    return value > 1 ? 'green' : 'red';
  }
}
```

- [ ] **Step 7: Write `frontend/src/app/shared/pipes/payout-ratio-color.pipe.ts`**

```typescript
import { Pipe, PipeTransform } from '@angular/core';
import { ColorLevel } from './margin-of-safety-color.pipe';

@Pipe({ name: 'payoutRatioColor' })
export class PayoutRatioColorPipe implements PipeTransform {
  transform(value: number | undefined): ColorLevel {
    if (value === undefined) return 'none';
    if (value <= 0.50) return 'green';
    if (value <= 0.80) return 'yellow';
    return 'red';
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -w frontend -- --include='**/*-color.pipe.spec.ts'`
Expected: PASS, all 20 tests green across the 5 pipe spec files.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/shared/pipes
git commit -m "feat: add color-indicator pipes for value-investing metrics"
```

---

### Task 14: StockTableComponent (shared, grouped table with bulk actions)

**Files:**
- Create: `frontend/src/app/shared/stock-table/stock-table.component.ts`
- Create: `frontend/src/app/shared/stock-table/stock-table.component.html`
- Create: `frontend/src/app/shared/stock-table/stock-table.component.scss`
- Test: `frontend/src/app/shared/stock-table/stock-table.component.spec.ts`

**Interfaces:**
- Consumes: `Ticker` model, all 5 color pipes.
- Produces: `StockTableComponent` with `@Input() tickers: Ticker[]`, `@Output() refreshSelected: EventEmitter<string[]>`, `@Output() refreshAll: EventEmitter<void>`, `@Output() remove: EventEmitter<string>`, plus internal grouping-by-sector and row-selection state. Consumed by `PortfolioComponent`/`WatchlistComponent` (Tasks 15/16).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/app/shared/stock-table/stock-table.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StockTableComponent } from './stock-table.component';
import { MarginOfSafetyColorPipe } from '../pipes/margin-of-safety-color.pipe';
import { PriceToBookColorPipe } from '../pipes/price-to-book-color.pipe';
import { PegColorPipe } from '../pipes/peg-color.pipe';
import { RatioColorPipe } from '../pipes/ratio-color.pipe';
import { PayoutRatioColorPipe } from '../pipes/payout-ratio-color.pipe';
import { Ticker } from '../models/ticker.model';

const tickers: Ticker[] = [
  { _id: '1', symbol: 'ZZZ', companyName: 'Zebra Co', sector: 'Energy', exchange: 'NYSE', country: 'US', nativeCurrency: 'USD', lists: ['portfolio'] },
  { _id: '2', symbol: 'AAA', companyName: 'Apex Inc', sector: 'Technology', exchange: 'NASDAQ', country: 'US', nativeCurrency: 'USD', lists: ['portfolio'] },
  { _id: '3', symbol: 'BBB', companyName: 'Beacon Ltd', sector: 'Technology', exchange: 'NASDAQ', country: 'US', nativeCurrency: 'USD', lists: ['portfolio'] }
];

describe('StockTableComponent', () => {
  let fixture: ComponentFixture<StockTableComponent>;
  let component: StockTableComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [
        StockTableComponent, MarginOfSafetyColorPipe, PriceToBookColorPipe,
        PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
      ]
    });
    fixture = TestBed.createComponent(StockTableComponent);
    component = fixture.componentInstance;
    component.tickers = tickers;
    fixture.detectChanges();
  });

  it('groups rows by sector, sorted by sector then company name', () => {
    const groups = component.groupedBySector();
    expect(groups.map(g => g.sector)).toEqual(['Energy', 'Technology']);
    expect(groups[1].tickers.map(t => t.companyName)).toEqual(['Apex Inc', 'Beacon Ltd']);
  });

  it('selecting all rows via toggleSelectAll checks every ticker', () => {
    component.toggleSelectAll(true);
    expect(component.selectedSymbols.size).toBe(3);
  });

  it('refreshSelected emits only the checked symbols', () => {
    const emitted: string[][] = [];
    component.refreshSelected.subscribe((symbols: string[]) => emitted.push(symbols));
    component.toggleRow('AAA', true);
    component.onRefreshSelectedClick();
    expect(emitted).toEqual([['AAA']]);
  });

  it('onRefreshAllClick emits refreshAll', () => {
    let called = false;
    component.refreshAllEmitter.subscribe(() => { called = true; });
    component.onRefreshAllClick();
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w frontend -- --include='**/stock-table.component.spec.ts'`
Expected: FAIL — `Cannot find module './stock-table.component'`.

- [ ] **Step 3: Write `frontend/src/app/shared/stock-table/stock-table.component.ts`**

```typescript
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Ticker } from '../models/ticker.model';

interface SectorGroup {
  sector: string;
  tickers: Ticker[];
}

@Component({
  selector: 'app-stock-table',
  templateUrl: './stock-table.component.html',
  styleUrls: ['./stock-table.component.scss']
})
export class StockTableComponent {
  @Input() tickers: Ticker[] = [];
  @Output() refreshSelected = new EventEmitter<string[]>();
  @Output() refreshAllEmitter = new EventEmitter<void>();
  @Output() remove = new EventEmitter<string>();

  selectedSymbols = new Set<string>();

  groupedBySector(): SectorGroup[] {
    const bySector = new Map<string, Ticker[]>();
    for (const ticker of this.tickers) {
      const group = bySector.get(ticker.sector) ?? [];
      group.push(ticker);
      bySector.set(ticker.sector, group);
    }
    return Array.from(bySector.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sector, tickers]) => ({
        sector,
        tickers: [...tickers].sort((a, b) => a.companyName.localeCompare(b.companyName))
      }));
  }

  toggleRow(symbol: string, checked: boolean): void {
    if (checked) this.selectedSymbols.add(symbol);
    else this.selectedSymbols.delete(symbol);
  }

  toggleSelectAll(checked: boolean): void {
    this.selectedSymbols = checked
      ? new Set(this.tickers.map(t => t.symbol))
      : new Set();
  }

  onRefreshSelectedClick(): void {
    this.refreshSelected.emit(Array.from(this.selectedSymbols));
  }

  onRefreshAllClick(): void {
    this.refreshAllEmitter.emit();
  }

  onRemoveClick(symbol: string): void {
    this.remove.emit(symbol);
  }
}
```

- [ ] **Step 4: Write `frontend/src/app/shared/stock-table/stock-table.component.html`**

```html
<div class="toolbar">
  <button [disabled]="selectedSymbols.size === 0" (click)="onRefreshSelectedClick()">
    Refresh Selected
  </button>
  <button (click)="onRefreshAllClick()">Refresh All</button>
</div>

<table>
  <thead>
    <tr>
      <th><input type="checkbox" (change)="toggleSelectAll($any($event.target).checked)" /></th>
      <th>Ticker</th>
      <th>Company</th>
      <th>Current Price</th>
      <th>Fair Value</th>
      <th>P/B</th>
      <th>P/B Industry</th>
      <th>PEG</th>
      <th>Current Ratio</th>
      <th>Current Ratio Industry</th>
      <th>Quick Ratio</th>
      <th>Quick Ratio Industry</th>
      <th>Last Dividend Date</th>
      <th>Last Dividend Amount</th>
      <th>Payout Ratio</th>
      <th></th>
    </tr>
  </thead>
  <tbody *ngFor="let group of groupedBySector()">
    <tr class="sector-header">
      <td colspan="16">{{ group.sector }}</td>
    </tr>
    <tr *ngFor="let ticker of group.tickers">
      <td><input type="checkbox"
                 [checked]="selectedSymbols.has(ticker.symbol)"
                 (change)="toggleRow(ticker.symbol, $any($event.target).checked)" /></td>
      <td>{{ ticker.symbol }}</td>
      <td>{{ ticker.companyName }}</td>
      <td [class]="ticker.cachedData?.currentPrice! | marginOfSafetyColor:ticker.cachedData?.fairValue">
        {{ ticker.cachedData?.currentPrice | number:'1.2-2' }}
      </td>
      <td>{{ ticker.cachedData?.fairValue | number:'1.2-2' }}</td>
      <td [class]="ticker.cachedData?.priceToBook | priceToBookColor">{{ ticker.cachedData?.priceToBook | number:'1.2-2' }}</td>
      <td>{{ ticker.cachedData?.priceToBookIndustryAvg | number:'1.2-2' }}</td>
      <td [class]="ticker.cachedData?.pegRatio | pegColor">{{ ticker.cachedData?.pegRatio | number:'1.2-2' }}</td>
      <td [class]="ticker.cachedData?.currentRatio | ratioColor">{{ ticker.cachedData?.currentRatio | number:'1.2-2' }}</td>
      <td>{{ ticker.cachedData?.currentRatioIndustryAvg | number:'1.2-2' }}</td>
      <td [class]="ticker.cachedData?.quickRatio | ratioColor">{{ ticker.cachedData?.quickRatio | number:'1.2-2' }}</td>
      <td>{{ ticker.cachedData?.quickRatioIndustryAvg | number:'1.2-2' }}</td>
      <td>{{ ticker.cachedData?.lastDividendDate | date:'yyyy-MM-dd' }}</td>
      <td>{{ ticker.cachedData?.lastDividendAmount | number:'1.2-2' }}</td>
      <td [class]="ticker.cachedData?.payoutRatio | payoutRatioColor">{{ ticker.cachedData?.payoutRatio | percent }}</td>
      <td><button (click)="onRemoveClick(ticker.symbol)">Remove</button></td>
    </tr>
  </tbody>
</table>
```

- [ ] **Step 5: Write `frontend/src/app/shared/stock-table/stock-table.component.scss`**

```scss
.toolbar { margin-bottom: 0.5rem; display: flex; gap: 0.5rem; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #ddd; text-align: left; }
.sector-header td { font-weight: bold; background: #f0f0f0; }
.green { background-color: #c8f7c5; }
.yellow { background-color: #fff3c4; }
.red { background-color: #f7c5c5; }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w frontend -- --include='**/stock-table.component.spec.ts'`
Expected: PASS, all 4 tests green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/shared/stock-table
git commit -m "feat: add shared StockTableComponent with sector grouping and bulk refresh"
```

---

### Task 15: PortfolioModule

**Files:**
- Create: `frontend/src/app/portfolio/portfolio.module.ts`
- Create: `frontend/src/app/portfolio/portfolio-routing.module.ts`
- Create: `frontend/src/app/portfolio/portfolio.component.ts`
- Create: `frontend/src/app/portfolio/portfolio.component.html`
- Test: `frontend/src/app/portfolio/portfolio.component.spec.ts`

**Interfaces:**
- Consumes: `StockApiService`, `StockTableComponent`.
- Produces: `PortfolioModule` lazy-loaded at `/portfolio` (already referenced in Task 11's routing config).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/app/portfolio/portfolio.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PortfolioComponent } from './portfolio.component';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

const sampleTickers: Ticker[] = [
  { _id: '1', symbol: 'AAPL', companyName: 'Apple', sector: 'Technology', exchange: 'NASDAQ', country: 'US', nativeCurrency: 'USD', lists: ['portfolio'] }
];

describe('PortfolioComponent', () => {
  let fixture: ComponentFixture<PortfolioComponent>;
  let component: PortfolioComponent;
  let apiSpy: jasmine.SpyObj<StockApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('StockApiService', [
      'getPortfolio', 'addToPortfolio', 'removeFromPortfolio', 'refreshOne', 'refreshMany', 'refreshAll'
    ]);
    apiSpy.getPortfolio.and.returnValue(of(sampleTickers));

    TestBed.configureTestingModule({
      declarations: [PortfolioComponent],
      providers: [{ provide: StockApiService, useValue: apiSpy }]
    });
    fixture = TestBed.createComponent(PortfolioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the portfolio list on init', () => {
    expect(apiSpy.getPortfolio).toHaveBeenCalled();
    expect(component.tickers).toEqual(sampleTickers);
  });

  it('addTicker calls addToPortfolio and reloads the list', () => {
    apiSpy.addToPortfolio.and.returnValue(of(sampleTickers[0]));
    component.newSymbol = 'MSFT';
    component.addTicker();
    expect(apiSpy.addToPortfolio).toHaveBeenCalledWith('MSFT');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRemove calls removeFromPortfolio and reloads the list', () => {
    apiSpy.removeFromPortfolio.and.returnValue(of(undefined));
    component.onRemove('AAPL');
    expect(apiSpy.removeFromPortfolio).toHaveBeenCalledWith('AAPL');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRefreshAll calls refreshAll and reloads the list', () => {
    apiSpy.refreshAll.and.returnValue(of(sampleTickers));
    component.onRefreshAll();
    expect(apiSpy.refreshAll).toHaveBeenCalled();
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w frontend -- --include='**/portfolio.component.spec.ts'`
Expected: FAIL — `Cannot find module './portfolio.component'`.

- [ ] **Step 3: Write `frontend/src/app/portfolio/portfolio.component.ts`**

```typescript
import { Component, OnInit } from '@angular/core';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

@Component({
  selector: 'app-portfolio',
  templateUrl: './portfolio.component.html'
})
export class PortfolioComponent implements OnInit {
  tickers: Ticker[] = [];
  newSymbol = '';

  constructor(private api: StockApiService) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.getPortfolio().subscribe(tickers => this.tickers = tickers);
  }

  addTicker(): void {
    if (!this.newSymbol) return;
    this.api.addToPortfolio(this.newSymbol).subscribe(() => {
      this.newSymbol = '';
      this.load();
    });
  }

  onRemove(symbol: string): void {
    this.api.removeFromPortfolio(symbol).subscribe(() => this.load());
  }

  onRefreshSelected(symbols: string[]): void {
    this.api.refreshMany(symbols).subscribe(() => this.load());
  }

  onRefreshAll(): void {
    this.api.refreshAll().subscribe(() => this.load());
  }
}
```

- [ ] **Step 4: Write `frontend/src/app/portfolio/portfolio.component.html`**

```html
<h2>Portfolio</h2>
<div class="add-ticker">
  <input [(ngModel)]="newSymbol" placeholder="e.g. AAPL, RELIANCE.NS, SHOP.TO" />
  <button (click)="addTicker()">Add</button>
</div>
<app-stock-table
  [tickers]="tickers"
  (refreshSelected)="onRefreshSelected($event)"
  (refreshAllEmitter)="onRefreshAll()"
  (remove)="onRemove($event)">
</app-stock-table>
```

- [ ] **Step 5: Write `frontend/src/app/portfolio/portfolio-routing.module.ts`**

```typescript
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PortfolioComponent } from './portfolio.component';

const routes: Routes = [{ path: '', component: PortfolioComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PortfolioRoutingModule { }
```

- [ ] **Step 6: Write `frontend/src/app/portfolio/portfolio.module.ts`**

```typescript
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortfolioRoutingModule } from './portfolio-routing.module';
import { PortfolioComponent } from './portfolio.component';
import { StockTableComponent } from '../shared/stock-table/stock-table.component';
import { MarginOfSafetyColorPipe } from '../shared/pipes/margin-of-safety-color.pipe';
import { PriceToBookColorPipe } from '../shared/pipes/price-to-book-color.pipe';
import { PegColorPipe } from '../shared/pipes/peg-color.pipe';
import { RatioColorPipe } from '../shared/pipes/ratio-color.pipe';
import { PayoutRatioColorPipe } from '../shared/pipes/payout-ratio-color.pipe';

@NgModule({
  declarations: [
    PortfolioComponent, StockTableComponent,
    MarginOfSafetyColorPipe, PriceToBookColorPipe, PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
  ],
  imports: [CommonModule, FormsModule, PortfolioRoutingModule]
})
export class PortfolioModule { }
```

**Note for implementer:** `StockTableComponent` and the five pipes are declared identically in both `PortfolioModule` and `WatchlistModule` (Task 16) rather than in a shared module, because Angular forbids declaring the same component/pipe in two `NgModule`s simultaneously. This duplication is intentional and small (six declarations) — do not extract a `SharedModule` unless a third feature module appears (YAGNI).

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -w frontend -- --include='**/portfolio.component.spec.ts'`
Expected: PASS, all 4 tests green.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/portfolio
git commit -m "feat: add PortfolioModule with add/remove/refresh UI"
```

---

### Task 16: WatchlistModule

**Files:**
- Create: `frontend/src/app/watchlist/watchlist.module.ts`
- Create: `frontend/src/app/watchlist/watchlist-routing.module.ts`
- Create: `frontend/src/app/watchlist/watchlist.component.ts`
- Create: `frontend/src/app/watchlist/watchlist.component.html`
- Test: `frontend/src/app/watchlist/watchlist.component.spec.ts`

**Interfaces:**
- Same shape as Task 15, mirrored for the `watchlist` list type.

- [ ] **Step 1: Write the failing test** (identical structure to Task 15's, substituting Watchlist symbols)

```typescript
// frontend/src/app/watchlist/watchlist.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { WatchlistComponent } from './watchlist.component';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

const sampleTickers: Ticker[] = [
  { _id: '1', symbol: 'RELIANCE.NS', companyName: 'Reliance Industries', sector: 'Energy', exchange: 'NSE', country: 'IN', nativeCurrency: 'INR', lists: ['watchlist'] }
];

describe('WatchlistComponent', () => {
  let fixture: ComponentFixture<WatchlistComponent>;
  let component: WatchlistComponent;
  let apiSpy: jasmine.SpyObj<StockApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('StockApiService', [
      'getWatchlist', 'addToWatchlist', 'removeFromWatchlist', 'refreshOne', 'refreshMany', 'refreshAll'
    ]);
    apiSpy.getWatchlist.and.returnValue(of(sampleTickers));

    TestBed.configureTestingModule({
      declarations: [WatchlistComponent],
      providers: [{ provide: StockApiService, useValue: apiSpy }]
    });
    fixture = TestBed.createComponent(WatchlistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the watchlist on init', () => {
    expect(apiSpy.getWatchlist).toHaveBeenCalled();
    expect(component.tickers).toEqual(sampleTickers);
  });

  it('addTicker calls addToWatchlist and reloads the list', () => {
    apiSpy.addToWatchlist.and.returnValue(of(sampleTickers[0]));
    component.newSymbol = 'SHOP.TO';
    component.addTicker();
    expect(apiSpy.addToWatchlist).toHaveBeenCalledWith('SHOP.TO');
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });

  it('onRemove calls removeFromWatchlist and reloads the list', () => {
    apiSpy.removeFromWatchlist.and.returnValue(of(undefined));
    component.onRemove('RELIANCE.NS');
    expect(apiSpy.removeFromWatchlist).toHaveBeenCalledWith('RELIANCE.NS');
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });

  it('onRefreshAll calls refreshAll and reloads the list', () => {
    apiSpy.refreshAll.and.returnValue(of(sampleTickers));
    component.onRefreshAll();
    expect(apiSpy.refreshAll).toHaveBeenCalled();
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w frontend -- --include='**/watchlist.component.spec.ts'`
Expected: FAIL — `Cannot find module './watchlist.component'`.

- [ ] **Step 3: Write `frontend/src/app/watchlist/watchlist.component.ts`**

```typescript
import { Component, OnInit } from '@angular/core';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

@Component({
  selector: 'app-watchlist',
  templateUrl: './watchlist.component.html'
})
export class WatchlistComponent implements OnInit {
  tickers: Ticker[] = [];
  newSymbol = '';

  constructor(private api: StockApiService) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.getWatchlist().subscribe(tickers => this.tickers = tickers);
  }

  addTicker(): void {
    if (!this.newSymbol) return;
    this.api.addToWatchlist(this.newSymbol).subscribe(() => {
      this.newSymbol = '';
      this.load();
    });
  }

  onRemove(symbol: string): void {
    this.api.removeFromWatchlist(symbol).subscribe(() => this.load());
  }

  onRefreshSelected(symbols: string[]): void {
    this.api.refreshMany(symbols).subscribe(() => this.load());
  }

  onRefreshAll(): void {
    this.api.refreshAll().subscribe(() => this.load());
  }
}
```

- [ ] **Step 4: Write `frontend/src/app/watchlist/watchlist.component.html`**

```html
<h2>Watchlist</h2>
<div class="add-ticker">
  <input [(ngModel)]="newSymbol" placeholder="e.g. AAPL, RELIANCE.NS, SHOP.TO" />
  <button (click)="addTicker()">Add</button>
</div>
<app-stock-table
  [tickers]="tickers"
  (refreshSelected)="onRefreshSelected($event)"
  (refreshAllEmitter)="onRefreshAll()"
  (remove)="onRemove($event)">
</app-stock-table>
```

- [ ] **Step 5: Write `frontend/src/app/watchlist/watchlist-routing.module.ts`**

```typescript
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { WatchlistComponent } from './watchlist.component';

const routes: Routes = [{ path: '', component: WatchlistComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class WatchlistRoutingModule { }
```

- [ ] **Step 6: Write `frontend/src/app/watchlist/watchlist.module.ts`**

```typescript
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WatchlistRoutingModule } from './watchlist-routing.module';
import { WatchlistComponent } from './watchlist.component';
import { StockTableComponent } from '../shared/stock-table/stock-table.component';
import { MarginOfSafetyColorPipe } from '../shared/pipes/margin-of-safety-color.pipe';
import { PriceToBookColorPipe } from '../shared/pipes/price-to-book-color.pipe';
import { PegColorPipe } from '../shared/pipes/peg-color.pipe';
import { RatioColorPipe } from '../shared/pipes/ratio-color.pipe';
import { PayoutRatioColorPipe } from '../shared/pipes/payout-ratio-color.pipe';

@NgModule({
  declarations: [
    WatchlistComponent, StockTableComponent,
    MarginOfSafetyColorPipe, PriceToBookColorPipe, PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
  ],
  imports: [CommonModule, FormsModule, WatchlistRoutingModule]
})
export class WatchlistModule { }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -w frontend -- --include='**/watchlist.component.spec.ts'`
Expected: PASS, all 4 tests green.

- [ ] **Step 8: Run the full frontend test suite**

Run: `npm test -w frontend`
Expected: all specs pass (stock-api.service, 5 pipe specs, stock-table.component, portfolio.component, watchlist.component).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/watchlist
git commit -m "feat: add WatchlistModule with add/remove/refresh UI"
```

---

### Task 17: Wire up single start command and end-to-end manual verification

**Files:**
- Modify: `frontend/proxy.conf.json` (create)
- Modify: `frontend/angular.json` (add proxy config to serve target)

**Interfaces:**
- Produces: `npm start` from repo root launches both servers; frontend's relative `/api/...` calls (from `StockApiService`, Task 12) are proxied to the backend on `:3000` during `ng serve`.

- [ ] **Step 1: Create `frontend/proxy.conf.json`**

```json
{
  "/api": {
    "target": "http://localhost:3000",
    "secure": false
  }
}
```

- [ ] **Step 2: Wire the proxy into `frontend/angular.json`**

Edit the `serve` target's `options` (under `projects.frontend.architect.serve.options`) to add:

```json
"proxyConfig": "proxy.conf.json"
```

- [ ] **Step 3: Ensure local MongoDB is running, then start everything**

```bash
cp backend/.env.example backend/.env   # if not already done in Task 10
npm start
```
Expected: `concurrently` prints interleaved `[backend]`/`[frontend]` logs; backend listens on `:3000`, `ng serve` compiles and serves on `:4200`.

- [ ] **Step 4: Manual end-to-end verification in browser**

Open `http://localhost:4200`. Confirm:
- Portfolio and Watchlist nav links both load without console errors.
- Adding a real ticker symbol (e.g. `AAPL`) via the "Add" input causes a new row to appear, grouped under its sector, with colored cells for P/B, PEG, current/quick ratio, payout ratio, and price-vs-fair-value.
- Checking a row's checkbox and clicking "Refresh Selected" re-fetches just that row (network tab shows `POST /api/tickers/refresh`).
- "Refresh All" re-fetches every row (`POST /api/tickers/refresh-all`).
- Removing a row via its "Remove" button deletes it from the table.
- Adding a non-US symbol (e.g. `SHOP.TO`) shows a price normalized to USD alongside working ratios.

Stop both servers with Ctrl+C when done.

- [ ] **Step 5: Commit**

```bash
git add frontend/proxy.conf.json frontend/angular.json
git commit -m "chore: wire dev-server proxy so frontend reaches backend API"
```

---

## Post-Plan Notes

- `tickerHistory` data is captured but not yet surfaced in the UI — spec explicitly marks trend visualization as out of scope for this iteration.
- The `EXCHANGE_COUNTRY_MAP` in `yahoo-finance.provider.ts` (Task 6) covers the four target markets (US, Canada, India, EU-representative exchanges); extend it if you track tickers on additional exchanges.
- If `yahoo-finance2`'s actual response shape differs from what Task 6 assumes, adjust only the mapping inside `YahooFinanceProvider` — the `RawFinancials`/`RawQuote` contract it must produce is fixed by Task 2 and consumed unchanged by Tasks 3, 5, and 8.
