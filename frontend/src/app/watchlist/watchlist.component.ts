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

  constructor(private api: StockApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.getWatchlist().subscribe({
      next: tickers => {
        this.tickers = tickers;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Could not load your watchlist. Please try again.';
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

  onRefreshSelected(symbols: string[]): void {
    this.errorMessage = null;
    this.api.refreshMany(symbols).subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = 'Could not refresh the selected tickers. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  onRefreshAll(): void {
    this.errorMessage = null;
    this.api.refreshAll().subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = 'Could not refresh tickers. Please try again.';
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
