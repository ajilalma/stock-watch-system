import { Pipe, PipeTransform } from '@angular/core';

export type ColorLevel = 'green' | 'yellow' | 'red' | 'none';

@Pipe({ name: 'marginOfSafetyColor', standalone: false })
export class MarginOfSafetyColorPipe implements PipeTransform {
  transform(currentPrice: number | undefined, fairValue: number | undefined): ColorLevel {
    if (currentPrice === undefined || fairValue === undefined || fairValue <= 0) return 'none';
    const percentDiff = (currentPrice - fairValue) / fairValue; // negative = below fair value
    if (percentDiff <= -0.20) return 'green';
    if (percentDiff > 0.20) return 'red';
    return 'yellow';
  }
}
