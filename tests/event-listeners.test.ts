import { describe, it, expect } from 'vitest';
import listeners from '../src/utils/event-listeners';

describe('utils/event-listeners', () => {
  it('contains common DOM event handler names', () => {
    expect(listeners).toContain('onclick');
    expect(listeners).toContain('onkeyup');
    expect(listeners).toContain('oninput');
    expect(listeners).toContain('onsubmit');
  });

  it('does not contain invalid entries', () => {
    expect(listeners).not.toContain('onfoobar');
    expect(listeners).not.toContain('');
  });

  it('has no duplicates', () => {
    const set = new Set(listeners);
    expect(set.size).toBe(listeners.length);
  });
});