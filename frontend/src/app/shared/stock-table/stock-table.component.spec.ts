import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { StockTableComponent } from './stock-table.component';
import { MarginOfSafetyColorPipe } from '../pipes/margin-of-safety-color.pipe';
import { PriceToBookColorPipe } from '../pipes/price-to-book-color.pipe';
import { PegColorPipe } from '../pipes/peg-color.pipe';
import { RatioColorPipe } from '../pipes/ratio-color.pipe';
import { PayoutRatioColorPipe } from '../pipes/payout-ratio-color.pipe';
import { Ticker } from '../models/ticker.model';

const tickers: Ticker[] = [
  { _id: '1', symbol: 'ZZZ', companyName: 'Zebra Co', sector: 'Energy', exchange: 'NYSE', country: 'US', nativeCurrency: 'USD', lists: ['portfolio'] },
  { _id: '2', symbol: 'AAA', companyName: 'Apex Inc', sector: 'Technology', exchange: 'NASDAQ', country: 'US', nativeCurrency: 'USD', lists: ['portfolio'] },
  { _id: '3', symbol: 'BBB', companyName: 'Beacon Ltd', sector: 'Technology', exchange: 'NASDAQ', country: 'US', nativeCurrency: 'USD', lists: ['portfolio'] }
];

describe('StockTableComponent', () => {
  let fixture: ComponentFixture<StockTableComponent>;
  let component: StockTableComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [
        StockTableComponent, MarginOfSafetyColorPipe, PriceToBookColorPipe,
        PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
      ]
    });
    fixture = TestBed.createComponent(StockTableComponent);
    component = fixture.componentInstance;
    component.tickers = tickers;
    fixture.detectChanges();
  });

  it('groups rows by sector, sorted by sector then company name', () => {
    const groups = component.groupedBySector();
    expect(groups.map(g => g.sector)).toEqual(['Energy', 'Technology']);
    expect(groups[1].tickers.map(t => t.companyName)).toEqual(['Apex Inc', 'Beacon Ltd']);
  });

  it('selecting all rows via toggleSelectAll checks every ticker', () => {
    component.toggleSelectAll(true);
    expect(component.selectedSymbols.size).toBe(3);
  });

  it('refreshSelected emits only the checked symbols', () => {
    const emitted: string[][] = [];
    component.refreshSelected.subscribe((symbols: string[]) => emitted.push(symbols));
    component.toggleRow('AAA', true);
    component.onRefreshSelectedClick();
    expect(emitted).toEqual([['AAA']]);
  });

  it('onRefreshAllClick emits refreshAll', () => {
    let called = false;
    component.refreshAllEmitter.subscribe(() => { called = true; });
    component.onRefreshAllClick();
    expect(called).toBe(true);
  });

  it('prunes selected symbols no longer present when tickers input changes', () => {
    component.toggleRow('ZZZ', true);
    component.toggleRow('AAA', true);
    expect(component.selectedSymbols.size).toBe(2);

    component.tickers = tickers.filter(t => t.symbol !== 'ZZZ');
    component.ngOnChanges({ tickers: {} as any });

    expect(component.selectedSymbols.has('ZZZ')).toBe(false);
    expect(component.selectedSymbols.has('AAA')).toBe(true);
    expect(component.selectedSymbols.size).toBe(1);
  });
});
