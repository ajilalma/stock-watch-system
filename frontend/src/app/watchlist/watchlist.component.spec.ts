import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { WatchlistComponent } from './watchlist.component';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

const sampleTickers: Ticker[] = [
  { _id: '1', symbol: 'RELIANCE.NS', companyName: 'Reliance Industries', sector: 'Energy', exchange: 'NSE', country: 'IN', nativeCurrency: 'INR', lists: ['watchlist'] }
];

describe('WatchlistComponent', () => {
  let fixture: ComponentFixture<WatchlistComponent>;
  let component: WatchlistComponent;
  let apiSpy: {
    getWatchlist: ReturnType<typeof vi.fn>;
    addToWatchlist: ReturnType<typeof vi.fn>;
    removeFromWatchlist: ReturnType<typeof vi.fn>;
    refreshOne: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    apiSpy = {
      getWatchlist: vi.fn(),
      addToWatchlist: vi.fn(),
      removeFromWatchlist: vi.fn(),
      refreshOne: vi.fn(),
    };
    apiSpy.getWatchlist.mockReturnValue(of(sampleTickers));

    TestBed.configureTestingModule({
      declarations: [WatchlistComponent],
      providers: [{ provide: StockApiService, useValue: apiSpy }],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(WatchlistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the watchlist on init', () => {
    expect(apiSpy.getWatchlist).toHaveBeenCalled();
    expect(component.tickers).toEqual(sampleTickers);
  });

  it('isLoading is false once the initial load resolves', () => {
    expect(component.isLoading).toBe(false);
  });

  it('isLoading does not flip back to true on a subsequent reload (e.g. after onRemove)', () => {
    apiSpy.removeFromWatchlist.mockReturnValue(of(undefined));
    component.onRemove('RELIANCE.NS');
    expect(component.isLoading).toBe(false);
  });

  it('addTicker calls addToWatchlist and reloads the list', () => {
    apiSpy.addToWatchlist.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = 'SHOP.TO';
    component.addTicker();
    expect(apiSpy.addToWatchlist).toHaveBeenCalledWith('SHOP.TO');
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });

  it('onRemove calls removeFromWatchlist and reloads the list', () => {
    apiSpy.removeFromWatchlist.mockReturnValue(of(undefined));
    component.onRemove('RELIANCE.NS');
    expect(apiSpy.removeFromWatchlist).toHaveBeenCalledWith('RELIANCE.NS');
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });

  it('onRefreshOne calls refreshOne with the given symbol and reloads the list', () => {
    apiSpy.refreshOne.mockReturnValue(of(sampleTickers[0]));
    component.onRefreshOne('RELIANCE.NS');
    expect(apiSpy.refreshOne).toHaveBeenCalledWith('RELIANCE.NS');
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });

  it('onRefreshOne sets errorMessage when the refresh call fails', () => {
    apiSpy.refreshOne.mockReturnValue(throwError(() => new Error('rate limited')));
    component.onRefreshOne('RELIANCE.NS');
    expect(component.errorMessage).toContain('RELIANCE.NS');
  });

  it('addTicker trims whitespace and uppercases the symbol before calling the API', () => {
    apiSpy.addToWatchlist.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = '  aapl  ';
    component.addTicker();
    expect(apiSpy.addToWatchlist).toHaveBeenCalledWith('AAPL');
  });

  it('sets errorMessage with a distinct message on a 404 (symbol not found)', () => {
    apiSpy.addToWatchlist.mockReturnValue(throwError(() => ({ status: 404 })));
    component.newSymbol = 'ZZZZINVALID123';
    component.addTicker();
    expect(component.errorMessage).toContain('ZZZZINVALID123');
  });

  it('sets errorMessage on a generic addToWatchlist failure instead of failing silently', () => {
    apiSpy.addToWatchlist.mockReturnValue(throwError(() => ({ status: 500 })));
    component.newSymbol = 'AAPL';
    component.addTicker();
    expect(component.errorMessage).toBeTruthy();
  });

  it('sets errorMessage when the initial watchlist load fails', () => {
    apiSpy.getWatchlist.mockReturnValue(throwError(() => new Error('network down')));
    component['load']();
    expect(component.errorMessage).toBeTruthy();
  });
});
