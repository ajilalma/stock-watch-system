import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WatchlistRoutingModule } from './watchlist-routing.module';
import { WatchlistComponent } from './watchlist.component';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [
    WatchlistComponent
  ],
  imports: [CommonModule, FormsModule, WatchlistRoutingModule, SharedModule]
})
export class WatchlistModule { }
