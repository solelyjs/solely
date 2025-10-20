// tests/observe.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { observe } from '../src/utils/observe';

// Mock setTimeout for controlling async behavior
vi.useFakeTimers();

// 安全 stringify，支持循环引用
function safeStringify(obj: any) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
        }
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
            { filter: ['b.**', 'arr[*]'], throttle: 20 } // ** 支持深层匹配
        );

        proxy.a = 10; // 不应触发
        proxy.b.c = 20;
        proxy.b.d.e = 30;
        proxy.arr[0] = 100;
        proxy.arr.push(4);

        vi.advanceTimersByTime(200);
        // console.log(changes);

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

        proxy.b = { c: 2, d: { e: 3 } }; // 深比较相同，不触发
        proxy.b.c = 20; // 触发
        proxy.arr = [1, 2, 3]; // 深比较相同，不触发
        proxy.arr.push(4); // 触发

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
        unobserve(); // 重复调用
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

        expect(changes).toHaveLength(10); // 仅包含 initial immediate 触发的 10 次回调

        proxy.a = 10;
        vi.advanceTimersByTime(200);

        expect(changes).toContain('Change at a: 1 -> 10');
        unobserve();
    });
});

// 恢复真实定时器
afterAll(() => {
    vi.useRealTimers();
});
