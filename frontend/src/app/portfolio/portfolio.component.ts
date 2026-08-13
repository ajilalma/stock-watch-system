import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
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
  isLoading = false;

  constructor(private api: StockApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading = true;
    this.api.getPortfolio().subscribe({
      next: tickers => {
        this.tickers = tickers;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Could not load your portfolio. Please try again.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
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
        this.cdr.detectChanges();
      }
    });
  }

  onRemove(symbol: string): void {
    this.errorMessage = null;
    this.api.removeFromPortfolio(symbol).subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = `Could not remove ${symbol}. Please try again.`;
        this.cdr.detectChanges();
      }
    });
  }

  onRefreshOne(symbol: string): void {
    this.errorMessage = null;
    this.api.refreshOne(symbol).subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = `Could not refresh ${symbol}. Please try again.`;
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
