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

  it('sectors are expanded by default', () => {
    expect(component.isCollapsed('Energy')).toBe(false);
    expect(component.isCollapsed('Technology')).toBe(false);
  });

  it('toggleSector collapses and re-expands a single sector', () => {
    component.toggleSector('Technology');
    expect(component.isCollapsed('Technology')).toBe(true);
    expect(component.isCollapsed('Energy')).toBe(false);

    component.toggleSector('Technology');
    expect(component.isCollapsed('Technology')).toBe(false);
  });

  it('collapseAll collapses every sector present in the current tickers', () => {
    component.collapseAll();
    expect(component.isCollapsed('Energy')).toBe(true);
    expect(component.isCollapsed('Technology')).toBe(true);
  });

  it('expandAll clears all collapsed sectors', () => {
    component.collapseAll();
    component.expandAll();
    expect(component.isCollapsed('Energy')).toBe(false);
    expect(component.isCollapsed('Technology')).toBe(false);
  });

  it('onRefreshClick emits the given symbol on refreshOne', () => {
    const emitted: string[] = [];
    component.refreshOne.subscribe((symbol: string) => emitted.push(symbol));
    component.onRefreshClick('AAA');
    expect(emitted).toEqual(['AAA']);
  });

  it('onRemoveClick emits the given symbol on remove', () => {
    const emitted: string[] = [];
    component.remove.subscribe((symbol: string) => emitted.push(symbol));
    component.onRemoveClick('AAA');
    expect(emitted).toEqual(['AAA']);
  });

  it('onRefreshClick sets refreshingSymbol to the clicked symbol', () => {
    component.onRefreshClick('AAA');
    expect(component.refreshingSymbol).toBe('AAA');
  });

  it('isRefreshing returns true only for the currently refreshing symbol', () => {
    component.onRefreshClick('AAA');
    expect(component.isRefreshing('AAA')).toBe(true);
    expect(component.isRefreshing('BBB')).toBe(false);
  });

  it('ngOnChanges clears refreshingSymbol when tickers changes', () => {
    component.onRefreshClick('AAA');
    expect(component.refreshingSymbol).toBe('AAA');
    component.ngOnChanges({ tickers: {} as any });
    expect(component.refreshingSymbol).toBeNull();
  });

  it('ngOnChanges prunes a collapsed sector once it no longer appears in tickers, leaving other collapsed sectors intact', () => {
    component.toggleSector('Technology');
    component.toggleSector('Energy');
    expect(component.isCollapsed('Technology')).toBe(true);
    expect(component.isCollapsed('Energy')).toBe(true);

    component.tickers = tickers.filter(t => t.sector !== 'Technology');
    component.ngOnChanges({ tickers: {} as any });

    expect(component.isCollapsed('Technology')).toBe(false);
    expect(component.isCollapsed('Energy')).toBe(true);
  });
});
