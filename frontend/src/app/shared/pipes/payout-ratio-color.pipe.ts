import { Pipe, PipeTransform } from '@angular/core';
import { ColorLevel } from './margin-of-safety-color.pipe';

@Pipe({ name: 'payoutRatioColor', standalone: false })
export class PayoutRatioColorPipe implements PipeTransform {
  transform(value: number | undefined): ColorLevel {
    if (value === undefined) return 'none';
    if (value <= 0.50) return 'green';
    if (value <= 0.80) return 'yellow';
    return 'red';
  }
}
