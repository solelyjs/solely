import { describe, it, expect } from 'vitest';
import { createFunction } from '../src/shared/functions';

describe('utils/functions.createFunction', () => {
  it('creates a working function', () => {
    const fn = createFunction<[number, number]>(['a', 'b', 'return a + b']);

    expect(fn(2, 3)).toBe(5);
    expect(fn(10, 5)).toBe(15);
  });

  it('creates new function instance each time', () => {
    const fn1 = createFunction<[number, number]>(['a', 'b', 'return a + b']);
    const fn2 = createFunction<[number, number]>(['a', 'b', 'return a + b']);

    // 每次调用创建新实例
    expect(fn1).not.toBe(fn2);
    // 但功能相同
    expect(fn1(2, 3)).toBe(fn2(2, 3));
  });

  it('throws when function body is empty', () => {
    expect(() => createFunction(['x', ''])).toThrow(/Function body cannot be empty/);
  });

  it('supports different arg lists producing different functions', () => {
    const add = createFunction<[number, number]>(['a', 'b', 'return a + b']);
    const mul = createFunction<[number, number]>(['a', 'b', 'return a * b']);
    expect(add).not.toBe(mul);
    expect(add(3, 4)).toBe(7);
    expect(mul(3, 4)).toBe(12);
  });

  it('allows developer to use any code in function body', () => {
    // 开发者可以自由编写代码，不受限制
    const fn1 = createFunction(['x', 'return eval(x)']); // eval 可以被使用
    const fn2 = createFunction(['x', 'return Function(x)()']); // Function 可以被使用
    const fn3 = createFunction(['x', 'return process']); // process 可以被使用
    
    // 这些函数应该能正常创建（虽然实际执行可能因环境而异）
    expect(typeof fn1).toBe('function');
    expect(typeof fn2).toBe('function');
    expect(typeof fn3).toBe('function');
  });
});
