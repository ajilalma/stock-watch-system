import { Component, OnInit } from '@angular/core';
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

  constructor(private api: StockApiService) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.getPortfolio().subscribe({
      next: tickers => this.tickers = tickers,
      error: () => this.errorMessage = 'Could not load your portfolio. Please try again.'
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
      }
    });
  }

  onRemove(symbol: string): void {
    this.errorMessage = null;
    this.api.removeFromPortfolio(symbol).subscribe({
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
    if (err?.name === 'TimeoutError') return `Adding ${symbol} is taking too long (Yahoo Finance may be rate-limiting). Please wait a bit and try again.`;
    if (err?.status === 404) return `Could not find symbol ${symbol}.`;
    return `Could not add ${symbol}. Please try again.`;
  }
}
