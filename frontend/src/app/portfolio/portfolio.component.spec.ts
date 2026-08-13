import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { of } from 'rxjs';
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
    refreshMany: ReturnType<typeof vi.fn>;
    refreshAll: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    apiSpy = {
      getPortfolio: vi.fn(),
      addToPortfolio: vi.fn(),
      removeFromPortfolio: vi.fn(),
      refreshOne: vi.fn(),
      refreshMany: vi.fn(),
      refreshAll: vi.fn(),
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

  it('onRefreshAll calls refreshAll and reloads the list', () => {
    apiSpy.refreshAll.mockReturnValue(of(sampleTickers));
    component.onRefreshAll();
    expect(apiSpy.refreshAll).toHaveBeenCalled();
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });
});
