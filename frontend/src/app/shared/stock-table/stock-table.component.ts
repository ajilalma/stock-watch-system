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
