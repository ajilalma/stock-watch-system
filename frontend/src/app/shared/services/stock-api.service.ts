import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Ticker } from '../models/ticker.model';

@Injectable({ providedIn: 'root' })
export class StockApiService {
  constructor(private http: HttpClient) {}

  getPortfolio(): Observable<Ticker[]> {
    return this.http.get<Ticker[]>('/api/portfolio');
  }

  getWatchlist(): Observable<Ticker[]> {
    return this.http.get<Ticker[]>('/api/watchlist');
  }

  addToPortfolio(symbol: string): Observable<Ticker> {
    return this.http.post<Ticker>(`/api/portfolio/${symbol}`, {});
  }

  removeFromPortfolio(symbol: string): Observable<void> {
    return this.http.delete<void>(`/api/portfolio/${symbol}`);
  }

  addToWatchlist(symbol: string): Observable<Ticker> {
    return this.http.post<Ticker>(`/api/watchlist/${symbol}`, {});
  }

  removeFromWatchlist(symbol: string): Observable<void> {
    return this.http.delete<void>(`/api/watchlist/${symbol}`);
  }

  refreshOne(symbol: string): Observable<Ticker> {
    return this.http.post<Ticker>(`/api/tickers/${symbol}/refresh`, {});
  }

  refreshMany(symbols: string[]): Observable<Ticker[]> {
    return this.http.post<Ticker[]>('/api/tickers/refresh', { symbols });
  }

  refreshAll(): Observable<Ticker[]> {
    return this.http.post<Ticker[]>('/api/tickers/refresh-all', {});
  }
}
