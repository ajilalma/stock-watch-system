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
