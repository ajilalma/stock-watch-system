import { ComponentFixture, TestBed } from '@angular/core/testing';
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
  let apiSpy: jasmine.SpyObj<StockApiService>;

  beforeEach(() => {
    apiSpy = jasmine.createSpyObj('StockApiService', [
      'getPortfolio', 'addToPortfolio', 'removeFromPortfolio', 'refreshOne', 'refreshMany', 'refreshAll'
    ]);
    apiSpy.getPortfolio.and.returnValue(of(sampleTickers));

    TestBed.configureTestingModule({
      declarations: [PortfolioComponent],
      providers: [{ provide: StockApiService, useValue: apiSpy }]
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
    apiSpy.addToPortfolio.and.returnValue(of(sampleTickers[0]));
    component.newSymbol = 'MSFT';
    component.addTicker();
    expect(apiSpy.addToPortfolio).toHaveBeenCalledWith('MSFT');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRemove calls removeFromPortfolio and reloads the list', () => {
    apiSpy.removeFromPortfolio.and.returnValue(of(undefined));
    component.onRemove('AAPL');
    expect(apiSpy.removeFromPortfolio).toHaveBeenCalledWith('AAPL');
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });

  it('onRefreshAll calls refreshAll and reloads the list', () => {
    apiSpy.refreshAll.and.returnValue(of(sampleTickers));
    component.onRefreshAll();
    expect(apiSpy.refreshAll).toHaveBeenCalled();
    expect(apiSpy.getPortfolio).toHaveBeenCalledTimes(2);
  });
});
