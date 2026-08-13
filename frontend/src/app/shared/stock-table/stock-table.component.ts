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
  refreshingSymbol: string | null = null;

  // Safety-net timeout for refreshingSymbol: onRefreshClick is fire-and-forget
  // from this component's perspective (the parent owns the API call), so if the
  // parent's request errors out it never tells us - it only surfaces
  // errorMessage and does NOT reload `tickers` on failure, which is the normal
  // path that clears refreshingSymbol below. Without this, a failed refresh
  // (e.g. rate-limited backend) would leave that row's refresh button stuck
  // disabled/spinning forever. Set comfortably above the backend's own request
  // timeout (StockApiService.REQUEST_TIMEOUT_MS = 45s) so it only ever fires
  // as a last resort, after the API call would already have settled one way
  // or another.
  private static readonly REFRESH_SAFETY_TIMEOUT_MS = 46_000;
  private refreshTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['tickers']) return;
    const currentSectors = new Set(this.tickers.map(t => t.sector));
    for (const sector of Array.from(this.collapsedSectors)) {
      if (!currentSectors.has(sector)) {
        this.collapsedSectors.delete(sector);
      }
    }
    this.clearRefreshTimeout();
    this.refreshingSymbol = null;
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
    this.clearRefreshTimeout();
    this.refreshingSymbol = symbol;
    this.refreshTimeoutHandle = setTimeout(() => {
      this.refreshTimeoutHandle = null;
      if (this.refreshingSymbol === symbol) {
        this.refreshingSymbol = null;
      }
    }, StockTableComponent.REFRESH_SAFETY_TIMEOUT_MS);
    this.refreshOne.emit(symbol);
  }

  isRefreshing(symbol: string): boolean {
    return this.refreshingSymbol === symbol;
  }

  onRemoveClick(symbol: string): void {
    this.remove.emit(symbol);
  }

  private clearRefreshTimeout(): void {
    if (this.refreshTimeoutHandle !== null) {
      clearTimeout(this.refreshTimeoutHandle);
      this.refreshTimeoutHandle = null;
    }
  }
}
