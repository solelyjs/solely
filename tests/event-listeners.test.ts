import { describe, it, expect } from 'vitest';
import listeners from '../src/shared/event-listeners';

describe('utils/event-listeners', () => {
  it('contains common DOM event handler names', () => {
    expect(listeners.has('onclick')).toBe(true);
    expect(listeners.has('onkeyup')).toBe(true);
    expect(listeners.has('oninput')).toBe(true);
    expect(listeners.has('onsubmit')).toBe(true);
  });

  it('does not contain invalid entries', () => {
    expect(listeners.has('onfoobar')).toBe(false);
    expect(listeners.has('')).toBe(false);
  });

  it('has no duplicates', () => {
    // listeners is already a Set, so no need to convert
    expect(listeners.size).toBe(62); // Verify the Set size is as expected
  });
});