import { isObject } from "./is-object";

/**
 * 表示一次对象或数组的变更信息
 */
export interface ChangeItem {
    /** 变更的路径，从根对象开始 */
    path: (string | symbol)[];
    /** 新值 */
    newValue: any;
    /** 旧值 */
    oldValue: any;
}

/**
 * observe 函数的可选配置项
 */
export interface ObserveOptions {
    /**
     * 节流时间（毫秒），用于批量回调
     */
    throttle?: number;

    /**
     * 仅监听匹配的路径，可为字符串或字符串数组
     * 支持通配符：
     * - `*` 单层匹配
     * - `**` 任意层级匹配
     * - `[*]` 数组元素匹配
     */
    filter?: string | string[];

    /**
     * 是否进行深度比较，避免浅比较导致重复触发
     */
    deepCompare?: boolean;

    /**
     * 批量变化时的回调
     */
    onBatch?: (changes: ChangeItem[]) => void;

    /**
     * 是否在初始化时立即触发一次回调
     */
    immediate?: boolean;
}

/**
 * observe 返回值对象
 */
export interface ObserveReturn<T> {
    /** 代理对象 */
    proxy: T;
    /** 停止监听 */
    unobserve: () => void;
    /** 恢复监听 */
    resume: () => void;
}

/**
 * 对任意对象或数组进行深度监听
 * @param value 要监听的对象
 * @param callback 当对象变化时触发的回调，返回变化路径、新值、旧值
 * @param options 配置项，可选
 * @returns ObserveReturn 包含代理对象和控制方法
 */
export function observe<T extends object>(
    value: T,
    callback: (path: (string | symbol)[], newValue: any, oldValue: any) => void,
    options: ObserveOptions = {}
): ObserveReturn<T> {
    const proxyMap = new WeakMap<object, any>();
    const activeTargets = new WeakSet<object>();

    const { throttle = 0, deepCompare = false, onBatch = null, immediate = false } = options;
    const filters = Array.isArray(options.filter)
        ? options.filter
        : options.filter
            ? [options.filter]
            : [];

    let pendingChanges: ChangeItem[] = [];
    let timer: any = null;
    let active = true;

    // 深度比较函数
    const deepEqual = (a: any, b: any, map = new WeakMap()): boolean => {
        if (a === b) return true;
        if (a == null || b == null) return a === b;
        if (typeof a !== 'object' || typeof b !== 'object') return a === b;
        if (map.has(a)) return map.get(a) === b;
        map.set(a, b);

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i], map)) return false;
            }
            return true;
        }

        if (Array.isArray(a) !== Array.isArray(b)) return false;
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        for (const k of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k], map)) return false;
        }
        return true;
    };

    // 判断路径是否匹配 filter
    const isPathMatched = (path: (string | symbol)[]): boolean => {
        if (filters.length === 0) return true;
        const fullPath = path.map(String).join(".");
        return filters.some((pattern) => {
            const regex = new RegExp(
                "^" +
                pattern
                    .replace(/\./g, "\\.")
                    .replace(/\[\*\]/g, "(\\.\\d+)?")
                    .replace(/\*\*/g, "(.+)")
                    .replace(/\*/g, "[^.]+")
                + "$"
            );
            return regex.test(fullPath);
        });
    };

    // 触发变化回调
    const trigger = (path: (string | symbol)[], newValue: any, oldValue: any) => {
        if (!active) return;
        if (!isPathMatched(path)) return;

        if (throttle > 0) {
            pendingChanges.push({ path, newValue, oldValue });
            if (!timer) {
                timer = setTimeout(() => {
                    if (!active) {
                        timer = null;
                        return;
                    }
                    const changes = pendingChanges;
                    pendingChanges = [];
                    timer = null;
                    if (onBatch) onBatch(changes);
                    for (const change of changes) {
                        callback(change.path, change.newValue, change.oldValue);
                    }
                }, throttle);
            }
        } else {
            callback(path, newValue, oldValue);
            if (onBatch) onBatch([{ path, newValue, oldValue }]);
        }
    };

    // 创建代理对象
    const createProxy = (target: any, path: (string | symbol)[]): any => {
        if (!isObject(target)) return target;
        if (!(Array.isArray(target) || Object.prototype.toString.call(target) === '[object Object]')) return target;

        const arrayInstrumentations: { [key: string]: Function } = {};
        ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].forEach(method => {
            const originalMethod = Array.prototype[method as keyof Array<any>];
            arrayInstrumentations[method] = function (...args: any[]) {
                if (!active) return Reflect.apply(originalMethod, target, args);
                const oldVal = [...target];
                const result = originalMethod.apply(target, args);
                if (!deepEqual(target, oldVal)) trigger(path, target, oldVal);
                return result;
            };
        });

        if (proxyMap.has(target)) {
            return new Proxy(target, {
                get(target, p, receiver) {
                    if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(p as string)) {
                        return Reflect.get(arrayInstrumentations, p, receiver);
                    }
                    const val = Reflect.get(target, p, receiver);
                    return isObject(val) ? createProxy(val, [...path, p]) : val;
                },
                set(target, p, newVal, receiver) {
                    const oldVal = Reflect.get(target, p, receiver);
                    const isEqual = deepCompare ? deepEqual(oldVal, newVal) : oldVal === newVal;
                    if (isEqual) return true;
                    const result = Reflect.set(target, p, newVal, receiver);
                    if (activeTargets.has(target)) trigger([...path, p], newVal, oldVal);
                    return result;
                },
                deleteProperty(target: any, p) {
                    if (Reflect.has(target, p)) {
                        const oldVal = target[p];
                        const result = Reflect.deleteProperty(target, p);
                        if (result && activeTargets.has(target)) trigger([...path, p], undefined, oldVal);
                        return result;
                    }
                    return false;
                },
            });
        }

        activeTargets.add(target);

        const proxy = new Proxy(target, {
            get(target, p, receiver) {
                if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(p as string)) {
                    return Reflect.get(arrayInstrumentations, p, receiver);
                }
                const val = Reflect.get(target, p, receiver);
                return isObject(val) ? createProxy(val, [...path, p]) : val;
            },
            set(target, p, newVal, receiver) {
                const oldVal = Reflect.get(target, p, receiver);
                const isEqual = deepCompare ? deepEqual(oldVal, newVal) : oldVal === newVal;
                if (isEqual) return true;
                const result = Reflect.set(target, p, newVal, receiver);
                if (activeTargets.has(target)) trigger([...path, p], newVal, oldVal);
                return result;
            },
            deleteProperty(target: any, p) {
                if (Reflect.has(target, p)) {
                    const oldVal = target[p];
                    const result = Reflect.deleteProperty(target, p);
                    if (result && activeTargets.has(target)) trigger([...path, p], undefined, oldVal);
                    return result;
                }
                return false;
            },
        });

        proxyMap.set(target, proxy);
        return proxy;
    };

    const rootProxy = createProxy(value, []);

    if (immediate) {
        const walk = (obj: any, path: (string | symbol)[], seen = new WeakSet()) => {
            if (!isObject(obj) || !active || seen.has(obj)) return;
            seen.add(obj);
            for (const key of Object.keys(obj)) {
                const currentPath = [...path, key];
                const val = obj[key];
                if (isPathMatched(currentPath)) callback(currentPath, val, undefined);
                if (isObject(val)) walk(val, currentPath, seen);
            }
        };
        walk(value, []);
    }

    const unobserve = () => {
        if (!active) return;
        active = false;
        pendingChanges = [];
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const resume = () => {
        active = true;
    };

    return { proxy: rootProxy as T, unobserve, resume };
}
