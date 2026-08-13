import { PegColorPipe } from './peg-color.pipe';

describe('PegColorPipe', () => {
  const pipe = new PegColorPipe();
  it('green when <= 1', () => expect(pipe.transform(1)).toBe('green'));
  it('yellow when <= 2', () => expect(pipe.transform(2)).toBe('yellow'));
  it('red when > 2', () => expect(pipe.transform(2.1)).toBe('red'));
  it('none when undefined', () => expect(pipe.transform(undefined)).toBe('none'));
});
