import { Component, OnInit } from '@angular/core';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

@Component({
  selector: 'app-portfolio',
  templateUrl: './portfolio.component.html'
})
export class PortfolioComponent implements OnInit {
  tickers: Ticker[] = [];
  newSymbol = '';

  constructor(private api: StockApiService) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.getPortfolio().subscribe(tickers => this.tickers = tickers);
  }

  addTicker(): void {
    if (!this.newSymbol) return;
    this.api.addToPortfolio(this.newSymbol).subscribe(() => {
      this.newSymbol = '';
      this.load();
    });
  }

  onRemove(symbol: string): void {
    this.api.removeFromPortfolio(symbol).subscribe(() => this.load());
  }

  onRefreshSelected(symbols: string[]): void {
    this.api.refreshMany(symbols).subscribe(() => this.load());
  }

  onRefreshAll(): void {
    this.api.refreshAll().subscribe(() => this.load());
  }
}
