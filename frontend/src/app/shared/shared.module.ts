import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StockTableComponent } from './stock-table/stock-table.component';
import { MarginOfSafetyColorPipe } from './pipes/margin-of-safety-color.pipe';
import { PriceToBookColorPipe } from './pipes/price-to-book-color.pipe';
import { PegColorPipe } from './pipes/peg-color.pipe';
import { RatioColorPipe } from './pipes/ratio-color.pipe';
import { PayoutRatioColorPipe } from './pipes/payout-ratio-color.pipe';

@NgModule({
  declarations: [
    StockTableComponent,
    MarginOfSafetyColorPipe, PriceToBookColorPipe, PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
  ],
  imports: [CommonModule, FormsModule],
  exports: [
    StockTableComponent,
    MarginOfSafetyColorPipe, PriceToBookColorPipe, PegColorPipe, RatioColorPipe, PayoutRatioColorPipe
  ]
})
export class SharedModule { }
