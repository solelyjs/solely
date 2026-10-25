import { describe, it, expect } from 'vitest';
import { computed, observe } from '../src/runtime/reactivity';

describe('computed', () => {
    it('should compute lazily and cache the result', () => {
        const obs = observe({ a: 1, b: 2 }, () => {});
        let calls = 0;

        const sum = computed([obs], () => {
            calls++;
            return obs.proxy.a + obs.proxy.b;
        });

        expect(calls).toBe(0);
        expect(sum.get()).toBe(3);
        expect(sum.get()).toBe(3);
        expect(calls).toBe(1);

        sum.dispose();
    });

    it('should recompute after a dependency changes', () => {
        const obs = observe({ a: 1 }, () => {});
        const doubled = computed([obs], () => obs.proxy.a * 2);

        expect(doubled.get()).toBe(2);

        obs.proxy.a = 5;
        expect(doubled.get()).toBe(10);

        doubled.dispose();
    });

    it('should recompute after invalidate()', () => {
        const obs = observe({ a: 1 }, () => {});
        let factor = 2;
        const value = computed([obs], () => obs.proxy.a * factor);

        expect(value.get()).toBe(2);

        factor = 3;
        expect(value.get()).toBe(2);

        value.invalidate();
        expect(value.get()).toBe(3);

        value.dispose();
    });

    it('should stop tracking after dispose', () => {
        const obs = observe({ a: 1 }, () => {});
        const value = computed([obs], () => obs.proxy.a);

        expect(value.get()).toBe(1);

        value.dispose();
        expect(value.get()).toBeUndefined();
    });

    it('should throw when the source is not reactive', () => {
        expect(() => computed([{ a: 1 }], () => 1)).toThrow(/响应式/);
    });

    it('should accept a reactive proxy as source', () => {
        const obs = observe({ a: 2 }, () => {});
        const value = computed([obs.proxy], () => obs.proxy.a + 1);

        expect(value.get()).toBe(3);

        obs.proxy.a = 9;
        expect(value.get()).toBe(10);

        value.dispose();
    });
});
