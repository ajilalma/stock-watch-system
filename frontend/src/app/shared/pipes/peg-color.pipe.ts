import { Pipe, PipeTransform } from '@angular/core';
import { ColorLevel } from './margin-of-safety-color.pipe';

@Pipe({ name: 'pegColor', standalone: false })
export class PegColorPipe implements PipeTransform {
  transform(value: number | undefined): ColorLevel {
    if (value === undefined) return 'none';
    if (value <= 1) return 'green';
    if (value <= 2) return 'yellow';
    return 'red';
  }
}
