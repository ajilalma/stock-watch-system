import { Component, OnInit } from '@angular/core';
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

  constructor(private api: StockApiService) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.getWatchlist().subscribe({
      next: tickers => this.tickers = tickers,
      error: () => this.errorMessage = 'Could not load your watchlist. Please try again.'
    });
  }

  addTicker(): void {
    const symbol = this.newSymbol.trim().toUpperCase();
    if (!symbol) return;
    this.errorMessage = null;
    this.api.addToWatchlist(symbol).subscribe({
      next: () => {
        this.newSymbol = '';
        this.load();
      },
      error: err => this.errorMessage = this.describeAddError(symbol, err)
    });
  }

  onRemove(symbol: string): void {
    this.errorMessage = null;
    this.api.removeFromWatchlist(symbol).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage = `Could not remove ${symbol}. Please try again.`
    });
  }

  onRefreshSelected(symbols: string[]): void {
    this.errorMessage = null;
    this.api.refreshMany(symbols).subscribe({
      next: () => this.load(),
      error: () => this.errorMessage = 'Could not refresh the selected tickers. Please try again.'
    });
  }

  onRefreshAll(): void {
    this.errorMessage = null;
    this.api.refreshAll().subscribe({
      next: () => this.load(),
      error: () => this.errorMessage = 'Could not refresh tickers. Please try again.'
    });
  }

  private describeAddError(symbol: string, err: any): string {
    if (err?.status === 404) return `Could not find symbol ${symbol}.`;
    return `Could not add ${symbol}. Please try again.`;
  }
}
