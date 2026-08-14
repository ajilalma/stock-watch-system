# Stock Table Error Info Buttons

## Context

`Ticker.datapointErrors` (`frontend/src/app/shared/models/ticker.model.ts:34`)
is a `Record<string, string>` keyed by `cachedData` field name, already
populated by the backend (see
[2026-08-14-resilient-datapoint-calculation-design.md](2026-08-14-resilient-datapoint-calculation-design.md))
and already present on every `Ticker` returned by the API. When a field has
an entry, the value shown in `cachedData` for that field is a fallback
(`0` for numbers, `'Unavailable'` for strings), not real data.

The stock table (`frontend/src/app/shared/stock-table/`) currently ignores
`datapointErrors` entirely — it renders `cachedData` values as if they were
always real, with no indication that a given cell fell back to a default.
That prior spec explicitly scoped this out as follow-up UI work. This spec
is that follow-up.

## Goals

- For any table cell backed by a `cachedData` field that has a matching
  `datapointErrors` entry, show an info button next to the value that, when
  clicked, reveals the error message explaining why that field is missing.
- Visually mute the fallback value in that cell so it doesn't read as real
  data.
- Reuse the existing plain-Angular/SCSS patterns already in the codebase
  (no new UI library or dependency).

## Non-goals

- No backend or type changes — `datapointErrors` is already correctly typed
  and populated.
- No change to *which* fields can error or how errors are computed.
- No multi-popover UI (e.g. showing several error messages at once); only
  one popover open at a time across the table.

## Design

### New component: `ErrorInfoButtonComponent`

`frontend/src/app/shared/error-info-button/error-info-button.component.{ts,html,scss}`

```ts
@Component({
  selector: 'app-error-info-button',
  templateUrl: './error-info-button.component.html',
  styleUrls: ['./error-info-button.component.scss'],
  standalone: false
})
export class ErrorInfoButtonComponent {
  @Input() message!: string;
  isOpen = false;
  popoverStyle: { top: string; left: string } = { top: '0px', left: '0px' };

  constructor(private popoverService: ErrorPopoverService, private el: ElementRef) {}

  toggle(event: MouseEvent): void { ... }  // computes position from button rect, calls popoverService.open(this)
  close(): void { ... }
  @HostListener('document:click', ['$event']) onDocumentClick(event: MouseEvent): void { ... }
  @HostListener('document:keydown.escape') onEscape(): void { ... }
}
```

- Button markup follows the existing `.icon-btn` pattern used by
  refresh/remove (`stock-table.component.html:41-42`): a plain `<button
  type="button" class="icon-btn info-btn">` with an "i" glyph, `title` kept
  as a fallback for hover/screen readers (`title="Data issue — click for
  details"`).
- On click, position is computed via
  `(event.currentTarget as HTMLElement).getBoundingClientRect()` and used to
  set the popover's `position: fixed` `top`/`left`. `position: fixed` is
  required (not `absolute`) because `.table-scroll` uses `overflow-x: auto`
  and `td` uses `overflow: hidden`, both of which would clip an
  absolutely-positioned popover; `fixed` is positioned relative to the
  viewport and isn't affected by ancestor `overflow`, since no ancestor in
  this tree sets `transform`/`filter`/`perspective`.
- The popover itself is a `<div class="error-popover" *ngIf="isOpen">` with
  the message text, rendered inside the same component (no need to portal it
  elsewhere — `position: fixed` already escapes the clipping ancestors).

### New service: `ErrorPopoverService`

`frontend/src/app/shared/error-info-button/error-popover.service.ts`

Tracks which single `ErrorInfoButtonComponent` instance is currently open so
that opening one closes any other:

```ts
@Injectable({ providedIn: 'root' })
export class ErrorPopoverService {
  private current: ErrorInfoButtonComponent | null = null;

  open(instance: ErrorInfoButtonComponent): void {
    if (this.current && this.current !== instance) this.current.close();
    this.current = instance;
  }

  clear(instance: ErrorInfoButtonComponent): void {
    if (this.current === instance) this.current = null;
  }
}
```

### `StockTableComponent` changes

Two new plain methods (`stock-table.component.ts`), matching the existing
style of `isCollapsed`/`isRefreshing`:

```ts
hasError(ticker: Ticker, field: string): boolean {
  return !!ticker.datapointErrors?.[field];
}

getError(ticker: Ticker, field: string): string {
  return ticker.datapointErrors?.[field] ?? '';
}
```

For the handful of cells that combine a color-coding pipe with the new
`muted` class, add small helper methods rather than inlining pipes into
`ngClass` object keys (Angular templates can't pipe inside an object-literal
key), e.g.:

```ts
priceToBookClass(ticker: Ticker): Record<string, boolean> {
  const color = this.priceToBookColorPipe.transform(ticker.cachedData?.priceToBook);
  return { [color]: true, muted: this.hasError(ticker, 'priceToBook') };
}
```

(Exact pipe injection/usage follows whatever pattern the existing color
pipes already use — impure pipe call via injected pipe instance, or a plain
TS port of the same comparison logic, decided during implementation by
checking `priceToBookColor` etc.'s current implementation.)

### Template changes (`stock-table.component.html`)

Every `cachedData`-backed `<td>` gets the same shape. Plain cells (no
existing color class):

```html
<td [class.muted]="hasError(ticker, 'fairValue')">
  {{ ticker.cachedData?.fairValue | number:'1.2-2' }}
  <app-error-info-button *ngIf="hasError(ticker, 'fairValue')" [message]="getError(ticker, 'fairValue')"></app-error-info-button>
</td>
```

Cells with an existing `[class]="... | someColor"` binding switch to
`[ngClass]="somethingClass(ticker)"` using the helper methods described
above.

Columns affected: Current Price, Fair Value, P/B, P/B Industry, PEG,
Current Ratio, Current Ratio Industry, Quick Ratio, Quick Ratio Industry,
Last Dividend Date, Last Dividend Amount, Payout Ratio — i.e. every column
sourced from `cachedData`.

### Styling (`stock-table.component.scss` and the new component's scss)

- `.muted { color: var(--text-muted); }` — reuses the existing CSS variable
  already used by `.sector-count`.
- `.info-btn` follows `.icon-btn` (small, `var(--text-muted)`, hover
  background) with a compact "i" glyph, sized to sit inline next to a
  numeric value without disrupting the column's fixed width / ellipsis
  behavior.
- `.error-popover`: small fixed-position card, `var(--bg-surface-raised)`
  background, `var(--border-subtle)` border, readable max-width (e.g.
  240px) so long error messages wrap instead of overflowing.

### Closing behavior

- Outside click (via `document:click` listener, checking the click target
  against the component's own `ElementRef`) closes the popover.
- `Escape` closes it.
- Scrolling `.table-scroll` (or the window) while open closes it, rather
  than repositioning — simplest correct behavior given `position: fixed`
  coordinates are computed once at open time.
- Opening a second info button closes the first, via `ErrorPopoverService`.

## Testing

- Unit tests for `StockTableComponent.hasError`/`getError` covering: field
  present with error, field present without error, field entirely absent
  from `datapointErrors`.
- Unit tests for `ErrorInfoButtonComponent`: toggle open/closed on click,
  closes on outside click, closes on `Escape`.
- Unit test for `ErrorPopoverService`: opening a second instance closes the
  first.
- Manual verification in the browser: a ticker with a seeded
  `datapointErrors` entry shows the info button only on the matching
  column, the value in that cell is muted, clicking shows the correct
  message without being clipped by the scrollable table, and only one
  popover is visible at a time when multiple errored cells exist in the
  same row.
