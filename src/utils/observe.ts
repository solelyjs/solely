// observe.ts
import { isObject } from "./is-object";

/**
 * 代表观察器检测到的单次变更。
 */
export interface ChangeItem {
    path: (string | symbol)[];
    newValue: any;
    oldValue: any;
}

/**
 * observe 函数的配置选项。
 */
export interface ObserveOptions {
    /** 回调节流间隔（毫秒） */
    throttle?: number;
    /** 路径过滤，支持通配符（* 和 [*]） */
    filter?: string | string[];
    /** 启用深比较，只有值内容真正变化时才触发回调 */
    deepCompare?: boolean;
    /** 批量更新回调（节流后合并触发） */
    onBatch?: (changes: ChangeItem[]) => void;
    /**
     * 是否立即触发回调。
     * 如果为 true，将立即深度遍历初始对象，并为每个属性触发一次回调。
     */
    immediate?: boolean;
}

/**
 * observe 函数的返回值。
 */
export interface ObserveReturn<T> {
    /** 原始对象的响应式代理。 */
    proxy: T;
    /** 一个用来停止所有监听并清除待处理回调的函数。 */
    unobserve: () => void;
}

/**
 * ✅ 最终整合版 observe
 * 创建一个对象的深度响应式代理。
 * 支持：
 * - 节流（throttle）
 * - 批量回调（onBatch）
 * - 单次变化回调（callback）
 * - 深比较（deepCompare）
 * - 路径过滤（filter）
 * - 立即触发（immediate）
 * - 可取消监听（unobserve）
 */
export function observe<T extends object>(
    value: T,
    callback: (path: (string | symbol)[], newValue: any, oldValue: any) => void,
    options: ObserveOptions = {}
): ObserveReturn<T> {
    const proxyMap = new WeakMap<object, any>();
    const activeTargets = new Set<object>();

    // 解构选项并设置默认值
    const {
        throttle = 0,
        deepCompare = false,
        onBatch = null,
        immediate = false,
    } = options;

    const filters = Array.isArray(options.filter)
        ? options.filter
        : options.filter
            ? [options.filter]
            : [];

    let pendingChanges: ChangeItem[] = [];
    let timer: any = null;

    /** 一个用于对象和数组的简单深度相等检查。 */
    const deepEqual = (a: any, b: any): boolean => {
        if (a === b) return true;
        if (!isObject(a) || !isObject(b)) return false;
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) return false;
            }
            return true;
        }
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const k of keysA) {
            // 确保 b 也有这个 key，再进行比较
            if (!keysB.includes(k) || !deepEqual(a[k], b[k])) return false;
        }
        return true;
    };

    /** 检查给定路径是否匹配任何已定义的过滤器。 */
    const isPathMatched = (path: (string | symbol)[]): boolean => {
        if (filters.length === 0) return true;
        const fullPath = path.join(".");
        return filters.some((pattern) => {
            // 将通配符模式转换为正则表达式
            const regex = new RegExp(
                "^" +
                pattern
                    .replace(/\./g, "\\.") // 转义路径中的点
                    .replace(/\[\*\]/g, "\\[[^\\]]+\\]") // 匹配数组索引，如 [0], [1]...
                    .replace(/\*/g, "[^.]+") + // 匹配任意属性名片段
                "$"
            );
            return regex.test(fullPath);
        });
    };

    /** 触发回调，并应用节流和批量处理逻辑。 */
    const trigger = (path: (string | symbol)[], newValue: any, oldValue: any) => {
        if (!isPathMatched(path)) return;

        if (throttle > 0) {
            pendingChanges.push({ path, newValue, oldValue });
            if (!timer) {
                timer = setTimeout(() => {
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
            // 无节流，立即触发
            callback(path, newValue, oldValue);
            if (onBatch) onBatch([{ path, newValue, oldValue }]);
        }
    };

    /** 为一个对象递归地创建代理（Proxy）。 */
    const createProxy = (target: any, path: (string | symbol)[]): any => {
        if (!isObject(target)) return target;
        if (proxyMap.has(target)) return proxyMap.get(target);

        activeTargets.add(target);

        const proxy = new Proxy(target, {
            get(target, p, receiver) {
                const val = Reflect.get(target, p, receiver);
                // 为嵌套对象递归创建代理
                return isObject(val) ? createProxy(val, [...path, p]) : val;
            },
            set(target, p, newVal, receiver) {
                const oldVal = Reflect.get(target, p, receiver);

                // 如果值相同（可选择深度比较），则跳过触发
                if (deepCompare ? deepEqual(oldVal, newVal) : oldVal === newVal) {
                    return true;
                }

                const result = Reflect.set(target, p, newVal, receiver);
                if (activeTargets.has(target)) {
                    trigger([...path, p], newVal, oldVal);
                }
                return result;
            },
            deleteProperty(target: any, p) {
                if (Reflect.has(target, p)) {
                    const oldVal = target[p];
                    const result = Reflect.deleteProperty(target, p);
                    if (activeTargets.has(target)) {
                        trigger([...path, p], undefined, oldVal);
                    }
                    return result;
                }
                return false;
            },
            // 'apply' 陷阱用于数组的变更方法，如 push, pop, splice 等。
            apply(targetFn, thisArg, argArray) {
                const oldVal = Array.isArray(thisArg) ? [...thisArg] : undefined;
                const result = Reflect.apply(targetFn, thisArg, argArray);
                // 这里的 'path' 是指向数组本身的路径。
                if (activeTargets.has(thisArg)) {
                    trigger(path, thisArg, oldVal);
                }
                return result;
            },
        });

        proxyMap.set(target, proxy);
        return proxy;
    };

    const rootProxy = createProxy(value, []);

    // 如果 'immediate' 为 true，则遍历初始对象并触发回调。
    if (immediate) {
        const walk = (obj: any, path: (string | symbol)[]) => {
            if (!isObject(obj)) return;
            for (const key of Object.keys(obj)) {
                const currentPath = [...path, key];
                const val = obj[key];
                if (isPathMatched(currentPath)) {
                    callback(currentPath, val, undefined);
                }
                if (isObject(val)) {
                    walk(val, currentPath);
                }
            }
        };
        walk(value, []);
    }

    /** 停止所有监听，并清除任何待处理的节流回调。 */
    const unobserve = () => {
        activeTargets.clear();
        pendingChanges = [];
        if (timer) clearTimeout(timer);
    };

    return { proxy: rootProxy as T, unobserve };
}