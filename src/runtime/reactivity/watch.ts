import { observe, toProxy, isProxy, type ObserveReturn, type ChangeItem, type ReactiveSource } from './observe';

/** watch 选项 */
export interface WatchOptions {
    /** 是否启用深度比较，默认 false */
    deepCompare?: boolean;
    /** 是否立即执行一次回调，默认 false */
    immediate?: boolean;
    /** 节流延迟时间（毫秒），默认 0 表示不节流 */
    throttle?: number;
}

/** watch 返回值 */
export interface WatchReturn {
    /** 停止侦听 */
    dispose: () => void;
    /** 暂停侦听 */
    pause: () => void;
    /** 恢复侦听 */
    resume: () => void;
}

/**
 * 侦听响应式代理对象的变化
 *
 * observe 的便捷封装：给已有的响应式对象追加观察者，不返回 proxy。
 * 接受 observe() 返回值或 proxy 对象。
 *
 * @param source observe 返回值 或 响应式代理对象
 * @param callback 变更回调函数
 * @param options 选项
 * @returns 侦听控制对象
 *
 * @example
 * ```ts
 * // 方式1：传入 observe 返回值
 * const obs = observe({ count: 0 }, () => {});
 * watch(obs, (change) => console.log('changed:', change));
 *
 * // 方式2：传入 proxy（如组件中的 $data）
 * watch(this.$data, (change) => console.log('changed:', change));
 * ```
 */
export function watch<T extends object = object>(
    source: ReactiveSource<T>,
    callback: (change: ChangeItem) => void,
    options: WatchOptions = {},
): WatchReturn {
    const proxy = toProxy(source);
    if (!isProxy(proxy)) {
        throw new Error('[solely] watch: source 必须是响应式代理对象或 observe 返回值，请先调用 observe()');
    }
    const observer = observe(proxy, callback, {
        deepCompare: options.deepCompare,
        throttle: options.throttle,
        immediate: options.immediate,
    });

    return {
        dispose: () => observer.dispose(),
        pause: () => observer.unobserve(),
        resume: () => observer.resume(),
    };
}

/**
 * 侦听一个 getter 函数的返回值变化
 *
 * 当 getter 中访问的响应式数据变化时，重新计算 getter 并比较新旧值，
 * 如果值发生变化则执行回调。
 *
 * @param sources 依赖的响应式代理对象数组
 * @param getter 计算函数
 * @param callback 值变化回调
 * @param options 选项
 * @returns 侦听控制对象
 *
 * @example
 * ```ts
 * const { proxy } = observe({ a: 1, b: 2 }, () => {});
 * const watcher = watchGetter(
 *     [proxy],
 *     () => proxy.a + proxy.b,
 *     (newVal, oldVal) => console.log(`${oldVal} -> ${newVal}`)
 * );
 * ```
 */
export function watchGetter<T>(
    sources: ReactiveSource[],
    getter: () => T,
    callback: (newValue: T, oldValue: T | undefined) => void,
    options: WatchOptions = {},
): WatchReturn {
    let oldValue: T | undefined = undefined;
    let disposed = false;

    const observers: ObserveReturn<object>[] = [];

    const checkUpdate = () => {
        if (disposed) return;
        const newValue = getter();
        if (newValue !== oldValue) {
            callback(newValue, oldValue);
            oldValue = newValue;
        }
    };

    for (const source of sources) {
        const proxy = toProxy(source);
        if (!isProxy(proxy)) {
            throw new Error('[solely] watchGetter: sources 必须是响应式代理对象或 observe 返回值，请先调用 observe()');
        }
        const obs = observe(proxy, checkUpdate, {
            deepCompare: options.deepCompare,
            throttle: options.throttle,
        });
        observers.push(obs);
    }

    // Establish a baseline even when the callback is not immediate. This makes
    // the first notified change report the actual previous value.
    if (options.immediate) {
        oldValue = getter();
        callback(oldValue, undefined);
    } else {
        oldValue = getter();
    }

    return {
        dispose: () => {
            if (disposed) return;
            disposed = true;
            for (const obs of observers) {
                obs.dispose();
            }
            observers.length = 0;
        },
        pause: () => {
            for (const obs of observers) {
                obs.unobserve();
            }
        },
        resume: () => {
            for (const obs of observers) {
                obs.resume();
            }
        },
    };
}
