# Black Theme UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Angular frontend (Portfolio and Watchlist pages) into a polished dark/black theme with a sidebar layout, collapsible sector groups, sticky table columns, and per-row refresh — replacing the current unstyled UI and infeasible bulk-refresh buttons.

**Architecture:** Hand-rolled SCSS with CSS custom properties (design tokens) defined once in `frontend/src/styles.scss`, consumed globally and by component-level stylesheets. No new dependencies. Component logic changes are limited to `StockTableComponent` (drop selection/bulk-refresh, add sector-collapse state and a `refreshOne` output) and `PortfolioComponent`/`WatchlistComponent` (add a `refreshOne` handler and an `isLoading` flag).

**Tech Stack:** Angular 22 (non-standalone/NgModule components), SCSS, Vitest via `@angular/build:unit-test` (`npm test`), Node 24 (use `nvm use` from repo root before any `npm` command).

## Global Constraints

- Node version pinned in `.nvmrc` (24) — run `nvm use` from the repo root before any `npm`/`ng` command in this plan.
- No new runtime dependencies (no UI component library) — spec section "Non-goals".
- All theme values (colors, font) defined as CSS custom properties in one place (`frontend/src/styles.scss`) so they can be changed later without touching component files — spec section "Design tokens".
- Preserve existing color-pipe logic (`marginOfSafetyColor`, `priceToBookColor`, `pegColor`, `ratioColor`, `payoutRatioColor`) unchanged — only the CSS backing `.green`/`.yellow`/`.red` classes changes — spec section "Semantic cells".
- No backend/API changes beyond calling the existing `StockApiService.refreshOne(symbol)` method — spec section "Non-goals".
- No changes to DCF calculation logic, sector grouping logic, or routing structure — spec section "Non-goals".
- Run `npm test` (from `frontend/`, after `nvm use`) after every task that touches `.ts` files; all tests must pass before moving to the next task.

---

## File Structure

- **Modify `frontend/src/styles.scss`** — currently empty. Becomes the single home for: `:root` design tokens (Task 1), and shared global utility classes for page header/add-ticker form/error banner/loading/empty states reused identically by Portfolio and Watchlist (Task 2), plus a base reset (`box-sizing`, body background/color, focus-visible ring).
- **Modify `frontend/src/app/app.html`, `frontend/src/app/app.scss`** — sidebar app shell (Task 3), replacing the current bare `<nav>`.
- **Modify `frontend/src/app/shared/stock-table/stock-table.component.ts`, `.spec.ts`** — remove selection/bulk-refresh, add sector-collapse state and `refreshOne` output (Task 4).
- **Modify `frontend/src/app/shared/stock-table/stock-table.component.html`, `.scss`** — collapsible sector rows, sticky columns, per-row action buttons, dark table styling (Task 5).
- **Modify `frontend/src/app/portfolio/portfolio.component.ts`, `.spec.ts`** — `onRefreshOne`, `isLoading` (Task 6).
- **Modify `frontend/src/app/portfolio/portfolio.component.html`** — use shared global classes, loading/empty states, wire `refreshOne` (Task 7).
- **Modify `frontend/src/app/watchlist/watchlist.component.ts`, `.spec.ts`** — mirrors Task 6 (Task 8).
- **Modify `frontend/src/app/watchlist/watchlist.component.html`** — mirrors Task 7 (Task 9).
- **Task 10** — no file changes; full-suite test run + manual browser verification checklist from the spec.

---

### Task 1: Global design tokens & base reset

**Files:**
- Modify: `frontend/src/styles.scss`

**Interfaces:**
- Produces: CSS custom properties consumed by every later task —
  `--bg-base`, `--bg-surface`, `--bg-surface-raised`, `--border-subtle`,
  `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`,
  `--accent-hover`, `--signal-green`, `--signal-green-bg`,
  `--signal-yellow`, `--signal-yellow-bg`, `--signal-red`,
  `--signal-red-bg`, `--font-sans`.

- [ ] **Step 1: Write the token block and base reset**

Replace the entire contents of `frontend/src/styles.scss` with:

