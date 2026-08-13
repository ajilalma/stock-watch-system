# Black Theme UI Redesign

## Context

The frontend (Angular) currently has no styling at all — `styles.scss` and
`app.scss` are empty, so both the Portfolio and Watchlist pages render with
browser defaults: an unstyled `<nav>` list, plain `<h2>` headers, and a bare
HTML `<table>` with minimal inline colors for value-investing signal columns
(margin of safety, P/B, PEG, current/quick ratio, payout ratio).

This spec covers a full visual and light structural redesign to a dark
("black") theme, plus a change to how refresh works given backend rate
limits (see "Row actions" below).

## Goals

- Replace the unstyled UI with a polished dark theme.
- Move navigation into a left sidebar.
- Make the dense 15-column stock table easier to work with: collapsible
  sector groups, sticky leading columns, per-row refresh instead of bulk
  refresh.
- Centralize theme values (colors, font) as CSS custom properties so they
  can be changed from one place later.
- Preserve existing pipe-driven semantic coloring (green/yellow/red) logic;
  only the visual treatment changes.

## Non-goals

- No new UI component library (hand-rolled SCSS only).
- No mobile-first redesign — this is a personal, primarily-desktop local
  tool. Keep it from breaking on narrow viewports, but don't optimize for
  them.
- No backend/API changes beyond what's needed to call the existing
  `refreshOne` endpoint per row (see below) — no new endpoints.
- No changes to DCF/fair-value calculation logic, sector grouping logic, or
  routing structure.

## Design tokens

All theme values live as CSS custom properties defined once, in a `:root`
block in `frontend/src/styles.scss`, so retheming later (primary color,
accent, font) means editing values in one place.

**Base palette:**
- `--bg-base: #0a0a0a` — page background
- `--bg-surface: #141414` — sidebar, table, cards
- `--bg-surface-raised: #1c1c1c` — hover rows, inputs, sector header rows
- `--border-subtle: #2a2a2a`
- `--text-primary: #e8e8e8`
- `--text-secondary: #9a9a9a`
- `--text-muted: #666`

**Accent (interactive elements — buttons, active nav, links, focus rings):**
- `--accent: #3ecf8e`
- `--accent-hover: #34b87c`

**Semantic signal colors** (deliberately a different hue/tone from
`--accent` so "good margin of safety" doesn't visually collide with the
UI's own accent green). Each has a `-bg` (translucent tint, for table cell
backgrounds) and `-text` variant:
- `--signal-green: #4caf7d` / `--signal-green-bg: rgba(76,175,125,0.15)`
- `--signal-yellow: #d4b13f` / `--signal-yellow-bg: rgba(212,177,63,0.15)`
- `--signal-red: #d4574f` / `--signal-red-bg: rgba(212,87,79,0.15)`

**Typography:** system UI font stack (`-apple-system, "Segoe UI", Roboto,
sans-serif`) — no web font dependency. Base sizes: 13px for dense table
data, 14px for body/buttons/inputs, 20px semibold for page titles.

## Layout & navigation

Full-height app shell in `app.html`/`app.scss`, replacing the current bare
`<nav><a>...</a></nav>`:

- **Sidebar**: fixed, ~220px wide, `--bg-surface` background. App name at
  top, then a vertical nav list ("Portfolio", "Watchlist"). The active
  route gets a left accent bar, `--accent` text, and `--bg-surface-raised`
  background. Room below the links for future sections.
- **Main content area**: `--bg-base` background, ~24px padding, containing
  the page header and table.
- **Narrow viewports** (below ~900px): sidebar collapses to icon-only or a
  top bar. This is a minimal safety net, not a mobile redesign.

## Page structure (Portfolio & Watchlist)

