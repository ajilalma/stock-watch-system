# Stock Table Error Info Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the stock table, show a clickable info button next to any `cachedData` value that has a matching `datapointErrors` entry, revealing why that value is a fallback, and visually mute the value itself.

**Architecture:** Two new pieces under `frontend/src/app/shared/error-info-button/` — a singleton `ErrorPopoverService` (ensures only one popover is open at a time) and an `ErrorInfoButtonComponent` (icon button + fixed-position popover, using `position: fixed` because ancestor `.table-scroll`/`td` clip `position: absolute`). `StockTableComponent` gets small helper methods (`hasError`, `getError`, and per-column `*Class` methods that combine the existing color pipes with a `muted` class) and its template wires the new component into every `cachedData`-backed cell.

**Tech Stack:** Angular (module-based, `standalone: false`), Vitest (via `@angular/build:unit-test`), plain SCSS with CSS custom properties. No new dependencies.

## Global Constraints

- No new frontend or backend dependencies — implement with plain Angular (`ElementRef`, `HostListener`) and CSS, matching the design spec.
- New component is `standalone: false` and registered in `SharedModule`, matching every existing shared component/pipe.
- Popover positioning must use `position: fixed`, not `absolute` — `.table-scroll` (`overflow-x: auto`) and `td` (`overflow: hidden`) will clip `absolute` positioning.
- Only one popover open across the whole table at a time.
- No backend changes and no changes to `Ticker`/`CachedData` types — `datapointErrors` is already correct.

---

### Task 1: `ErrorPopoverService`

**Files:**
- Create: `frontend/src/app/shared/error-info-button/error-popover.service.ts`
- Test: `frontend/src/app/shared/error-info-button/error-popover.service.spec.ts`

**Interfaces:**
- Produces: `ErrorPopoverService` (`@Injectable({ providedIn: 'root' })`) with `open(instance: Closable): void` and `clear(instance: Closable): void`; `Closable` interface with `close(): void`. Task 2 depends on both.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/app/shared/error-info-button/error-popover.service.spec.ts
import { ErrorPopoverService, Closable } from './error-popover.service';

class FakeClosable implements Closable {
  closed = false;
  close(): void {
    this.closed = true;
  }
}