```scss
:root {
  // Base palette
  --bg-base: #0a0a0a;
  --bg-surface: #141414;
  --bg-surface-raised: #1c1c1c;
  --border-subtle: #2a2a2a;
  --text-primary: #e8e8e8;
  --text-secondary: #9a9a9a;
  --text-muted: #666666;

  // Accent (interactive elements)
  --accent: #3ecf8e;
  --accent-hover: #34b87c;

  // Semantic signal colors (deliberately distinct hue from --accent)
  --signal-green: #4caf7d;
  --signal-green-bg: rgba(76, 175, 125, 0.15);
  --signal-yellow: #d4b13f;
  --signal-yellow-bg: rgba(212, 177, 63, 0.15);
  --signal-red: #d4574f;
  --signal-red-bg: rgba(212, 87, 79, 0.15);

  // Typography
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

* {
  box-sizing: border-box;
}

html, body {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.4;
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm run build`
Expected: build succeeds with no errors (styling-only change, no test impact).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.scss
git commit -m "style: add dark theme design tokens and base reset"
```

---

### Task 2: Shared global utility classes (page header, form, banners, states)

**Files:**
- Modify: `frontend/src/styles.scss`

**Interfaces:**
- Consumes: tokens from Task 1 (`--bg-surface-raised`, `--border-subtle`,
  `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`,
  `--accent-hover`, `--signal-red`, `--signal-red-bg`).
- Produces: global CSS classes consumed by Task 7 (Portfolio template) and
  Task 9 (Watchlist template) — `.page-header`, `.page-header h2`,
  `.add-ticker-form`, `.add-ticker-form input`, `.add-ticker-form button`,
  `.error-banner`, `.empty-state`, `.loading-state`.

Portfolio and Watchlist are near-identical pages (same header/form/error/
empty/loading layout), so these are global classes rather than duplicated
per-component styles — avoids two copies of the same CSS.

- [ ] **Step 1: Append the shared classes to `styles.scss`**

Add to the end of `frontend/src/styles.scss`:

```scss
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
}

.add-ticker-form {
  display: flex;
  gap: 0.5rem;

  input {
    background: var(--bg-surface-raised);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    color: var(--text-primary);
    padding: 0.45rem 0.7rem;
    font-size: 14px;
    min-width: 220px;

    &::placeholder {
      color: var(--text-muted);
    }

    &:focus-visible {
      border-color: var(--accent);
    }

    &:disabled {
      color: var(--text-muted);
      cursor: not-allowed;
    }
  }

  button {
    background: var(--accent);
    border: none;
    border-radius: 6px;
    color: #06120d;
    font-weight: 600;
    padding: 0.45rem 1rem;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--accent-hover);
    }

    &:disabled {
      background: var(--bg-surface-raised);
      color: var(--text-muted);
      cursor: not-allowed;
    }
  }
}

.error-banner {
  background: var(--signal-red-bg);
  border: 1px solid var(--signal-red);
  border-radius: 6px;
  color: var(--signal-red);
  padding: 0.6rem 0.9rem;
  margin-bottom: 1rem;
  font-size: 14px;
}

.empty-state, .loading-state {
  color: var(--text-secondary);
  text-align: center;
  padding: 3rem 1rem;
  font-size: 14px;
}
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.scss
git commit -m "style: add shared page header, form, and state classes"
```

---

### Task 3: Sidebar app shell

**Files:**
- Modify: `frontend/src/app/app.html`
- Modify: `frontend/src/app/app.scss`

**Interfaces:**
- Consumes: tokens from Task 1 (`--bg-surface`, `--accent`,
  `--bg-surface-raised`, `--text-primary`, `--text-secondary`,
  `--border-subtle`).
- No TypeScript changes — `routerLinkActive` already provides the active
  route class used by the CSS below.

- [ ] **Step 1: Replace `app.html`**

```html
<div class="app-shell">
  <aside class="sidebar">
    <div class="sidebar-brand">Stock Watch</div>
    <nav class="sidebar-nav">
      <a routerLink="/portfolio" routerLinkActive="active">Portfolio</a>
      <a routerLink="/watchlist" routerLinkActive="active">Watchlist</a>
    </nav>
  </aside>
  <main class="app-content">
    <router-outlet></router-outlet>
  </main>
</div>
```

- [ ] **Step 2: Write `app.scss`**

```scss
.app-shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
}

.sidebar-brand {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-primary);
  padding: 0 1.25rem 1rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;

  a {
    color: var(--text-secondary);
    text-decoration: none;
    padding: 0.6rem 1.25rem;
    border-left: 3px solid transparent;
    font-size: 14px;

    &:hover {
      color: var(--text-primary);
      background: var(--bg-surface-raised);
    }

    &.active {
      color: var(--accent);
      border-left-color: var(--accent);
      background: var(--bg-surface-raised);
    }
  }
}

.app-content {
  flex: 1;
  min-width: 0;
  padding: 1.5rem;
}

@media (max-width: 900px) {
  .sidebar {
    width: 64px;
  }

  .sidebar-brand {
    font-size: 0;

    &::first-letter {
      font-size: 15px;
    }
  }

  .sidebar-nav a {
    font-size: 0;
    text-align: center;
    padding: 0.6rem 0;

    &::first-letter {
      font-size: 14px;
    }
  }
}
```

- [ ] **Step 3: Verify the app still builds**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app.html frontend/src/app/app.scss
git commit -m "feat: add sidebar app shell"
```

---

### Task 4: Stock table component logic — drop bulk refresh, add collapse state and per-row refresh output

**Files:**
- Modify: `frontend/src/app/shared/stock-table/stock-table.component.ts`
- Modify: `frontend/src/app/shared/stock-table/stock-table.component.spec.ts`

