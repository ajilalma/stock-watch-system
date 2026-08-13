import { Component, EventEmitter, Input, Output } from '@angular/core';
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
