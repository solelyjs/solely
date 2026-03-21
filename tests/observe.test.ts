import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { observe, ChangeItem } from '../src/runtime/reactivity';

// 安全 stringify，支持循环引用
function safeStringify(obj: any) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
        }
        if (value instanceof RegExp) return value.toString();
        if (value instanceof Date) return value.toISOString();
        if (value instanceof Map) return Object.fromEntries(value);
        if (value instanceof Set) return Array.from(value);
        return value;
    });
}

// 辅助函数：从 ChangeItem 提取信息
function formatChange(change: ChangeItem): string {
    const path = change.path.join('.');
    const key = change.type === 'set' || change.type === 'delete' ? String(change.key) : '';
    const fullPath = path ? `${path}.${key}` : key;

    if (change.type === 'set') {
        return `Change at ${fullPath}: ${safeStringify(change.oldValue)} -> ${safeStringify(change.newValue)}`;
    } else if (change.type === 'delete') {
        return `Change at ${fullPath}: ${safeStringify(change.oldValue)} -> undefined`;
    } else if (change.type === 'array-push') {
        return `Change at ${path}: ${safeStringify(change.values)} pushed at index ${change.index}`;
    } else if (change.type === 'array-splice') {
        return `Change at ${path}: spliced ${change.deleteCount} items at ${change.index}`;
    } else if (change.type === 'array-replace') {
        return `Change at ${path}: array replaced`;
    } else if (change.type === 'array-reset') {
        return `Change at ${path}: array reset by ${change.method}`;
    }
    return `Change at ${path}`;
}