**Interfaces:**
- Consumes: `Ticker` from `../models/ticker.model` (unchanged).
- Produces (consumed by Task 5's template and by Task 7/9's parent
  templates):
  - `@Output() refreshOne = new EventEmitter<string>()`
  - `@Output() remove = new EventEmitter<string>()` (unchanged)
  - `collapsedSectors: Set<string>`
  - `toggleSector(sector: string): void`
  - `expandAll(): void`
  - `collapseAll(): void`
  - `isCollapsed(sector: string): boolean`
  - `onRefreshClick(symbol: string): void`
  - `onRemoveClick(symbol: string): void` (unchanged)
  - `groupedBySector(): SectorGroup[]` (unchanged)
  - Removed: `selectedSymbols`, `toggleRow`, `toggleSelectAll`,
    `onRefreshSelectedClick`, `onRefreshAllClick`, `refreshSelected` output,
    `refreshAllEmitter` output.

- [ ] **Step 1: Replace the test file with tests for the new behavior**

Replace the full contents of `frontend/src/app/shared/stock-table/stock-table.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
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
      imports: [CommonModule],
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

  it('sectors are expanded by default', () => {
    expect(component.isCollapsed('Energy')).toBe(false);
    expect(component.isCollapsed('Technology')).toBe(false);
  });

  it('toggleSector collapses and re-expands a single sector', () => {
    component.toggleSector('Technology');
    expect(component.isCollapsed('Technology')).toBe(true);
    expect(component.isCollapsed('Energy')).toBe(false);

    component.toggleSector('Technology');
    expect(component.isCollapsed('Technology')).toBe(false);
  });

  it('collapseAll collapses every sector present in the current tickers', () => {
    component.collapseAll();
    expect(component.isCollapsed('Energy')).toBe(true);
    expect(component.isCollapsed('Technology')).toBe(true);
  });

  it('expandAll clears all collapsed sectors', () => {
    component.collapseAll();
    component.expandAll();
    expect(component.isCollapsed('Energy')).toBe(false);
    expect(component.isCollapsed('Technology')).toBe(false);
  });

  it('onRefreshClick emits the given symbol on refreshOne', () => {
    const emitted: string[] = [];
    component.refreshOne.subscribe((symbol: string) => emitted.push(symbol));
    component.onRefreshClick('AAA');
    expect(emitted).toEqual(['AAA']);
  });

  it('onRemoveClick emits the given symbol on remove', () => {
    const emitted: string[] = [];
    component.remove.subscribe((symbol: string) => emitted.push(symbol));
    component.onRemoveClick('AAA');
    expect(emitted).toEqual(['AAA']);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: FAIL — `isCollapsed`, `toggleSector`, `collapseAll`, `expandAll`,
`onRefreshClick`, `refreshOne` don't exist yet on `StockTableComponent`.

- [ ] **Step 3: Rewrite `stock-table.component.ts`**

Replace the full contents of `frontend/src/app/shared/stock-table/stock-table.component.ts`:

```typescript
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Ticker } from '../models/ticker.model';

interface SectorGroup {
  sector: string;
  tickers: Ticker[];
}

@Component({
  selector: 'app-stock-table',
  templateUrl: './stock-table.component.html',
  styleUrls: ['./stock-table.component.scss'],
  standalone: false
})
export class StockTableComponent implements OnChanges {
  @Input() tickers: Ticker[] = [];
  @Output() refreshOne = new EventEmitter<string>();
  @Output() remove = new EventEmitter<string>();

