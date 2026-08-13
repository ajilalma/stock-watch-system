import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { PortfolioComponent } from './portfolio.component';
import { StockApiService } from '../shared/services/stock-api.service';
import { Ticker } from '../shared/models/ticker.model';

const sampleTickers: Ticker[] = [
  { _id: '1', symbol: 'AAPL', companyName: 'Apple', sector: 'Technology', exchange: 'NASDAQ', country: 'US', nativeCurrency: 'USD', lists: ['portfolio'] }
];

describe('PortfolioComponent', () => {
  let fixture: ComponentFixture<PortfolioComponent>;
  let component: PortfolioComponent;
  let apiSpy: {
    getPortfolio: ReturnType<typeof vi.fn>;
    addToPortfolio: ReturnType<typeof vi.fn>;
    removeFromPortfolio: ReturnType<typeof vi.fn>;
    refreshOne: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    apiSpy = {
      getPortfolio: vi.fn(),
      addToPortfolio: vi.fn(),
      removeFromPortfolio: vi.fn(),
      refreshOne: vi.fn(),
    };
    apiSpy.getPortfolio.mockReturnValue(of(sampleTickers));

    TestBed.configureTestingModule({
      declarations: [PortfolioComponent],
      providers: [{ provide: StockApiService, useValue: apiSpy }],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(PortfolioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the portfolio list on init', () => {
    expect(apiSpy.getPortfolio).toHaveBeenCalled();
    expect(component.tickers).toEqual(sampleTickers);
  });

  it('isLoading is false once the initial load resolves', () => {
    expect(component.isLoading).toBe(false);
  });

  it('isLoading does not flip back to true on a subsequent reload (e.g. after onRemove)', () => {
    apiSpy.removeFromPortfolio.mockReturnValue(of(undefined));
    component.onRemove('AAPL');
    expect(component.isLoading).toBe(false);
  });

  it('addTicker calls addToPortfolio and reloads the list', () => {
    apiSpy.addToPortfolio.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = 'MSFT';
    component.addTicker();
    expect(apiSpy.addToPortfolio).toHaveBeenCalledWith('MSFT');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRemove calls removeFromPortfolio and reloads the list', () => {
    apiSpy.removeFromPortfolio.mockReturnValue(of(undefined));
    component.onRemove('AAPL');
    expect(apiSpy.removeFromPortfolio).toHaveBeenCalledWith('AAPL');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRefreshOne calls refreshOne with the given symbol and reloads the list', () => {
    apiSpy.refreshOne.mockReturnValue(of(sampleTickers[0]));
    component.onRefreshOne('AAPL');
    expect(apiSpy.refreshOne).toHaveBeenCalledWith('AAPL');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRefreshOne sets errorMessage when the refresh call fails', () => {
    apiSpy.refreshOne.mockReturnValue(throwError(() => new Error('rate limited')));
    component.onRefreshOne('AAPL');
    expect(component.errorMessage).toContain('AAPL');
  });

  it('addTicker trims whitespace and uppercases the symbol before calling the API', () => {
    apiSpy.addToPortfolio.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = '  shop.to  ';
    component.addTicker();
    expect(apiSpy.addToPortfolio).toHaveBeenCalledWith('SHOP.TO');
  });

  it('sets errorMessage with a distinct message on a 404 (symbol not found)', () => {
    apiSpy.addToPortfolio.mockReturnValue(throwError(() => ({ status: 404 })));
    component.newSymbol = 'ZZZZINVALID123';
    component.addTicker();
    expect(component.errorMessage).toContain('ZZZZINVALID123');
  });

  it('sets errorMessage on a generic addToPortfolio failure instead of failing silently', () => {
    apiSpy.addToPortfolio.mockReturnValue(throwError(() => ({ status: 500 })));
    component.newSymbol = 'AAPL';
    component.addTicker();
    expect(component.errorMessage).toBeTruthy();
  });

  it('sets errorMessage when the initial portfolio load fails', () => {
    apiSpy.getPortfolio.mockReturnValue(throwError(() => new Error('network down')));
    component['load']();
    expect(component.errorMessage).toBeTruthy();
  });

  it('clears errorMessage on a subsequent successful add', () => {
    component.errorMessage = 'stale error';
    apiSpy.addToPortfolio.mockReturnValue(of(sampleTickers[0]));
    component.newSymbol = 'MSFT';
    component.addTicker();
    expect(component.errorMessage).toBeNull();
  });
});
