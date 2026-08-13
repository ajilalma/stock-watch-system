import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortfolioRoutingModule } from './portfolio-routing.module';
import { PortfolioComponent } from './portfolio.component';
import { StockTableComponent } from '../shared/stock-table/stock-table.component';
import { MarginOfSafetyColorPipe } from '../shared/pipes/margin-of-safety-color.pipe';
import { PriceToBookColorPipe } from '../shared/pipes/price-to-book-color.pipe';
import { PegColorPipe } from '../shared/pipes/peg-color.pipe';
import { RatioColorPipe } from '../shared/pipes/ratio-color.pipe';
import { PayoutRatioColorPipe } from '../shared/pipes/payout-ratio-color.pipe';

@NgModule({
  declarations: [
    PortfolioComponent, StockTableComponent,
    MarginOfSafetyColorPipe, PriceToBookColorPipe, PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
  ],
  imports: [CommonModule, FormsModule, PortfolioRoutingModule]
})
export class PortfolioModule { }