  collapsedSectors = new Set<string>();

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['tickers']) return;
    const currentSectors = new Set(this.tickers.map(t => t.sector));
    for (const sector of Array.from(this.collapsedSectors)) {
      if (!currentSectors.has(sector)) {
        this.collapsedSectors.delete(sector);
      }
    }
  }

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

  isCollapsed(sector: string): boolean {
    return this.collapsedSectors.has(sector);
  }

  toggleSector(sector: string): void {
    if (this.collapsedSectors.has(sector)) {
      this.collapsedSectors.delete(sector);
    } else {
      this.collapsedSectors.add(sector);
    }
  }

  collapseAll(): void {
    this.collapsedSectors = new Set(this.tickers.map(t => t.sector));
  }

  expandAll(): void {
    this.collapsedSectors = new Set();
  }

  onRefreshClick(symbol: string): void {
    this.refreshOne.emit(symbol);
  }

  onRemoveClick(symbol: string): void {
    this.remove.emit(symbol);
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: PASS — all `StockTableComponent` tests green. Note: the
component's `.html` template still references the old
`onRefreshSelectedClick`/`onRefreshAllClick`/`toggleRow`/`toggleSelectAll`
methods at this point and will show template compile errors — that's
expected and gets fixed in Task 5. If the template errors block the test
run itself, proceed to Task 5 immediately without a separate commit for
this step (see note below).

- [ ] **Step 5: Commit**

If `npm test` passed cleanly: commit now.

```bash
git add frontend/src/app/shared/stock-table/stock-table.component.ts frontend/src/app/shared/stock-table/stock-table.component.spec.ts
git commit -m "refactor: replace bulk refresh/selection with sector collapse and per-row refresh"
```

If the template compile error blocks `npm test` from running at all,
skip this commit and continue directly into Task 5 — commit both
together at the end of Task 5 instead.

---

### Task 5: Stock table template & styles — collapsible sectors, sticky columns, row actions, dark styling

**Files:**
- Modify: `frontend/src/app/shared/stock-table/stock-table.component.html`
- Modify: `frontend/src/app/shared/stock-table/stock-table.component.scss`

**Interfaces:**
- Consumes: `collapsedSectors`, `isCollapsed(sector)`, `toggleSector(sector)`,
  `expandAll()`, `collapseAll()`, `onRefreshClick(symbol)`,
  `onRemoveClick(symbol)`, `groupedBySector()` from Task 4. Tokens from
  Task 1.

- [ ] **Step 1: Replace `stock-table.component.html`**

```html
<div class="table-toolbar">
  <button type="button" class="text-btn" (click)="expandAll()">Expand all</button>
  <span class="toolbar-sep">·</span>
  <button type="button" class="text-btn" (click)="collapseAll()">Collapse all</button>
</div>

<div class="table-scroll">
  <table>
    <thead>
      <tr>
        <th class="sticky-col sticky-col-1">Ticker</th>
        <th class="sticky-col sticky-col-2">Company</th>
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
      <tr class="sector-header" (click)="toggleSector(group.sector)">
        <td colspan="15">
          <span class="chevron">{{ isCollapsed(group.sector) ? '▸' : '▾' }}</span>
          {{ group.sector }}
          <span class="sector-count">({{ group.tickers.length }})</span>
        </td>
      </tr>
      <tr *ngFor="let ticker of group.tickers" [hidden]="isCollapsed(group.sector)">
        <td class="sticky-col sticky-col-1">{{ ticker.symbol }}</td>
        <td class="sticky-col sticky-col-2">{{ ticker.companyName }}</td>
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
        <td class="row-actions">
          <button type="button" class="icon-btn refresh-btn" title="Refresh" (click)="onRefreshClick(ticker.symbol)">↻</button>
          <button type="button" class="icon-btn remove-btn" title="Remove" (click)="onRemoveClick(ticker.symbol)">×</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: Replace `stock-table.component.scss`**

```scss
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
  font-size: 13px;
}

.toolbar-sep {
  color: var(--border-subtle);
}

.text-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.2rem 0.3rem;

  &:hover {
    color: var(--accent);
  }
}

.table-scroll {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: var(--bg-surface);
  font-size: 13px;
}

th, td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  white-space: nowrap;
}

th {
  color: var(--text-secondary);
  font-weight: 600;
  background: var(--bg-surface);
}

.sticky-col {
  position: sticky;
  background: var(--bg-surface);
}

.sticky-col-1 {
  left: 0;
  min-width: 80px;
}

.sticky-col-2 {
  left: 80px;
  min-width: 160px;
  border-right: 1px solid var(--border-subtle);
}

.sector-header {
  cursor: pointer;

  td {
    font-weight: 600;
    background: var(--bg-surface-raised);
    color: var(--text-primary);
  }

  &:hover td {
    background: var(--border-subtle);
  }
}

.chevron {
  display: inline-block;
  width: 1em;
  color: var(--text-secondary);
}

.sector-count {
  color: var(--text-muted);
  font-weight: 400;
}

tbody tr:not(.sector-header):hover td {
  background: var(--bg-surface-raised);
}

.row-actions {
  display: flex;
  gap: 0.3rem;
  white-space: nowrap;
}

.icon-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;

  &:hover {
    background: var(--bg-surface-raised);
  }
}

.refresh-btn:hover {
  color: var(--accent);
}

.remove-btn:hover {
  color: var(--signal-red);
}

.green {
  background-color: var(--signal-green-bg);
  color: var(--signal-green);
}

.yellow {
  background-color: var(--signal-yellow-bg);
  color: var(--signal-yellow);
}

.red {
  background-color: var(--signal-red-bg);
  color: var(--signal-red);
}
```

- [ ] **Step 3: Run the full test suite**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: PASS — all tests green, including the `StockTableComponent`
tests from Task 4 (this confirms the template compiles cleanly against
the new component).

- [ ] **Step 4: Verify the app builds**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/stock-table/stock-table.component.ts frontend/src/app/shared/stock-table/stock-table.component.spec.ts frontend/src/app/shared/stock-table/stock-table.component.html frontend/src/app/shared/stock-table/stock-table.component.scss
git commit -m "feat: restyle stock table with collapsible sectors, sticky columns, and per-row refresh"
```

