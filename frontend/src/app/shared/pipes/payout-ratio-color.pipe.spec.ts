import { PayoutRatioColorPipe } from './payout-ratio-color.pipe';

describe('PayoutRatioColorPipe', () => {
  const pipe = new PayoutRatioColorPipe();
  it('green when 0-50%', () => expect(pipe.transform(0.5)).toBe('green'));
  it('yellow when 50-80%', () => expect(pipe.transform(0.8)).toBe('yellow'));
  it('red when > 80%', () => expect(pipe.transform(0.81)).toBe('red'));
  it('none when undefined', () => expect(pipe.transform(undefined)).toBe('none'));
});
