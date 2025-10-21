import { describe, it, expect } from 'vitest';
import { createFunction } from '../src/utils/functions';

describe('utils/functions.createFunction', () => {
  it('creates a working function and caches by args key', () => {
    const fn1 = createFunction<[number, number]>(['a', 'b', 'return a + b']);
    const fn2 = createFunction<[number, number]>(['a', 'b', 'return a + b']);

    expect(fn1(2, 3)).toBe(5);
    expect(fn2(10, 5)).toBe(15);
    // same instance from cache
    expect(fn1).toBe(fn2);
  });

  it('throws when function body is empty', () => {
    expect(() => createFunction(['x', ''])).toThrow(/Function body cannot be empty/);
  });

  it('rejects dangerous code: eval/Function/process/require', () => {
    expect(() => createFunction(['x', 'return eval("1+2")'])).toThrow(/dangerous code/);
    expect(() => createFunction(['x', 'return Function("return 1")()'])).toThrow(/dangerous code/);
    expect(() => createFunction(['x', 'return process.exit(0)'])).toThrow(/dangerous code/);
    expect(() => createFunction(['x', 'return require("fs")'])).toThrow(/dangerous code/);
  });

  it('supports different arg lists producing different cached functions', () => {
    const add = createFunction<[number, number]>(['a', 'b', 'return a + b']);
    const mul = createFunction<[number, number]>(['a', 'b', 'return a * b']);
    expect(add).not.toBe(mul);
    expect(add(3, 4)).toBe(7);
    expect(mul(3, 4)).toBe(12);
  });
});