(This single commit covers Task 4 and Task 5's files if Task 4's commit
was skipped due to the template compile-error note above.)

---

### Task 6: Portfolio component logic — per-row refresh and loading state

**Files:**
- Modify: `frontend/src/app/portfolio/portfolio.component.ts`
- Modify: `frontend/src/app/portfolio/portfolio.component.spec.ts`

**Interfaces:**
- Consumes: `StockApiService.refreshOne(symbol: string): Observable<Ticker>`
  (already exists, `frontend/src/app/shared/services/stock-api.service.ts:41-43`).
- Produces (consumed by Task 7's template):
  - `isLoading: boolean`
  - `onRefreshOne(symbol: string): void`
  - Removed: `onRefreshSelected(symbols: string[])`, `onRefreshAll()`.

- [ ] **Step 1: Update the spec file**

In `frontend/src/app/portfolio/portfolio.component.spec.ts`, replace the
`onRefreshAll` test and add loading/refreshOne tests. Replace the full
file contents:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { PortfolioComponent } from './portfolio.component';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

const sampleTickers: Ticker[] = [
  { _id: '1', symbol: 'AAPL', companyName: 'Apple', sector: 'Technology', exchange: 'NASDAQ', country: 'US', nativeCurrency: 'USD', lists: ['portfolio'] }
];

describe('PortfolioComponent', () => {
  let fixture: ComponentFixture<PortfolioComponent>;
  let component: PortfolioComponent;
  let apiSpy: {
    getPortfolio: ReturnType<typeof vi.fn>;
    addToPortfolio: ReturnType<typeof vi.fn>;
    removeFromPortfolio: ReturnType<typeof vi.fn>;
    refreshOne: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    apiSpy = {
      getPortfolio: vi.fn(),
      addToPortfolio: vi.fn(),
      removeFromPortfolio: vi.fn(),
      refreshOne: vi.fn(),
    };
    apiSpy.getPortfolio.mockReturnValue(of(sampleTickers));

    TestBed.configureTestingModule({
      declarations: [PortfolioComponent],
      providers: [{ provide: StockApiService, useValue: apiSpy }],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(PortfolioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the portfolio list on init', () => {
    expect(apiSpy.getPortfolio).toHaveBeenCalled();
    expect(component.tickers).toEqual(sampleTickers);
  });

  it('isLoading is false once the initial load resolves', () => {
    expect(component.isLoading).toBe(false);
  });

  it('addTicker calls addToPortfolio and reloads the list', () => {
    apiSpy.addToPortfolio.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = 'MSFT';
    component.addTicker();
    expect(apiSpy.addToPortfolio).toHaveBeenCalledWith('MSFT');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRemove calls removeFromPortfolio and reloads the list', () => {
    apiSpy.removeFromPortfolio.mockReturnValue(of(undefined));
    component.onRemove('AAPL');
    expect(apiSpy.removeFromPortfolio).toHaveBeenCalledWith('AAPL');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRefreshOne calls refreshOne with the given symbol and reloads the list', () => {
    apiSpy.refreshOne.mockReturnValue(of(sampleTickers[0]));
    component.onRefreshOne('AAPL');
    expect(apiSpy.refreshOne).toHaveBeenCalledWith('AAPL');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRefreshOne sets errorMessage when the refresh call fails', () => {
    apiSpy.refreshOne.mockReturnValue(throwError(() => new Error('rate limited')));
    component.onRefreshOne('AAPL');
    expect(component.errorMessage).toContain('AAPL');
  });

  it('addTicker trims whitespace and uppercases the symbol before calling the API', () => {
    apiSpy.addToPortfolio.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = '  shop.to  ';
    component.addTicker();
    expect(apiSpy.addToPortfolio).toHaveBeenCalledWith('SHOP.TO');
  });

  it('sets errorMessage with a distinct message on a 404 (symbol not found)', () => {
    apiSpy.addToPortfolio.mockReturnValue(throwError(() => ({ status: 404 })));
    component.newSymbol = 'ZZZZINVALID123';
    component.addTicker();
    expect(component.errorMessage).toContain('ZZZZINVALID123');
  });

  it('sets errorMessage on a generic addToPortfolio failure instead of failing silently', () => {
    apiSpy.addToPortfolio.mockReturnValue(throwError(() => ({ status: 500 })));
    component.newSymbol = 'AAPL';
    component.addTicker();
    expect(component.errorMessage).toBeTruthy();
  });

  it('sets errorMessage when the initial portfolio load fails', () => {
    apiSpy.getPortfolio.mockReturnValue(throwError(() => new Error('network down')));
    component['load']();
    expect(component.errorMessage).toBeTruthy();
  });

  it('clears errorMessage on a subsequent successful add', () => {
    component.errorMessage = 'stale error';
    apiSpy.addToPortfolio.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = 'MSFT';
    component.addTicker();
    expect(component.errorMessage).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to confirm the new ones fail**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: FAIL — `onRefreshOne` and `isLoading` don't exist yet on
`PortfolioComponent`.

- [ ] **Step 3: Rewrite `portfolio.component.ts`**

Replace the full contents of `frontend/src/app/portfolio/portfolio.component.ts`:

```typescript
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

@Component({
  selector: 'app-portfolio',
  templateUrl: './portfolio.component.html',
  standalone: false
})
export class PortfolioComponent implements OnInit {
  tickers: Ticker[] = [];
  newSymbol = '';
  errorMessage: string | null = null;
  isAdding = false;
  isLoading = false;

  constructor(private api: StockApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading = true;
    this.api.getPortfolio().subscribe({
      next: tickers => {
        this.tickers = tickers;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Could not load your portfolio. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  addTicker(): void {
    const symbol = this.newSymbol.trim().toUpperCase();
    if (!symbol) return;
    this.errorMessage = null;
    this.isAdding = true;
    this.api.addToPortfolio(symbol).subscribe({
      next: () => {
        this.newSymbol = '';
        this.isAdding = false;
        this.load();
      },
      error: err => {
        this.isAdding = false;
        this.errorMessage = this.describeAddError(symbol, err);
        this.cdr.detectChanges();
      }
    });
  }

  onRemove(symbol: string): void {
    this.errorMessage = null;
    this.api.removeFromPortfolio(symbol).subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = `Could not remove ${symbol}. Please try again.`;
        this.cdr.detectChanges();
      }
    });
  }

  onRefreshOne(symbol: string): void {
    this.errorMessage = null;
    this.api.refreshOne(symbol).subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = `Could not refresh ${symbol}. Please try again.`;
        this.cdr.detectChanges();
      }
    });
  }

  private describeAddError(symbol: string, err: any): string {
    if (err?.name === 'TimeoutError') return `Adding ${symbol} is taking too long (Yahoo Finance may be rate-limiting). Please wait a bit and try again.`;
    if (err?.status === 404) return `Could not find symbol ${symbol}.`;
    return `Could not add ${symbol}. Please try again.`;
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: PASS — all `PortfolioComponent` tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/portfolio/portfolio.component.ts frontend/src/app/portfolio/portfolio.component.spec.ts
git commit -m "refactor: replace bulk refresh with per-ticker refresh and loading state in PortfolioComponent"
```

---

### Task 7: Portfolio template — dark styling, loading/empty states, wire refresh

**Files:**
- Modify: `frontend/src/app/portfolio/portfolio.component.html`

**Interfaces:**
- Consumes: `tickers`, `newSymbol`, `errorMessage`, `isAdding`, `isLoading`,
  `addTicker()`, `onRemove(symbol)`, `onRefreshOne(symbol)` from Task 6.
  Global classes `.page-header`, `.add-ticker-form`, `.error-banner`,
  `.empty-state`, `.loading-state` from Task 2. `app-stock-table`'s
  `(refreshOne)` and `(remove)` outputs from Task 4.

- [ ] **Step 1: Replace `portfolio.component.html`**

```html
<div class="page-header">
  <h2>Portfolio</h2>
  <div class="add-ticker-form">
    <input [(ngModel)]="newSymbol" placeholder="e.g. AAPL, RELIANCE.NS, SHOP.TO" [disabled]="isAdding" />
    <button (click)="addTicker()" [disabled]="isAdding">{{ isAdding ? 'Adding…' : 'Add' }}</button>
  </div>
</div>

<div class="error-banner" *ngIf="errorMessage">{{ errorMessage }}</div>

<div class="loading-state" *ngIf="isLoading">Loading…</div>
<div class="empty-state" *ngIf="!isLoading && tickers.length === 0">No tickers yet — add one above.</div>

<app-stock-table
  *ngIf="!isLoading && tickers.length > 0"
  [tickers]="tickers"
  (refreshOne)="onRefreshOne($event)"
  (remove)="onRemove($event)">
</app-stock-table>
```

- [ ] **Step 2: Run the full test suite**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: PASS — all tests green (template-only change, but confirms
`PortfolioComponent` still compiles with the template referencing
`onRefreshOne`/`isLoading`).

- [ ] **Step 3: Verify the app builds**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/portfolio/portfolio.component.html
git commit -m "feat: restyle portfolio page with loading/empty states and per-row refresh"
```

---

### Task 8: Watchlist component logic — per-row refresh and loading state

**Files:**
- Modify: `frontend/src/app/watchlist/watchlist.component.ts`
- Modify: `frontend/src/app/watchlist/watchlist.component.spec.ts`

**Interfaces:**
- Consumes: `StockApiService.refreshOne(symbol: string): Observable<Ticker>`.
- Produces (consumed by Task 9's template): `isLoading: boolean`,
  `onRefreshOne(symbol: string): void`. Removed:
  `onRefreshSelected(symbols)`, `onRefreshAll()`.

This mirrors Task 6 exactly, applied to `WatchlistComponent`.

- [ ] **Step 1: Update the spec file**

Replace the full contents of `frontend/src/app/watchlist/watchlist.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { WatchlistComponent } from './watchlist.component';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

const sampleTickers: Ticker[] = [
  { _id: '1', symbol: 'RELIANCE.NS', companyName: 'Reliance Industries', sector: 'Energy', exchange: 'NSE', country: 'IN', nativeCurrency: 'INR', lists: ['watchlist'] }
];

describe('WatchlistComponent', () => {
  let fixture: ComponentFixture<WatchlistComponent>;
  let component: WatchlistComponent;
  let apiSpy: {
    getWatchlist: ReturnType<typeof vi.fn>;
    addToWatchlist: ReturnType<typeof vi.fn>;
    removeFromWatchlist: ReturnType<typeof vi.fn>;
    refreshOne: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    apiSpy = {
      getWatchlist: vi.fn(),
      addToWatchlist: vi.fn(),
      removeFromWatchlist: vi.fn(),
      refreshOne: vi.fn(),
    };
    apiSpy.getWatchlist.mockReturnValue(of(sampleTickers));

    TestBed.configureTestingModule({
      declarations: [WatchlistComponent],
      providers: [{ provide: StockApiService, useValue: apiSpy }],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(WatchlistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the watchlist on init', () => {
    expect(apiSpy.getWatchlist).toHaveBeenCalled();
    expect(component.tickers).toEqual(sampleTickers);
  });

  it('isLoading is false once the initial load resolves', () => {
    expect(component.isLoading).toBe(false);
  });

  it('addTicker calls addToWatchlist and reloads the list', () => {
    apiSpy.addToWatchlist.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = 'SHOP.TO';
    component.addTicker();
    expect(apiSpy.addToWatchlist).toHaveBeenCalledWith('SHOP.TO');
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });

  it('onRemove calls removeFromWatchlist and reloads the list', () => {
    apiSpy.removeFromWatchlist.mockReturnValue(of(undefined));
    component.onRemove('RELIANCE.NS');
    expect(apiSpy.removeFromWatchlist).toHaveBeenCalledWith('RELIANCE.NS');
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });

  it('onRefreshOne calls refreshOne with the given symbol and reloads the list', () => {
    apiSpy.refreshOne.mockReturnValue(of(sampleTickers[0]));
    component.onRefreshOne('RELIANCE.NS');
    expect(apiSpy.refreshOne).toHaveBeenCalledWith('RELIANCE.NS');
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });

  it('onRefreshOne sets errorMessage when the refresh call fails', () => {
    apiSpy.refreshOne.mockReturnValue(throwError(() => new Error('rate limited')));
    component.onRefreshOne('RELIANCE.NS');
    expect(component.errorMessage).toContain('RELIANCE.NS');
  });

  it('addTicker trims whitespace and uppercases the symbol before calling the API', () => {
    apiSpy.addToWatchlist.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = '  aapl  ';
    component.addTicker();
    expect(apiSpy.addToWatchlist).toHaveBeenCalledWith('AAPL');
  });

  it('sets errorMessage with a distinct message on a 404 (symbol not found)', () => {
    apiSpy.addToWatchlist.mockReturnValue(throwError(() => ({ status: 404 })));
    component.newSymbol = 'ZZZZINVALID123';
    component.addTicker();
    expect(component.errorMessage).toContain('ZZZZINVALID123');
  });

  it('sets errorMessage on a generic addToWatchlist failure instead of failing silently', () => {
    apiSpy.addToWatchlist.mockReturnValue(throwError(() => ({ status: 500 })));
    component.newSymbol = 'AAPL';
    component.addTicker();
    expect(component.errorMessage).toBeTruthy();
  });

  it('sets errorMessage when the initial watchlist load fails', () => {
    apiSpy.getWatchlist.mockReturnValue(throwError(() => new Error('network down')));
    component['load']();
    expect(component.errorMessage).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to confirm the new ones fail**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: FAIL — `onRefreshOne` and `isLoading` don't exist yet on
`WatchlistComponent`.

- [ ] **Step 3: Rewrite `watchlist.component.ts`**

Replace the full contents of `frontend/src/app/watchlist/watchlist.component.ts`:

```typescript
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

@Component({
  selector: 'app-watchlist',
  templateUrl: './watchlist.component.html',
  standalone: false
})
export class WatchlistComponent implements OnInit {
  tickers: Ticker[] = [];
  newSymbol = '';
  errorMessage: string | null = null;
  isAdding = false;
  isLoading = false;

  constructor(private api: StockApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading = true;
    this.api.getWatchlist().subscribe({
      next: tickers => {
        this.tickers = tickers;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Could not load your watchlist. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  addTicker(): void {
    const symbol = this.newSymbol.trim().toUpperCase();
    if (!symbol) return;
    this.errorMessage = null;
    this.isAdding = true;
    this.api.addToWatchlist(symbol).subscribe({
      next: () => {
        this.newSymbol = '';
        this.isAdding = false;
        this.load();
      },
      error: err => {
        this.isAdding = false;
        this.errorMessage = this.describeAddError(symbol, err);
        this.cdr.detectChanges();
      }
    });
  }

  onRemove(symbol: string): void {
    this.errorMessage = null;
    this.api.removeFromWatchlist(symbol).subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = `Could not remove ${symbol}. Please try again.`;
        this.cdr.detectChanges();
      }
    });
  }

  onRefreshOne(symbol: string): void {
    this.errorMessage = null;
    this.api.refreshOne(symbol).subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = `Could not refresh ${symbol}. Please try again.`;
        this.cdr.detectChanges();
      }
    });
  }

  private describeAddError(symbol: string, err: any): string {
    if (err?.name === 'TimeoutError') return `Adding ${symbol} is taking too long (Yahoo Finance may be rate-limiting). Please wait a bit and try again.`;
    if (err?.status === 404) return `Could not find symbol ${symbol}.`;
    return `Could not add ${symbol}. Please try again.`;
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: PASS — all `WatchlistComponent` tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/watchlist/watchlist.component.ts frontend/src/app/watchlist/watchlist.component.spec.ts
git commit -m "refactor: replace bulk refresh with per-ticker refresh and loading state in WatchlistComponent"
```

---

### Task 9: Watchlist template — dark styling, loading/empty states, wire refresh

**Files:**
- Modify: `frontend/src/app/watchlist/watchlist.component.html`

**Interfaces:**
- Consumes: `tickers`, `newSymbol`, `errorMessage`, `isAdding`, `isLoading`,
  `addTicker()`, `onRemove(symbol)`, `onRefreshOne(symbol)` from Task 8.
  Same global classes as Task 7.

- [ ] **Step 1: Replace `watchlist.component.html`**

```html
<div class="page-header">
  <h2>Watchlist</h2>
  <div class="add-ticker-form">
    <input [(ngModel)]="newSymbol" placeholder="e.g. AAPL, RELIANCE.NS, SHOP.TO" [disabled]="isAdding" />
    <button (click)="addTicker()" [disabled]="isAdding">{{ isAdding ? 'Adding…' : 'Add' }}</button>
  </div>
</div>

<div class="error-banner" *ngIf="errorMessage">{{ errorMessage }}</div>

<div class="loading-state" *ngIf="isLoading">Loading…</div>
<div class="empty-state" *ngIf="!isLoading && tickers.length === 0">No tickers yet — add one above.</div>

<app-stock-table
  *ngIf="!isLoading && tickers.length > 0"
  [tickers]="tickers"
  (refreshOne)="onRefreshOne($event)"
  (remove)="onRemove($event)">
</app-stock-table>
```

- [ ] **Step 2: Run the full test suite**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: PASS — all tests green.

- [ ] **Step 3: Verify the app builds**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/watchlist/watchlist.component.html
git commit -m "feat: restyle watchlist page with loading/empty states and per-row refresh"
```

---

### Task 10: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated test suite**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm test`
Expected: PASS — all test files green.

- [ ] **Step 2: Run the production build**

Run: `cd frontend && source ~/.nvm/nvm.sh && nvm use && npm run build`
Expected: build succeeds with no errors or warnings about missing
templates/styles.

- [ ] **Step 3: Start the app and manually verify in browser**

From the repo root: `nvm use && npm start` (starts backend + frontend
dev server per `README.md`). Open the frontend URL and check:

- Sidebar shows Portfolio/Watchlist links; the active route is
  visually highlighted; clicking switches pages.
- Each sector group is expanded by default; clicking a sector header
  collapses/expands it; "Expand all"/"Collapse all" work across all
  sectors.
- Scrolling the table horizontally keeps the Ticker/Company columns
  pinned on the left.
- Each row's refresh (↻) button triggers a refresh for that ticker only
  and the row updates; the remove (×) button removes that row.
- Margin-of-safety, P/B, PEG, current/quick ratio, and payout ratio
  cells show green/yellow/red tinted backgrounds consistent with their
  pipe logic.
- An empty portfolio/watchlist shows the "No tickers yet" empty state
  instead of a blank table.
- Triggering an add failure (e.g. an invalid symbol) shows the red
  error banner.
- Tab-key navigation shows a visible focus ring on inputs/buttons/nav
  links.

- [ ] **Step 4: Report results**

No commit for this task — it's verification only. If any manual check
fails, fix it as a follow-up commit against the relevant task's files
before considering the plan complete.

---
