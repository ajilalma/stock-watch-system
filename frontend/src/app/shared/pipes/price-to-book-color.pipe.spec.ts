import { PriceToBookColorPipe } from './price-to-book-color.pipe';

describe('PriceToBookColorPipe', () => {
  const pipe = new PriceToBookColorPipe();
  it('green when <= 1', () => expect(pipe.transform(1)).toBe('green'));
  it('yellow when <= 3', () => expect(pipe.transform(3)).toBe('yellow'));
  it('red when > 3', () => expect(pipe.transform(3.1)).toBe('red'));
  it('none when undefined', () => expect(pipe.transform(undefined)).toBe('none'));
});