describe('ErrorPopoverService', () => {
  it('opening a second instance closes the first', () => {
    const service = new ErrorPopoverService();
    const first = new FakeClosable();
    const second = new FakeClosable();

    service.open(first);
    service.open(second);

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(false);
  });

  it('opening the same instance again does not close it', () => {
    const service = new ErrorPopoverService();
    const instance = new FakeClosable();

    service.open(instance);
    service.open(instance);

    expect(instance.closed).toBe(false);
  });

  it('clear only forgets the tracked instance if it matches', () => {
    const service = new ErrorPopoverService();
    const first = new FakeClosable();
    const second = new FakeClosable();

    service.open(first);
    service.clear(second); // no-op, second was never tracked
    service.open(second);

    expect(first.closed).toBe(true); // closed by the final open(second), not by clear()
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run test -- error-popover.service.spec.ts`
Expected: FAIL — `error-popover.service.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/app/shared/error-info-button/error-popover.service.ts
import { Injectable } from '@angular/core';

export interface Closable {
  close(): void;
}

@Injectable({ providedIn: 'root' })
export class ErrorPopoverService {
  private current: Closable | null = null;

  open(instance: Closable): void {
    if (this.current && this.current !== instance) {
      this.current.close();
    }
    this.current = instance;
  }

  clear(instance: Closable): void {
    if (this.current === instance) {
      this.current = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run test -- error-popover.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/error-info-button/error-popover.service.ts frontend/src/app/shared/error-info-button/error-popover.service.spec.ts
git commit -m "feat: add ErrorPopoverService to track the single open error popover"
```

---

### Task 2: `ErrorInfoButtonComponent`

**Files:**
- Create: `frontend/src/app/shared/error-info-button/error-info-button.component.ts`
- Create: `frontend/src/app/shared/error-info-button/error-info-button.component.html`
- Create: `frontend/src/app/shared/error-info-button/error-info-button.component.scss`
- Test: `frontend/src/app/shared/error-info-button/error-info-button.component.spec.ts`
- Modify: `frontend/src/app/shared/shared.module.ts`

**Interfaces:**
- Consumes: `ErrorPopoverService.open(instance: Closable)`, `ErrorPopoverService.clear(instance: Closable)` from Task 1.
- Produces: `<app-error-info-button [message]="string">` — selector `app-error-info-button`, single `@Input() message: string`. Task 5 depends on this selector and input name.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/app/shared/error-info-button/error-info-button.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ErrorInfoButtonComponent } from './error-info-button.component';

function click(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('ErrorInfoButtonComponent', () => {
  let fixture: ComponentFixture<ErrorInfoButtonComponent>;
  let component: ErrorInfoButtonComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [ErrorInfoButtonComponent]
    });
    fixture = TestBed.createComponent(ErrorInfoButtonComponent);
    component = fixture.componentInstance;
    component.message = 'No historic data available';
    fixture.detectChanges();
  });

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  it('is closed by default', () => {
    expect(component.isOpen).toBe(false);
    expect(fixture.nativeElement.querySelector('.error-popover')).toBeNull();
  });

  it('opens the popover on click and shows the message', () => {
    click(button());
    fixture.detectChanges();

    expect(component.isOpen).toBe(true);
    expect(fixture.nativeElement.querySelector('.error-popover').textContent).toContain('No historic data available');
  });

  it('closes on a second click of the button', () => {
    click(button());
    fixture.detectChanges();
    click(button());
    fixture.detectChanges();

    expect(component.isOpen).toBe(false);
  });

  it('closes on outside click', () => {
    click(button());
    fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(component.isOpen).toBe(false);
  });

  it('closes on Escape', () => {
    click(button());
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(component.isOpen).toBe(false);
  });

  it('closes on window scroll', () => {
    click(button());
    fixture.detectChanges();

    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.isOpen).toBe(false);
  });

  it('opening a second instance closes the first, via the shared ErrorPopoverService', () => {
    click(button());
    fixture.detectChanges();
    expect(component.isOpen).toBe(true);

    const fixture2 = TestBed.createComponent(ErrorInfoButtonComponent);
    fixture2.componentInstance.message = 'Another error';
    fixture2.detectChanges();
    click(fixture2.nativeElement.querySelector('button'));
    fixture2.detectChanges();

    expect(component.isOpen).toBe(false);
    expect(fixture2.componentInstance.isOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run test -- error-info-button.component.spec.ts`
Expected: FAIL — `error-info-button.component.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/app/shared/error-info-button/error-info-button.component.ts
import { Component, ElementRef, HostListener, Input } from '@angular/core';
import { Closable, ErrorPopoverService } from './error-popover.service';

@Component({
  selector: 'app-error-info-button',
  templateUrl: './error-info-button.component.html',
  styleUrls: ['./error-info-button.component.scss'],
  standalone: false
})
export class ErrorInfoButtonComponent implements Closable {
  @Input() message = '';

  isOpen = false;
  popoverTop = '0px';
  popoverLeft = '0px';

  constructor(private popoverService: ErrorPopoverService, private el: ElementRef<HTMLElement>) {}

  toggle(event: MouseEvent): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.popoverTop = `${rect.bottom + 4}px`;
    this.popoverLeft = `${rect.left}px`;
    this.isOpen = true;
    this.popoverService.open(this);
  }

  close(): void {
    this.isOpen = false;
    this.popoverService.clear(this);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    if (!this.el.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.close();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.isOpen) this.close();
  }
}
```

```html
<!-- frontend/src/app/shared/error-info-button/error-info-button.component.html -->
<button type="button" class="icon-btn info-btn" title="Data issue — click for details" (click)="toggle($event)">i</button>
<div class="error-popover" *ngIf="isOpen" [style.top]="popoverTop" [style.left]="popoverLeft">{{ message }}</div>
```

```scss
// frontend/src/app/shared/error-info-button/error-info-button.component.scss
:host {
  display: inline-block;
}

.info-btn {
  background: none;
  border: 1px solid currentColor;
  border-radius: 50%;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  font-style: italic;
  font-weight: 700;
  line-height: 1;
  width: 15px;
  height: 15px;
  padding: 0;
  margin-left: 0.3rem;

  &:hover {
    background: var(--bg-surface-raised);
    color: var(--accent);
  }
}

.error-popover {
  position: fixed;
  z-index: 100;
  max-width: 240px;
  padding: 0.5rem 0.6rem;
  background: var(--bg-surface-raised);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  font-size: 12px;
  white-space: normal;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
```

Register in `SharedModule`:

```ts
// frontend/src/app/shared/shared.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StockTableComponent } from './stock-table/stock-table.component';
import { ErrorInfoButtonComponent } from './error-info-button/error-info-button.component';
import { MarginOfSafetyColorPipe } from './pipes/margin-of-safety-color.pipe';
import { PriceToBookColorPipe } from './pipes/price-to-book-color.pipe';
import { PegColorPipe } from './pipes/peg-color.pipe';
import { RatioColorPipe } from './pipes/ratio-color.pipe';
import { PayoutRatioColorPipe } from './pipes/payout-ratio-color.pipe';

@NgModule({
  declarations: [
    StockTableComponent,
    ErrorInfoButtonComponent,
    MarginOfSafetyColorPipe, PriceToBookColorPipe, PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
  ],
  imports: [CommonModule, FormsModule],
  exports: [
    StockTableComponent,
    ErrorInfoButtonComponent,
    MarginOfSafetyColorPipe, PriceToBookColorPipe, PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
  ]
})
export class SharedModule { }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run test -- error-info-button.component.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/error-info-button/ frontend/src/app/shared/shared.module.ts
git commit -m "feat: add ErrorInfoButtonComponent with a fixed-position popover"
```

---

### Task 3: `StockTableComponent.hasError` / `getError`

**Files:**
- Modify: `frontend/src/app/shared/stock-table/stock-table.component.ts`
- Test: `frontend/src/app/shared/stock-table/stock-table.component.spec.ts`

**Interfaces:**
- Produces: `hasError(ticker: Ticker, field: string): boolean`, `getError(ticker: Ticker, field: string): string`. Tasks 4 and 5 depend on both.

- [ ] **Step 1: Write the failing test**

Append to the existing `describe('StockTableComponent', ...)` block in `stock-table.component.spec.ts` (after the last existing `it`, before the closing `});`):

```ts
  it('hasError returns true only when datapointErrors has an entry for the given field', () => {
    const ticker: Ticker = { ...tickers[0], datapointErrors: { fairValue: 'No historic data available' } };
    expect(component.hasError(ticker, 'fairValue')).toBe(true);
    expect(component.hasError(ticker, 'priceToBook')).toBe(false);
  });

  it('hasError returns false when datapointErrors is absent entirely', () => {
    const ticker: Ticker = { ...tickers[0] };
    expect(component.hasError(ticker, 'fairValue')).toBe(false);
  });

  it('getError returns the error message for a field, or empty string when there is none', () => {
    const ticker: Ticker = { ...tickers[0], datapointErrors: { fairValue: 'No historic data available' } };
    expect(component.getError(ticker, 'fairValue')).toBe('No historic data available');
    expect(component.getError(ticker, 'priceToBook')).toBe('');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run test -- stock-table.component.spec.ts`
Expected: FAIL — `hasError`/`getError` are not defined on `StockTableComponent`.

- [ ] **Step 3: Write minimal implementation**

Add to `StockTableComponent` in `stock-table.component.ts` (near `isCollapsed`):

```ts
  hasError(ticker: Ticker, field: string): boolean {
    return !!ticker.datapointErrors?.[field];
  }

  getError(ticker: Ticker, field: string): string {
    return ticker.datapointErrors?.[field] ?? '';
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run test -- stock-table.component.spec.ts`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/stock-table/stock-table.component.ts frontend/src/app/shared/stock-table/stock-table.component.spec.ts
git commit -m "feat: add hasError/getError helpers to StockTableComponent"
```

---

### Task 4: Per-column class helpers combining color pipes with `muted`

**Files:**
- Modify: `frontend/src/app/shared/stock-table/stock-table.component.ts`
- Test: `frontend/src/app/shared/stock-table/stock-table.component.spec.ts`

**Interfaces:**
- Consumes: `hasError(ticker, field)` from Task 3; `MarginOfSafetyColorPipe.transform(currentPrice, fairValue)`, `PriceToBookColorPipe.transform(value)`, `PegColorPipe.transform(value)`, `RatioColorPipe.transform(value)`, `PayoutRatioColorPipe.transform(value)` from `frontend/src/app/shared/pipes/*` (each returns `'green' | 'yellow' | 'red' | 'none'`).
- Produces: `currentPriceClass(ticker: Ticker): string`, `priceToBookClass(ticker: Ticker): string`, `pegClass(ticker: Ticker): string`, `currentRatioClass(ticker: Ticker): string`, `quickRatioClass(ticker: Ticker): string`, `payoutRatioClass(ticker: Ticker): string` — each returns the pipe's color class, plus `' muted'` appended when that field has an error. Task 5 depends on these six method names.

- [ ] **Step 1: Write the failing test**

Add near the top of `stock-table.component.spec.ts`, after the existing `tickers` fixture, a shared `baseCachedData` fixture and import `CachedData`:

```ts
import { CachedData, Ticker } from '../models/ticker.model';

const baseCachedData: CachedData = {
  fetchedAt: '2026-08-14T00:00:00Z',
  currentPrice: 80,
  fairValue: 120,
  nativePrice: 80,
  nativeFairValue: 120,
  fxRateToUsd: 1,
  priceToBook: 1,
  currentRatio: 1.5,
  quickRatio: 1.2,
  pegRatio: 1,
  payoutRatio: 0.3
};
```

Then append these tests to the `describe` block:

```ts
  it('currentPriceClass appends muted only when currentPrice has a datapoint error', () => {
    const withoutError: Ticker = { ...tickers[0], cachedData: { ...baseCachedData } };
    const withError: Ticker = { ...withoutError, datapointErrors: { currentPrice: 'Quote unavailable' } };
    expect(component.currentPriceClass(withoutError)).toBe('green');
    expect(component.currentPriceClass(withError)).toBe('green muted');
  });

  it('priceToBookClass appends muted only when priceToBook has a datapoint error', () => {
    const withoutError: Ticker = { ...tickers[0], cachedData: { ...baseCachedData } };
    const withError: Ticker = { ...withoutError, datapointErrors: { priceToBook: 'Missing book value' } };
    expect(component.priceToBookClass(withoutError)).toBe('green');
    expect(component.priceToBookClass(withError)).toBe('green muted');
  });

  it('pegClass appends muted only when pegRatio has a datapoint error', () => {
    const withoutError: Ticker = { ...tickers[0], cachedData: { ...baseCachedData } };
    const withError: Ticker = { ...withoutError, datapointErrors: { pegRatio: 'Missing earnings growth' } };
    expect(component.pegClass(withoutError)).toBe('green');
    expect(component.pegClass(withError)).toBe('green muted');
  });

  it('currentRatioClass appends muted only when currentRatio has a datapoint error', () => {
    const withoutError: Ticker = { ...tickers[0], cachedData: { ...baseCachedData } };
    const withError: Ticker = { ...withoutError, datapointErrors: { currentRatio: 'Missing liabilities' } };
    expect(component.currentRatioClass(withoutError)).toBe('green');
    expect(component.currentRatioClass(withError)).toBe('green muted');
  });

  it('quickRatioClass appends muted only when quickRatio has a datapoint error', () => {
    const withoutError: Ticker = { ...tickers[0], cachedData: { ...baseCachedData } };
    const withError: Ticker = { ...withoutError, datapointErrors: { quickRatio: 'Missing inventory' } };
    expect(component.quickRatioClass(withoutError)).toBe('green');
    expect(component.quickRatioClass(withError)).toBe('green muted');
  });

  it('payoutRatioClass appends muted only when payoutRatio has a datapoint error', () => {
    const withoutError: Ticker = { ...tickers[0], cachedData: { ...baseCachedData } };
    const withError: Ticker = { ...withoutError, datapointErrors: { payoutRatio: 'Missing dividend history' } };
    expect(component.payoutRatioClass(withoutError)).toBe('green');
    expect(component.payoutRatioClass(withError)).toBe('green muted');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run test -- stock-table.component.spec.ts`
Expected: FAIL — the six `*Class` methods are not defined on `StockTableComponent`.

- [ ] **Step 3: Write minimal implementation**

Add imports and fields/methods to `stock-table.component.ts`:

```ts
import { MarginOfSafetyColorPipe } from '../pipes/margin-of-safety-color.pipe';
import { PriceToBookColorPipe } from '../pipes/price-to-book-color.pipe';
import { PegColorPipe } from '../pipes/peg-color.pipe';
import { RatioColorPipe } from '../pipes/ratio-color.pipe';
import { PayoutRatioColorPipe } from '../pipes/payout-ratio-color.pipe';
```

Inside the class:

```ts
  private readonly marginOfSafetyColorPipe = new MarginOfSafetyColorPipe();
  private readonly priceToBookColorPipe = new PriceToBookColorPipe();
  private readonly pegColorPipe = new PegColorPipe();
  private readonly ratioColorPipe = new RatioColorPipe();
  private readonly payoutRatioColorPipe = new PayoutRatioColorPipe();

  currentPriceClass(ticker: Ticker): string {
    const color = this.marginOfSafetyColorPipe.transform(ticker.cachedData?.currentPrice, ticker.cachedData?.fairValue);
    return this.withMuted(color, ticker, 'currentPrice');
  }

  priceToBookClass(ticker: Ticker): string {
    const color = this.priceToBookColorPipe.transform(ticker.cachedData?.priceToBook);
    return this.withMuted(color, ticker, 'priceToBook');
  }

  pegClass(ticker: Ticker): string {
    const color = this.pegColorPipe.transform(ticker.cachedData?.pegRatio);
    return this.withMuted(color, ticker, 'pegRatio');
  }

  currentRatioClass(ticker: Ticker): string {
    const color = this.ratioColorPipe.transform(ticker.cachedData?.currentRatio);
    return this.withMuted(color, ticker, 'currentRatio');
  }

  quickRatioClass(ticker: Ticker): string {
    const color = this.ratioColorPipe.transform(ticker.cachedData?.quickRatio);
    return this.withMuted(color, ticker, 'quickRatio');
  }

  payoutRatioClass(ticker: Ticker): string {
    const color = this.payoutRatioColorPipe.transform(ticker.cachedData?.payoutRatio);
    return this.withMuted(color, ticker, 'payoutRatio');
  }

  private withMuted(colorClass: string, ticker: Ticker, field: string): string {
    return this.hasError(ticker, field) ? `${colorClass} muted` : colorClass;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run test -- stock-table.component.spec.ts`
Expected: PASS (all tests, including the 6 new ones)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/stock-table/stock-table.component.ts frontend/src/app/shared/stock-table/stock-table.component.spec.ts
git commit -m "feat: add per-column class helpers combining color pipes with muted state"
```

---

### Task 5: Wire the info button into every `cachedData` column

**Files:**
- Modify: `frontend/src/app/shared/stock-table/stock-table.component.html`
- Modify: `frontend/src/app/shared/stock-table/stock-table.component.scss`
- Modify: `frontend/src/app/shared/stock-table/stock-table.component.spec.ts`

**Interfaces:**
- Consumes: `hasError`, `getError` (Task 3); `currentPriceClass`, `priceToBookClass`, `pegClass`, `currentRatioClass`, `quickRatioClass`, `payoutRatioClass` (Task 4); `<app-error-info-button [message]="string">` (Task 2).

This task has no new unit-level behavior of its own (the logic it wires together is already tested in Tasks 3–4), so its test step verifies the template renders correctly instead of following the strict red/green TDD cycle used in the prior tasks.

- [ ] **Step 1: Declare `ErrorInfoButtonComponent` in the component's test module**

`StockTableComponent`'s spec configures its own `TestBed` module (it does not import `SharedModule`), so the new child component must be added there for the template to compile in tests. Update the `declarations` array in `stock-table.component.spec.ts`:

```ts
import { ErrorInfoButtonComponent } from '../error-info-button/error-info-button.component';
```

```ts
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [
        StockTableComponent, ErrorInfoButtonComponent, MarginOfSafetyColorPipe, PriceToBookColorPipe,
        PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
      ]
    });
```

- [ ] **Step 2: Run the existing suite to confirm it still passes before the template change**

Run: `npm --prefix frontend run test -- stock-table.component.spec.ts`
Expected: PASS (adding the declaration alone changes nothing observable yet)

- [ ] **Step 3: Add a template-rendering test for the info button**

Append to the `describe` block:

```ts
  it('renders an info button only for cachedData fields with a datapoint error, and mutes their value', () => {
    const ticker: Ticker = {
      ...tickers[0],
      cachedData: { ...baseCachedData },
      datapointErrors: { fairValue: 'No historic data available' }
    };
    component.tickers = [ticker];
    component.ngOnChanges({ tickers: {} as any });
    fixture.detectChanges();

    const infoButtons = fixture.nativeElement.querySelectorAll('app-error-info-button');
    expect(infoButtons.length).toBe(1);

    const fairValueCell = Array.from(fixture.nativeElement.querySelectorAll('td')).find(
      (td: any) => td.classList.contains('muted')
    ) as HTMLElement;
    expect(fairValueCell).toBeTruthy();
  });
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm --prefix frontend run test -- stock-table.component.spec.ts`
Expected: FAIL — no `app-error-info-button` elements are rendered yet, and no cell has `class="muted"`.

- [ ] **Step 5: Update the template**

Replace lines 47–60 of `stock-table.component.html` (the `currentPrice` through `payoutRatio` cells) with:

```html
        <td [class]="currentPriceClass(ticker)">
          {{ ticker.cachedData?.currentPrice | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'currentPrice')" [message]="getError(ticker, 'currentPrice')"></app-error-info-button>
        </td>
        <td [class.muted]="hasError(ticker, 'fairValue')">
          {{ ticker.cachedData?.fairValue | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'fairValue')" [message]="getError(ticker, 'fairValue')"></app-error-info-button>
        </td>
        <td [class]="priceToBookClass(ticker)">
          {{ ticker.cachedData?.priceToBook | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'priceToBook')" [message]="getError(ticker, 'priceToBook')"></app-error-info-button>
        </td>
        <td [class.muted]="hasError(ticker, 'priceToBookIndustryAvg')">
          {{ ticker.cachedData?.priceToBookIndustryAvg | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'priceToBookIndustryAvg')" [message]="getError(ticker, 'priceToBookIndustryAvg')"></app-error-info-button>
        </td>
        <td [class]="pegClass(ticker)">
          {{ ticker.cachedData?.pegRatio | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'pegRatio')" [message]="getError(ticker, 'pegRatio')"></app-error-info-button>
        </td>
        <td [class]="currentRatioClass(ticker)">
          {{ ticker.cachedData?.currentRatio | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'currentRatio')" [message]="getError(ticker, 'currentRatio')"></app-error-info-button>
        </td>
        <td [class.muted]="hasError(ticker, 'currentRatioIndustryAvg')">
          {{ ticker.cachedData?.currentRatioIndustryAvg | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'currentRatioIndustryAvg')" [message]="getError(ticker, 'currentRatioIndustryAvg')"></app-error-info-button>
        </td>
        <td [class]="quickRatioClass(ticker)">
          {{ ticker.cachedData?.quickRatio | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'quickRatio')" [message]="getError(ticker, 'quickRatio')"></app-error-info-button>
        </td>
        <td [class.muted]="hasError(ticker, 'quickRatioIndustryAvg')">
          {{ ticker.cachedData?.quickRatioIndustryAvg | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'quickRatioIndustryAvg')" [message]="getError(ticker, 'quickRatioIndustryAvg')"></app-error-info-button>
        </td>
        <td [class.muted]="hasError(ticker, 'lastDividendDate')">
          {{ ticker.cachedData?.lastDividendDate | date:'yyyy-MM-dd' }}
          <app-error-info-button *ngIf="hasError(ticker, 'lastDividendDate')" [message]="getError(ticker, 'lastDividendDate')"></app-error-info-button>
        </td>
        <td [class.muted]="hasError(ticker, 'lastDividendAmount')">
          {{ ticker.cachedData?.lastDividendAmount | number:'1.2-2' }}
          <app-error-info-button *ngIf="hasError(ticker, 'lastDividendAmount')" [message]="getError(ticker, 'lastDividendAmount')"></app-error-info-button>
        </td>
        <td [class]="payoutRatioClass(ticker)">
          {{ ticker.cachedData?.payoutRatio | percent }}
          <app-error-info-button *ngIf="hasError(ticker, 'payoutRatio')" [message]="getError(ticker, 'payoutRatio')"></app-error-info-button>
        </td>
```

Add the `muted` rule to `stock-table.component.scss`:

```scss
.muted {
  color: var(--text-muted);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm --prefix frontend run test -- stock-table.component.spec.ts`
Expected: PASS (all tests, including the new rendering test)

- [ ] **Step 7: Run the full frontend suite**

Run: `npm --prefix frontend run test`
Expected: PASS — no regressions in other specs (`peg-color.pipe.spec.ts`, `price-to-book-color.pipe.spec.ts`, `ratio-color.pipe.spec.ts`, `payout-ratio-color.pipe.spec.ts`, `margin-of-safety-color.pipe.spec.ts`, `stock-api.service.spec.ts`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/shared/stock-table/
git commit -m "feat: show error info button and mute value for errored datapoints in stock table"
```

---

### Task 6: Manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start the frontend dev server**

Run: `npm --prefix frontend run start`
Wait for `Local: http://localhost:4200/` in the output.

- [ ] **Step 2: Open the app and locate the stock table**

Navigate to `http://localhost:4200/` (or whichever route renders `<app-stock-table>`, e.g. the portfolio or watchlist page) in the browser tool. Confirm at least one ticker row with `cachedData` is visible.

- [ ] **Step 3: Inject a synthetic `datapointErrors` entry via Angular's dev-mode debugging API**

With the app running in development mode (`ng serve` enables Angular's debugging globals), use the browser tool's JS console to grab the `StockTableComponent` instance directly from its host element (`ng.getComponent(element)` returns the component instance owning that host, per Angular's public debugging API) and force an error on one field:

```js
const stockTable = ng.getComponent(document.querySelector('app-stock-table'));
const first = stockTable.tickers[0];
first.datapointErrors = { ...(first.datapointErrors || {}), fairValue: 'No historic data available (manual test)' };
ng.applyChanges(stockTable);
```

- [ ] **Step 4: Verify visually**

Confirm: the Fair Value cell for the first ticker shows a muted value and an "i" info button; no other cell in that row shows a button. Click the button — a popover appears near it showing "No historic data available (manual test)" without being clipped by the table's scroll container. Click elsewhere on the page — the popover closes. Reopen it and press `Escape` — it closes. Reopen it and scroll the table — it closes.

- [ ] **Step 5: Verify only one popover is open at a time**

Force a second field's error the same way (e.g. `priceToBook` on the same or a different ticker), open its info button while the first is closed, then open the first button again — confirm the second popover closes automatically.

- [ ] **Step 6: Stop the dev server**

Report the result to the user; no commit for this task (verification only).
