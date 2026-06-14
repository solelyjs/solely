import { observe, toProxy, isProxy, type ObserveReturn, type ReactiveSource } from './observe';

/** computed 选项 */
export interface ComputedOptions {
    /** 是否启用深度比较，默认 false */
    deepCompare?: boolean;
}

/** computed 返回值 */
export interface ComputedReturn<T> {
    /** 获取当前计算值 */
    get: () => T;
    /** 手动标记为脏，下次读取时重新计算 */
    invalidate: () => void;
    /** 销毁计算属性，停止追踪依赖 */
    dispose: () => void;
}

/**
 * 创建计算属性
 *
 * 接受一个或多个响应式代理对象（或 observe 返回值）作为依赖源，以及一个计算函数。
 * 当任意依赖源发生变化时，标记为脏，下次读取时重新计算（惰性求值）。
 *
 * @param sources 依赖的响应式代理对象或 observe 返回值数组
 * @param getter 计算函数
 * @param options 选项
 * @returns 计算属性控制对象
 *
 * @example
 * ```ts
 * const obs = observe({ a: 1, b: 2 }, () => {});
 * const sum = computed([obs], () => obs.proxy.a + obs.proxy.b);
 * console.log(sum.get()); // 3
 * obs.proxy.a = 10;
 * console.log(sum.get()); // 12
 * ```
 */
export function computed<T>(
    sources: ReactiveSource[],
    getter: () => T,
    options: ComputedOptions = {},
): ComputedReturn<T> {
    let cached: T | undefined = undefined;
    let dirty = true;
    let disposed = false;

    // 对每个依赖源创建轻量观察者，变化时标记脏
    const observers: ObserveReturn<object>[] = [];

    const markDirty = () => {
        dirty = true;
    };

    for (const source of sources) {
        const proxy = toProxy(source);
        if (!isProxy(proxy)) {
            throw new Error('[solely] computed: sources 必须是响应式代理对象或 observe 返回值，请先调用 observe()');
        }
        const obs = observe(proxy, markDirty, {
            deepCompare: options.deepCompare,
        });
        observers.push(obs);
    }

    return {
        get: () => {
            if (disposed) return cached as T;

            if (dirty) {
                cached = getter();
                dirty = false;
            }

            return cached as T;
        },
        invalidate: () => {
            dirty = true;
        },
        dispose: () => {
            if (disposed) return;
            disposed = true;
            for (const obs of observers) {
                obs.dispose();
            }
            observers.length = 0;
            cached = undefined;
        },
    };
}
