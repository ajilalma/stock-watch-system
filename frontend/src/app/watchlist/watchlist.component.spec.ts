import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { of } from 'rxjs';
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
    refreshMany: ReturnType<typeof vi.fn>;
    refreshAll: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    apiSpy = {
      getWatchlist: vi.fn(),
      addToWatchlist: vi.fn(),
      removeFromWatchlist: vi.fn(),
      refreshOne: vi.fn(),
      refreshMany: vi.fn(),
      refreshAll: vi.fn(),
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

  it('onRefreshAll calls refreshAll and reloads the list', () => {
    apiSpy.refreshAll.mockReturnValue(of(sampleTickers));
    component.onRefreshAll();
    expect(apiSpy.refreshAll).toHaveBeenCalled();
    expect(apiSpy.getWatchlist).toHaveBeenCalledTimes(2);
  });
});