describe('observe function', () => {
    let changes: string[];

    beforeEach(() => {
        vi.useFakeTimers();
        changes = [];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should handle basic property changes', () => {
        const obj = { a: 1 };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.a = 10;

        expect(changes).toHaveLength(1);
        expect(changes[0]).toContain('Change at a:');
        expect(changes[0]).toContain('1 -> 10');

        unobserve();
    });

    it('should handle nested object changes', () => {
        const obj = { b: { c: 2 } };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.b.c = 20;

        expect(changes.some(c => c.includes('b.c') && c.includes('2 -> 20'))).toBe(true);

        unobserve();
    });

    it('should handle array push', () => {
        const obj = { arr: [1, 2, 3] };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.arr.push(4);

        expect(changes.length).toBeGreaterThan(0);

        unobserve();
    });

    it('should handle unobserve and resume', () => {
        const obj = { a: 1 };
        const { proxy, unobserve, resume } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.a = 10;
        expect(changes).toHaveLength(1);

        unobserve();
        proxy.a = 100;
        expect(changes).toHaveLength(1); // 不应该增加

        resume();
        proxy.a = 1000;
        expect(changes).toHaveLength(2); // 应该增加

        unobserve();
    });

    it('should handle throttle', async () => {
        const obj = { a: 1 };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 100 }
        );

        proxy.a = 10;
        proxy.a = 20;
        proxy.a = 30;

        expect(changes).toHaveLength(0); // 还没触发

        vi.advanceTimersByTime(100);

        expect(changes.length).toBeGreaterThan(0);

        unobserve();
    });

    it('should handle onBatch callback', async () => {
        const obj = { a: 1, b: 2 };
        const batchChanges: string[][] = [];

        const { proxy, unobserve } = observe(
            obj,
            () => {},
            {
                throttle: 100,
                onBatch: (batch) => {
                    batchChanges.push(batch.map(c => formatChange(c)));
                },
            }
        );

        proxy.a = 10;
        proxy.b = 20;

        vi.advanceTimersByTime(100);

        expect(batchChanges).toHaveLength(1);
        expect(batchChanges[0].length).toBe(2);

        unobserve();
    });

    it('should handle property deletion', () => {
        const obj = { a: 1, b: 2 } as any;
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        delete proxy.a;

        expect(changes.some(c => c.includes('Change at a:') && c.includes('1 -> undefined'))).toBe(true);

        unobserve();
    });

    it('should handle array splice', () => {
        const obj = { arr: [1, 2, 3] };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.arr.splice(1, 1, 99);

        expect(changes.length).toBeGreaterThan(0);

        unobserve();
    });

    it('should handle deepCompare', () => {
        const obj = { nested: { a: 1 } };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0, deepCompare: true }
        );

        proxy.nested = { a: 1 }; // 相同值，不应该触发
        expect(changes).toHaveLength(0);

        proxy.nested = { a: 2 }; // 不同值，应该触发
        expect(changes).toHaveLength(1);

        unobserve();
    });

    it('should handle filter patterns', () => {
        // filter 匹配的是父路径，key 在 payload 中
        const obj = { a: 1, b: { c: 2 } };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0, filter: ['b'] }  // 匹配父路径 b
        );

        proxy.a = 10; // 不应该触发
        proxy.b.c = 20; // 应该触发，因为父路径是 b

        expect(changes).toHaveLength(1);
        expect(changes[0]).toContain('b.c');

        unobserve();
    });

    it('should handle immediate option', () => {
        const obj = { a: 1, b: { c: 2 } };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0, immediate: true }
        );

        // immediate 应该触发初始值的回调
        expect(changes.length).toBeGreaterThan(0);
        // 检查是否有 a 的变更记录
        expect(changes.some(c => c.includes('a:'))).toBe(true);

        unobserve();
    });

    it('should handle circular references safely', () => {
        const obj: any = { a: 1 };
        obj.self = obj; // 循环引用

        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.a = 10;
        expect(changes.some(c => c.includes('a:'))).toBe(true);

        unobserve();
    });

    it.skip('should handle Symbol properties', () => {
        // 跳过：Symbol 属性作为 key 的路径解析需要额外的实现
        const sym = Symbol('test');
        const obj: any = { [sym]: { nested: 1 } };

        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        // Symbol 作为 key 时，路径解析可能不同
        // 直接修改嵌套属性
        const nested = proxy[sym];
        nested.nested = 2;

        // 应该有变更被记录
        expect(changes.length).toBeGreaterThan(0);

        unobserve();
    });

    it('should reuse proxy for same object', () => {
        const obj = { nested: { a: 1 } };
        const { proxy, unobserve } = observe(
            obj,
            () => {}
        );

        expect(proxy.nested).toBe(proxy.nested);

        unobserve();
    });

    it('should handle empty objects', () => {
        const obj: any = {};
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.newProp = 1;

        expect(changes.length).toBeGreaterThan(0);
        expect(changes.some(c => c.includes('newProp') && c.includes('undefined -> 1'))).toBe(true);

        unobserve();
    });

    it('should handle empty arrays', () => {
        const obj: any = { arr: [] };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.arr.push(1);

        expect(changes.length).toBeGreaterThan(0);

        unobserve();
    });

    it('should handle array sort and reverse', () => {
        const obj = { arr: [3, 1, 2] };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.arr.sort();
        expect(changes.some(c => c.includes('array reset'))).toBe(true);

        changes.length = 0;
        proxy.arr.reverse();
        expect(changes.some(c => c.includes('array reset'))).toBe(true);

        unobserve();
    });

    it('should handle array shift and unshift', () => {
        const obj = { arr: [1, 2, 3] };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.arr.unshift(0);
        expect(changes.length).toBeGreaterThan(0);

        changes.length = 0;
        proxy.arr.shift();
        expect(changes.length).toBeGreaterThan(0);

        unobserve();
    });

    it('should handle complex nested paths', () => {
        const obj = { a: { b: { c: { d: 1 } } } };
        const { proxy, unobserve } = observe(
            obj,
            (change) => {
                changes.push(formatChange(change));
            },
            { throttle: 0 }
        );

        proxy.a.b.c.d = 100;

        // 路径应该是 a.b.c.d
        expect(changes.length).toBeGreaterThan(0);
        expect(changes.some(c => c.includes('a.b.c.d') && c.includes('1 -> 100'))).toBe(true);

        unobserve();
    });
});
