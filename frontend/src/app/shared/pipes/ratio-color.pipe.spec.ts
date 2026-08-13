import { RatioColorPipe } from './ratio-color.pipe';

describe('RatioColorPipe', () => {
  const pipe = new RatioColorPipe();
  it('green when > 1', () => expect(pipe.transform(1.5)).toBe('green'));
  it('red when < 1', () => expect(pipe.transform(0.5)).toBe('red'));
  it('red when exactly 1 (not > 1)', () => expect(pipe.transform(1)).toBe('red'));
  it('none when undefined', () => expect(pipe.transform(undefined)).toBe('none'));
});
