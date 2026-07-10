import { describe, expect, it } from 'vitest';
import { observe, watchGetter } from '../src/runtime/reactivity';

describe('watchGetter', () => {
    it('reports the initial value as oldValue on the first change', () => {
        const state = observe({ count: 1 }, () => {});
        const calls: Array<[number, number | undefined]> = [];
        const callback = (newValue: number, oldValue: number | undefined) => calls.push([newValue, oldValue]);
        const watcher = watchGetter([state], () => state.proxy.count, callback);

        state.proxy.count = 2;

        expect(calls).toEqual([[2, 1]]);
        watcher.dispose();
        state.dispose();
    });
});
