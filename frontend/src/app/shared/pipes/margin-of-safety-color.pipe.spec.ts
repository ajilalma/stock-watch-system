import { MarginOfSafetyColorPipe } from './margin-of-safety-color.pipe';

describe('MarginOfSafetyColorPipe', () => {
  const pipe = new MarginOfSafetyColorPipe();
  it('green when price is >=20% below fair value', () => {
    expect(pipe.transform(80, 100)).toBe('green'); // 20% below
  });
  it('yellow when price is within +-20% of fair value', () => {
    expect(pipe.transform(95, 100)).toBe('yellow');
  });
  it('red when price is more than 20% above fair value', () => {
    expect(pipe.transform(130, 100)).toBe('red');
  });
  it('none when either value is undefined', () => {
    expect(pipe.transform(undefined, 100)).toBe('none');
  });
  it('none when fairValue is zero', () => {
    expect(pipe.transform(80, 0)).toBe('none');
  });
  it('none when fairValue is negative (e.g. a cash-flow-negative DCF result), not green', () => {
    expect(pipe.transform(80, -50)).toBe('none');
  });
});
