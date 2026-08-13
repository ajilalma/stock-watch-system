import { Pipe, PipeTransform } from '@angular/core';
import { ColorLevel } from './margin-of-safety-color.pipe';

@Pipe({ name: 'priceToBookColor' })
export class PriceToBookColorPipe implements PipeTransform {
  transform(value: number | undefined): ColorLevel {
    if (value === undefined) return 'none';
    if (value <= 1) return 'green';
    if (value <= 3) return 'yellow';
    return 'red';
  }
}
