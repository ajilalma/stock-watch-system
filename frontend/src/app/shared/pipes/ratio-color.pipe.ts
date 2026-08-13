import { Pipe, PipeTransform } from '@angular/core';
import { ColorLevel } from './margin-of-safety-color.pipe';

@Pipe({ name: 'ratioColor' })
export class RatioColorPipe implements PipeTransform {
  transform(value: number | undefined): ColorLevel {
    if (value === undefined) return 'none';
    return value > 1 ? 'green' : 'red';
  }
}
