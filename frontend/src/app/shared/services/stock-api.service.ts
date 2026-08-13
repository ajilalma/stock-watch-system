import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { Ticker } from '../models/ticker.model';

// Add/refresh calls fetch live data from Yahoo Finance (cookie + crumb
// handshake, possible upstream rate-limit retries), so this is generous
// relative to a typical API call - it exists so the UI can never hang
// forever waiting for a response that never arrives.
const REQUEST_TIMEOUT_MS = 45_000;

@Injectable({ providedIn: 'root' })
export class StockApiService {
  constructor(private http: HttpClient) {}

  getPortfolio(): Observable<Ticker[]> {
    return this.http.get<Ticker[]>('/api/portfolio').pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  getWatchlist(): Observable<Ticker[]> {
    return this.http.get<Ticker[]>('/api/watchlist').pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  addToPortfolio(symbol: string): Observable<Ticker> {
    return this.http.post<Ticker>(`/api/portfolio/${encodeURIComponent(symbol)}`, {}).pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  removeFromPortfolio(symbol: string): Observable<void> {
    return this.http.delete<void>(`/api/portfolio/${encodeURIComponent(symbol)}`).pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  addToWatchlist(symbol: string): Observable<Ticker> {
    return this.http.post<Ticker>(`/api/watchlist/${encodeURIComponent(symbol)}`, {}).pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  removeFromWatchlist(symbol: string): Observable<void> {
    return this.http.delete<void>(`/api/watchlist/${encodeURIComponent(symbol)}`).pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  refreshOne(symbol: string): Observable<Ticker> {
    return this.http.post<Ticker>(`/api/tickers/${encodeURIComponent(symbol)}/refresh`, {}).pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  refreshMany(symbols: string[]): Observable<Ticker[]> {
    return this.http.post<Ticker[]>('/api/tickers/refresh', { symbols }).pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  refreshAll(): Observable<Ticker[]> {
    return this.http.post<Ticker[]>('/api/tickers/refresh-all', {}).pipe(timeout(REQUEST_TIMEOUT_MS));
  }
}
