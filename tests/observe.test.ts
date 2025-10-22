import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { observe } from '../src/utils/observe';

// Mock setTimeout for controlling async behavior
vi.useFakeTimers();

// 安全 stringify，支持循环引用
function safeStringify(obj: any) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
        }
        // 特殊类型处理
        if (value instanceof RegExp) return value.toString();
        if (value instanceof Date) return value.toISOString();
        if (value instanceof Map) return Object.fromEntries(value);
        if (value instanceof Set) return Array.from(value);
        return value;
    });
}

describe('observe function', () => {
    let obj: any;
    let changes: string[];
    let batchChanges: string[];

    beforeEach(() => {
        obj = {
            a: 1,
            b: { c: 2, d: { e: 3 } },
            arr: [1, 2, 3],
            circular: {} as any,
        };
        obj.circular = obj; // 循环引用

        changes = [];
        batchChanges = [];
        vi.clearAllTimers();
    });

    it('should handle basic property changes, nested objects, and array operations', async () => {
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 10, immediate: true }
        );

        expect(changes).toContain('Change at a: undefined -> 1');
        expect(changes).toContain('Change at b.c: undefined -> 2');
        expect(changes).toContain('Change at b.d.e: undefined -> 3');
        expect(changes).toContain('Change at arr: undefined -> [1,2,3]');

        proxy.a = 10;
        proxy.b.c = 20;
        proxy.arr.push(4);
        vi.advanceTimersByTime(10);
        proxy.arr.pop();

        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at a: 1 -> 10');
        expect(changes).toContain('Change at b.c: 2 -> 20');
        expect(changes).toContain('Change at arr: [1,2,3] -> [1,2,3,4]');
        expect(changes).toContain('Change at arr: [1,2,3,4] -> [1,2,3]');

        unobserve();
    });

    it('should respect path filters with * and [*]', async () => {
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { filter: ['b.**', 'arr[*]'], throttle: 20 }
        );

        proxy.a = 10;
        proxy.b.c = 20;
        proxy.b.d.e = 30;
        proxy.arr[0] = 100;
        proxy.arr.push(4);

        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at b.c: 2 -> 20');
        expect(changes).toContain('Change at b.d.e: 3 -> 30');
        expect(changes).toContain('Change at arr.0: 1 -> 100');
        expect(changes).toContain('Change at arr: [100,2,3] -> [100,2,3,4]');
        expect(changes).not.toContain(expect.stringContaining('Change at a'));

        unobserve();
    });

    it('should respect deepCompare option', async () => {
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { deepCompare: true, throttle: 100 }
        );

        proxy.b = { c: 2, d: { e: 3 } };
        proxy.b.c = 20;
        proxy.arr = [1, 2, 3];
        proxy.arr.push(4);

        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at b.c: 2 -> 20');
        expect(changes).toContain('Change at arr: [1,2,3] -> [1,2,3,4]');

        unobserve();
    });

    it('should call onBatch with batched changes', async () => {
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            {
                throttle: 100,
                onBatch: (batch) => {
                    batchChanges.push(
                        batch
                            .map((c) => `Batch change at ${c.path.join('.')}: ${safeStringify(c.oldValue)} -> ${safeStringify(c.newValue)}`)
                            .join('; ')
                    );
                },
            }
        );

        proxy.a = 10;
        proxy.b.c = 20;
        proxy.arr.push(4);

        vi.advanceTimersByTime(200);

        expect(batchChanges).toHaveLength(1);
        expect(batchChanges[0]).toContain('Batch change at a: 1 -> 10');
        expect(batchChanges[0]).toContain('Batch change at b.c: 2 -> 20');
        expect(batchChanges[0]).toContain('Batch change at arr: [1,2,3] -> [1,2,3,4]');

        unobserve();
    });

    it('should pause and resume observation', async () => {
        const { proxy, unobserve, resume } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 50 }
        );

        proxy.a = 10;
        proxy.b.c = 20;
        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at a: 1 -> 10');
        expect(changes).toContain('Change at b.c: 2 -> 20');

        unobserve();

        proxy.a = 100;
        proxy.b.c = 200;
        vi.advanceTimersByTime(200);

        expect(changes).not.toContain(expect.stringContaining('Change at a: 10 -> 100'));
        expect(changes).not.toContain(expect.stringContaining('Change at b.c: 20 -> 200'));

        resume();

        proxy.a = 101;
        proxy.b.c = 201;
        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at a: 100 -> 101');
        expect(changes).toContain('Change at b.c: 200 -> 201');
        expect(obj).toEqual({
            a: 101,
            b: { c: 201, d: { e: 3 } },
            arr: [1, 2, 3],
            circular: expect.anything(),
        });

        unobserve();
    });

    it('should handle rapid unobserve and resume', async () => {
        const { proxy, unobserve, resume } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 50 }
        );

        proxy.a = 10;
        vi.advanceTimersByTime(100);
        unobserve();
        resume();
        proxy.a = 11;
        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at a: 1 -> 10');
        expect(changes).toContain('Change at a: 10 -> 11');

        unobserve();
    });

    it('should handle circular references', async () => {
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { deepCompare: true, throttle: 100 }
        );

        proxy.circular.a = 10;
        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at circular.a: 1 -> 10');

        unobserve();
    });

    it('should handle large arrays efficiently', async () => {
        const largeObj = { arr: Array(1000).fill(0).map((_, i) => i) };
        const { proxy, unobserve } = observe(
            largeObj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 0 }
        );

        proxy.arr.push(1000);
        unobserve();
        proxy.arr.push(1001);
        vi.advanceTimersByTime(200);

        expect(changes.some(ch => ch.includes('Change at arr:') && ch.includes('1000'))).toBe(true);
        expect(changes.some(ch => ch.includes('1001'))).toBe(false);

        unobserve();
    });

    it('should handle repeated unobserve calls safely', async () => {
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 0 }
        );

        proxy.a = 10;
        unobserve();
        unobserve();
        proxy.a = 100;
        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at a: 1 -> 10');
        expect(changes).not.toContain(expect.stringContaining('Change at a: 10 -> 100'));

        unobserve();
    });

    it('should not re-trigger immediate on resume', async () => {
        const { proxy, unobserve, resume } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { immediate: true, throttle: 100 }
        );

        expect(changes).toContain('Change at a: undefined -> 1');

        unobserve();
        resume();

        expect(changes).toHaveLength(10);

        proxy.a = 10;
        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at a: 1 -> 10');
        unobserve();
    });

    it('should reuse proxy for the same object and handle circular references', () => {
        const { proxy, unobserve } = observe(
            obj,
            (_path, _newValue, _oldValue) => {
                // 不关心回调
            }
        );

        expect(proxy.b).toBe(proxy.b);
        expect(proxy.b.d).toBe(proxy.b.d);
        expect(proxy.arr).toBe(proxy.arr);
        expect(proxy.circular).toBe(proxy);
        expect(proxy.circular.circular).toBe(proxy);
        expect(proxy.circular.b).toBe(proxy.b);

        unobserve();
    });

    it('should handle array splice, sort, reverse, shift, unshift correctly', () => {
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 0 }
        );

        proxy.arr.splice(1, 1, 99, 100);
        proxy.arr.sort((a: number, b: number) => b - a);
        proxy.arr.reverse();
        proxy.arr.shift();
        proxy.arr.unshift(200, 201);

        expect(changes.some(ch => ch.includes('Change at arr:'))).toBe(true);

        unobserve();
    });

    it('should handle Symbol properties', () => {
        const sym = Symbol('test');
        obj[sym] = { nested: 1 };

        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.map(p => p.toString()).join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 0 }
        );

        proxy[sym].nested = 2;

        expect(changes).toContain(`Change at ${sym.toString()}.nested: 1 -> 2`);
        expect(proxy[sym]).toBe(proxy[sym]);
        obj[sym].self = obj[sym];
        expect(proxy[sym].self).toBe(proxy[sym]);

        unobserve();
    });

    it('should handle nested array and circular references with correct paths and caching', () => {
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.map(p => p.toString()).join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 0, deepCompare: true }
        );

        proxy.arr[0] = 100;
        proxy.arr.push(4);
        proxy.circular.b.c = 200;

        expect(proxy.b).toBe(proxy.b);
        expect(proxy.circular).toBe(proxy);
        expect(proxy.circular.b).toBe(proxy.b);

        expect(changes).toContain('Change at arr.0: 1 -> 100');
        expect(changes).toContain('Change at arr: [100,2,3] -> [100,2,3,4]');
        expect(changes).toContain('Change at circular.b.c: 2 -> 200');

        unobserve();
    });

    it('should trigger callback on property deletion with correct path', () => {
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            }
        );

        delete proxy.a;
        delete proxy.b.d.e;
        proxy.arr.pop();

        expect(changes).toContain('Change at a: 1 -> undefined');
        expect(changes).toContain('Change at b.d.e: 3 -> undefined');
        expect(changes).toContain('Change at arr: [1,2,3] -> [1,2]');

        unobserve();
    });

    it('should handle empty objects and arrays', async () => {
        const emptyObj: any = {};
        const emptyArr: any[] = [];
        const changes: string[] = [];

        const { proxy: objProxy, unobserve: objUnobserve } = observe(
            emptyObj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 0 }
        );

        const { proxy: arrProxy, unobserve: arrUnobserve } = observe(
            emptyArr,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 0 }
        );

        objProxy.newProp = 1;
        arrProxy.push(1);

        expect(changes).toContain('Change at newProp: undefined -> 1');
        expect(changes).toContain('Change at : [] -> [1]');

        objUnobserve();
        arrUnobserve();
    });

    it('should handle invalid or empty filter patterns', async () => {
        const changes: string[] = [];
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { filter: ['', 'invalid.**', '**.invalid'], throttle: 0 }
        );

        proxy.a = 10;
        proxy.b.c = 20;
        proxy.arr.push(4);

        expect(changes).toContain('Change at a: 1 -> 10');
        expect(changes).toContain('Change at b.c: 2 -> 20');
        expect(changes).toContain('Change at arr: [1,2,3] -> [1,2,3,4]');

        unobserve();
    });

    it('should handle deepCompare with complex nested objects and special types safely', async () => {
        const complexObj: any = {
            date: new Date('2023-01-01'),
            regex: /test/,
            nested: { a: { b: 1 }, circular: null },
        };
        complexObj.nested.circular = complexObj; // 循环引用

        const changes: string[] = [];
        const { proxy, unobserve } = observe(
            complexObj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { deepCompare: true, throttle: 0 }
        );

        // 修改 Date / RegExp
        proxy.date = new Date('2023-01-02');
        proxy.regex = /new/;

        // 修改深层对象
        proxy.nested.a.b = 2;
        expect(changes).toContain(
            `Change at date: ${safeStringify(new Date('2023-01-01'))} -> ${safeStringify(new Date('2023-01-02'))}`
        );
        expect(changes).toContain('Change at regex: "/test/" -> "/new/"');
        expect(changes).toContain('Change at nested.a.b: 1 -> 2');

        // 循环引用不触发
        expect(changes).not.toContain(expect.stringContaining('Change at nested.circular'));

        unobserve();
    });

    it('should not call onBatch when no changes occur within throttle period', async () => {
        const batchChanges: string[] = [];
        const { proxy, unobserve } = observe(
            obj,
            () => { },
            {
                throttle: 100,
                onBatch: (batch) => {
                    batchChanges.push(
                        batch
                            .map((c) => `Batch change at ${c.path.join('.')}: ${safeStringify(c.oldValue)} -> ${safeStringify(c.newValue)}`)
                            .join('; ')
                    );
                },
            }
        );

        vi.advanceTimersByTime(200);

        expect(batchChanges).toHaveLength(0);

        proxy.a = 10;
        vi.advanceTimersByTime(200);

        expect(batchChanges).toHaveLength(1);
        expect(batchChanges[0]).toContain('Batch change at a: 1 -> 10');

        unobserve();
    });

    it('should handle rapid pause and resume cycles', async () => {
        const changes: string[] = [];
        const { proxy, unobserve, resume } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 50 }
        );

        // 第一次修改，触发回调
        proxy.a = 10;
        vi.advanceTimersByTime(100); // 触发 throttle
        expect(changes).toContain('Change at a: 1 -> 10');

        // 暂停监听
        unobserve();
        proxy.a = 20; // 不触发回调

        // 恢复监听
        resume();
        proxy.a = 30; // 触发回调
        vi.advanceTimersByTime(100);

        // 再暂停
        unobserve();
        proxy.a = 40; // 不触发回调

        // 恢复监听
        resume();
        proxy.a = 50; // 触发回调
        vi.advanceTimersByTime(100);

        expect(changes).toEqual([
            'Change at a: 1 -> 10',
            'Change at a: 20 -> 30',
            'Change at a: 40 -> 50'
        ]);
    });

    it('should handle non-object inputs gracefully', () => {
        const changes: string[] = [];
        const observeNonObject = (input: any) => {
            return observe(
                input,
                (path, newValue, oldValue) => {
                    changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
                },
                { throttle: 0 }
            );
        };

        const { proxy: nullProxy, unobserve: nullUnobserve } = observeNonObject(null);
        expect(nullProxy).toBe(null);

        const { proxy: undefinedProxy, unobserve: undefinedUnobserve } = observeNonObject(undefined);
        expect(undefinedProxy).toBe(undefined);

        const { proxy: numberProxy, unobserve: numberUnobserve } = observeNonObject(42);
        expect(numberProxy).toBe(42);

        nullUnobserve();
        undefinedUnobserve();
        numberUnobserve();
    });

    it('should handle deletion of Symbol properties', () => {
        const sym = Symbol('test');
        obj[sym] = { nested: 1 };

        const changes: string[] = [];
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.map(p => p.toString()).join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 0 }
        );

        delete proxy[sym].nested;
        delete proxy[sym];

        expect(changes).toContain(`Change at ${sym.toString()}.nested: 1 -> undefined`);
        expect(changes).toContain(`Change at ${sym.toString()}: ${safeStringify({ nested: undefined })} -> undefined`);

        unobserve();
    });

    it('should respect filter with immediate option', () => {
        const changes: string[] = [];
        const { proxy, unobserve } = observe(
            obj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { immediate: true, filter: ['b.**'], throttle: 0 }
        );

        expect(changes).toContain('Change at b.c: undefined -> 2');
        expect(changes).toContain('Change at b.d.e: undefined -> 3');
        expect(changes).not.toContain(expect.stringContaining('Change at a'));
        expect(changes).not.toContain(expect.stringContaining('Change at arr'));

        proxy.a = 10;
        proxy.b.c = 20;

        expect(changes).toContain('Change at b.c: 2 -> 20');
        expect(changes).not.toContain(expect.stringContaining('Change at a'));

        unobserve();
    });

    it('should handle deeply nested objects efficiently', () => {
        const deepObj: any = { root: {} };
        let current = deepObj.root;

        // 生成 100 层深度对象
        for (let i = 0; i < 100; i++) {
            current[`prop${i}`] = {};
            current = current[`prop${i}`];
        }

        // 给第三层赋初值，便于测试
        deepObj.root.prop0.prop1.prop2.value = 1;

        const changes: string[] = [];
        const { proxy, unobserve } = observe(
            deepObj,
            (path, newValue, oldValue) => {
                changes.push(`Change at ${path.join('.')}: ${safeStringify(oldValue)} -> ${safeStringify(newValue)}`);
            },
            { throttle: 0 }
        );

        // 修改第三层的 value
        proxy.root.prop0.prop1.prop2.value = 2;

        expect(changes).toContain('Change at root.prop0.prop1.prop2.value: 1 -> 2');

        unobserve();
    });


    it('should trigger both parent and child observers', () => {
        const state = {
            user: {
                name: 'Alice',
                address: {
                    city: 'Beijing'
                }
            }
        };

        const parentChanges: string[] = [];
        const childChanges: string[] = [];

        // 第一次 observe 父对象
        const { proxy: parentProxy } = observe(
            state,
            (path, newValue, _oldValue) => {
                parentChanges.push(`parent: ${path.join('.')} -> ${newValue}`);
            }
        );

        // 第二次 observe 子对象
        const { proxy: childProxy } = observe(
            parentProxy.user,
            (path, newValue, _oldValue) => {
                childChanges.push(`child: ${path.join('.')} -> ${newValue}`);
            }
        );

        // 修改子对象
        childProxy.address.city = 'Shanghai';

        // 修改父对象
        parentProxy.user.name = 'Bob';

        expect(childChanges).toContain('child: address.city -> Shanghai');
        expect(parentChanges).toContain('parent: user.address.city -> Shanghai');
        expect(parentChanges).toContain('parent: user.name -> Bob');
    });
});

// 恢复真实定时器
afterAll(() => {
    vi.useRealTimers();
});