Both pages keep their current structure (they're near-identical) but
restyled, in `portfolio.component.html`/`.scss` and
`watchlist.component.html`/`.scss`:

- **Page header row**: page title (`<h2>`, 20px semibold) and the
  add-ticker form aligned in a single row (not stacked).
- **Add-ticker form**: input styled with `--bg-surface-raised` background,
  `--border-subtle` border, `--accent` focus ring. Button uses `--accent`
  fill, `--accent-hover` on hover, dimmed + `not-allowed` cursor while
  disabled (keeps the existing "Adding…" label).
- **Error banner**: the existing `<div class="error">` restyled as a
  banner using `--signal-red-bg`/`--signal-red-text`, placed between the
  header and the table.
- **Empty state**: if `tickers` is empty (and not loading), show a
  centered muted message ("No tickers yet — add one above") instead of an
  empty table.
- **Loading state**: a brief skeleton/dim state while the initial
  `getPortfolio()`/`getWatchlist()` call is in flight, so "no data yet" is
  distinguishable from "still loading". Requires adding a small
  `isLoading` flag to each page component (currently absent).

## Stock table component (`stock-table.component.*`)

**Toolbar removed.** The existing "Refresh Selected" / "Refresh All"
buttons and the checkbox column are removed entirely — bulk refresh isn't
feasible against the backend's Yahoo Finance rate limiting. In their place:

- An **"Expand all" / "Collapse all"** control (small text-button pair,
  right-aligned) sits above the table.
- Each row gets two icon-style action buttons at the row end:
  - **Refresh** (↻): muted by default, `--accent` on hover; disables
    itself and shows a spin/pending state while that ticker's refresh is
    in flight.
  - **Remove** (×): muted by default, `--signal-red` on hover (existing
    behavior, restyled).

**Sector groups (collapsible, open by default):**
- Sector header row is clickable: chevron (▸ collapsed / ▾ expanded) +
  sector name + row count badge (e.g. "Technology (4)"),
  `--bg-surface-raised` background.
- Collapsed state tracked as a `Set<string>` of collapsed sector names in
  the component, defaulting to empty (all expanded).
- "Expand all" clears the set; "Collapse all" fills it with every sector
  name present in `groupedBySector()`.

**Sticky columns:** Ticker and Company columns (checkbox column is gone)
use `position: sticky; left: ...` with a subtle divider/shadow when the
table is scrolled horizontally, so they stay visible while scrolling
through the remaining ratio columns. The table sits inside an
`overflow-x: auto` wrapper.

**Row styling:** flat rows (no zebra striping) with `--border-subtle`
dividers, `--bg-surface-raised` on hover.

**Semantic cells:** the color pipes (`marginOfSafetyColor`,
`priceToBookColor`, `pegColor`, `ratioColor`, `payoutRatioColor`) keep
their existing `ColorLevel` logic (`'green' | 'yellow' | 'red' | 'none'`)
unchanged. Only the CSS backing `.green`/`.yellow`/`.red` classes changes,
remapped to `--signal-*-bg` (background tint) + `--signal-*-text` (text
color) instead of the current solid pastel blocks.

## Component/API changes required

- `stock-table.component.ts`:
  - Remove `selectedSymbols`, `toggleSelectAll`, `toggleRow`,
    `onRefreshSelectedClick`, `onRefreshAllClick`, and the
    `refreshSelected`/`refreshAllEmitter` outputs.
  - Add `collapsedSectors: Set<string>`, `toggleSector(sector: string)`,
    `expandAll()`, `collapseAll()`.
  - Add `@Output() refreshOne = new EventEmitter<string>()`, emitted from
    each row's refresh button.
- `portfolio.component.ts` / `watchlist.component.ts`:
  - Remove `onRefreshSelected`/`onRefreshAll` handlers (and the
    `(refreshSelected)`/`(refreshAllEmitter)` bindings in their templates).
  - Add an `onRefreshOne(symbol: string)` handler calling
    `api.refreshOne(symbol)` (already exists on `StockApiService`) and
    reloading on success, mirroring the existing `onRemove` pattern.
  - Add `isLoading` flag, set during `load()`.
- Existing specs for `stock-table.component`, `portfolio.component`,
  `watchlist.component` need updating for the removed
  selection/bulk-refresh behavior and the new `refreshOne`/collapse
  behavior. Pipe specs are unaffected (pipe logic doesn't change).

## Verification

- Update and run existing `.spec.ts` files (component specs affected by
  the API/output changes above; pipe specs unaffected).
- Manually exercise both pages in the browser: sidebar nav (active state),
  collapsible sectors + expand/collapse all, horizontal scroll with sticky
  columns, per-row refresh and remove, semantic cell coloring across all
  three signal levels, empty state (empty portfolio/watchlist), error
  banner (trigger an add failure), loading state on initial load, focus
  states via keyboard nav.
