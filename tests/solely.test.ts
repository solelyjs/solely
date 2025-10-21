import { describe, it, expect } from 'vitest';
import * as solely from '../src/solely';

describe('src/solely re-exports', () => {
  it('exposes utils and base exports', () => {
    expect(typeof solely.parseHtml).toBe('function');
    expect(typeof solely.patch).toBe('function');
    expect(typeof solely.BaseElement).toBe('function');
    expect(typeof solely.RouterViewElement).toBe('function');
  });
});