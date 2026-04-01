import { isObject } from '../../shared/is-object';

/* ======================= Consts & Types ======================= */

const RAW_SYMBOL = Symbol('solely.raw');

/** 路径键类型 - 用于表示对象路径的字符串或符号 */
export type PathKey = string | symbol;

/** 变更项的原始载荷 */
export type ChangePayload =
    | { type: 'set'; key: PathKey; newValue: unknown; oldValue: unknown }
    | { type: 'delete'; key: PathKey; oldValue: unknown }
    | { type: 'array-push'; index: number; values: unknown[] }
    | { type: 'array-splice'; index: number; deleteCount: number; insert: unknown[] }
    | { type: 'array-replace'; oldValue: unknown[]; newValue: unknown[] }
    | { type: 'array-reset'; method: string };

/** 完整的变更对象 */
export type ChangeItem = ChangePayload & { path: PathKey[] };

/** 观察选项配置 */
export interface ObserveOptions {
    /** 节流延迟时间（毫秒），默认 0 表示不节流 */
    throttle?: number;
    /** 批量变更回调，在 throttle 触发时调用 */
    onBatch?: (changes: ChangeItem[]) => void;
    /** 是否立即触发一次所有属性的变更通知 */
    immediate?: boolean;
    /** 路径过滤器，支持通配符 * 和 ** */
    filter?: string | string[];
    /** 是否启用深度比较 */
    deepCompare?: boolean;
}

/** 观察返回值 */
export interface ObserveReturn<T> {
    /** 响应式代理对象 */
    proxy: T;
    /** 暂停观察，可以调用 resume 恢复 */
    unobserve: () => void;
    /** 恢复观察 */
    resume: () => void;
    /** 彻底销毁，释放所有资源，不可恢复 */
    dispose: () => void;
}

/* ======================= 全局订阅系统 ======================= */

type ObserverEntry = {
    callback: (change: ChangeItem) => void;
    onBatch?: (changes: ChangeItem[]) => void;
    throttle: number;
    // 预编译的正则表达式数组
    filterRegexes: RegExp[];
    pending: ChangeItem[];
    timer: ReturnType<typeof setTimeout> | null;
    active: boolean;
};

// 全局 WeakMap：Proxy -> 所有订阅该对象的观察者集合
const globalObservers = new WeakMap<object, Set<ObserverEntry>>();

// 全局 Proxy 缓存：原始对象 -> Proxy
const globalProxyCache = new WeakMap<object, any>();

// 全局父子关系映射
const globalParentMap = new WeakMap<object, { parent: object | null; key: PathKey | null }>();

// 全局数组方法映射
const globalArrayInstrumentations = new WeakMap<object, Record<string, Function>>();

// 全局数组变异深度计数器（每个代理一个）
const globalArrayMutationDepth = new WeakMap<object, number>();

/* ======================= 核心 Helpers ======================= */

/**
 * 将 Proxy 还原为原始对象
 * @param observed 观察对象
 * @returns 原始对象
 */
export function toRaw<T>(observed: T): T {
    if (observed && typeof observed === 'object') {
        const raw = (observed as any)[RAW_SYMBOL];
        if (raw) return raw;
    }
    return observed;
}

// ======================= Native Object Guard =======================

const isNativeSkippable = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;

    // 浏览器原生类型，不能被 Proxy，否则会 Illegal invocation
    return (
        obj instanceof File ||
        obj instanceof Blob ||
        obj instanceof FormData ||
        obj instanceof ArrayBuffer ||
        obj instanceof Response ||
        obj instanceof Request
    );
};

/**
 * 检查一个值是否为响应式代理对象
 * @param value 要检查的值
 * @returns 如果是代理对象返回 true，否则返回 false
 */
export function isProxy(value: any): boolean {
    return !!(value && value[RAW_SYMBOL]);
}

/** 深度比较 - 支持循环引用检测 */
const deepEqual = (a: any, b: any, seen = new WeakMap<object, object>()): boolean => {
    // 同一引用
    if (a === b) return true;

    // null 检查
    if (a == null || b == null) return a === b;

    // 基本类型
    if (typeof a !== 'object' || typeof b !== 'object') return a === b;

    // 类型不同（数组 vs 对象）
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    // 循环引用检测
    if (seen.has(a)) {
        return seen.get(a) === b;
    }

    // 记录当前比较对，防止循环引用
    seen.set(a, b);

    // 数组比较
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i], seen)) return false;
        }
        return true;
    }

    // 对象比较
    const keys = Reflect.ownKeys(a);
    if (keys.length !== Reflect.ownKeys(b).length) return false;

    for (const key of keys) {
        if (!Reflect.has(b, key)) return false;
        const aVal = (a as Record<PropertyKey, unknown>)[key];
        const bVal = (b as Record<PropertyKey, unknown>)[key];
        if (!deepEqual(aVal, bVal, seen)) return false;
    }

    return true;
};

/** 全局路径解析 */
const resolvePathGlobal = (proxy: object): PathKey[] => {
    const path: PathKey[] = [];
    let cur: object | null = proxy;
    while (cur) {
        const info = globalParentMap.get(cur);
        if (!info || info.key == null) break;
        path.unshift(info.key);
        cur = info.parent;
    }
    return path;
};

/** 预编译过滤器正则表达式 */
const compileFilters = (filters: string[]): RegExp[] => {
    return filters.map(pattern => {
        if (pattern === '') return /^.*$/;
        const regexStr = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '(.+)')
            .replace(/\*/g, '[^.]+')
            .replace(/\[\d+\]/g, '\\[\\d+\\]');
        return new RegExp(`^${regexStr}$`);
    });
};

/** 检查路径是否匹配预编译的正则 */
const isPathMatched = (path: PathKey[], filterRegexes: RegExp[]): boolean => {
    if (filterRegexes.length === 0) return true;
    const pathStr = path.map(String).join('.');
    return filterRegexes.some(regex => regex.test(pathStr));
};

/** 全局事件分发 */
const globalEmit = (targetProxy: object, payload: ChangePayload) => {
    const basePath = resolvePathGlobal(targetProxy);

    // 直接遍历每个代理的观察者，无需 Set 去重
    // 一个观察者只会注册到它监听的根代理上，不会重复
    let current: object | null = targetProxy;
    while (current) {
        const observers = globalObservers.get(current);
        if (observers) {
            observers.forEach(entry => {
                // 检查观察者是否活跃
                if (!entry.active) return;

                // 计算相对于该观察者的路径
                // observerBasePath 是观察者根代理到当前代理的路径
                const observerBasePath = resolvePathGlobal(current!);
                const observerFullPath = [...observerBasePath, ...basePath.slice(observerBasePath.length)];

                if (!isPathMatched(observerFullPath, entry.filterRegexes)) return;

                const change: ChangeItem = { ...payload, path: observerFullPath };

                if (entry.throttle > 0) {
                    // 对于节流的情况，每个观察者自己管理 pending 和 timer
                    entry.pending.push(change);
                    if (!entry.timer) {
                        entry.timer = setTimeout(() => {
                            if (!entry.active) return;
                            const batch = [...entry.pending];
                            entry.pending = [];
                            entry.timer = null;
                            if (batch.length > 0) {
                                entry.onBatch?.(batch);
                                batch.forEach(cb => entry.callback(cb));
                            }
                        }, entry.throttle);
                    }
                } else {
                    entry.onBatch?.([change]);
                    entry.callback(change);
                }
            });
        }
        const parentInfo = globalParentMap.get(current);
        current = parentInfo?.parent || null;
    }
};

/* ======================= observe 主函数 ======================= */

/**
 * 创建响应式观察对象
 * @param value 要观察的目标对象
 * @param callback 变更回调函数
 * @param options 观察选项配置
 * @returns 观察控制对象，包含代理对象和控制方法
 */
export function observe<T extends object>(
    value: T,
    callback: (change: ChangeItem) => void,
    options: ObserveOptions = {},
): ObserveReturn<T> {
    const { throttle = 0, onBatch, immediate = false, deepCompare = false } = options;

    // 路径过滤正则缓存 - 预编译
    const filterPatterns = Array.isArray(options.filter) ? options.filter : options.filter ? [options.filter] : [];
    const filterRegexes = compileFilters(filterPatterns);

    // 当前观察者的入口
    const observerEntry: ObserverEntry = {
        callback,
        onBatch,
        throttle,
        filterRegexes,
        pending: [],
        timer: null,
        active: true,
    };

    const createArrayInstrumentations = (target: unknown[], proxy: object): Record<string, Function> => {
        const instrumentations: Record<string, Function> = {};
        // 1. 变异方法 (Mutation)
        (['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
            instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
                if (!proxy) return;

                const currentDepth = globalArrayMutationDepth.get(proxy) || 0;
                globalArrayMutationDepth.set(proxy, currentDepth + 1);
                const res = (target as any)[key].apply(target, args);
                globalArrayMutationDepth.set(proxy, currentDepth);

                // 计算触发事件的参数
                if (key === 'push') {
                    globalEmit(proxy, { type: 'array-push', index: target.length - args.length, values: args });
                } else if (key === 'unshift') {
                    globalEmit(proxy, { type: 'array-push', index: 0, values: args });
                } else if (key === 'pop') {
                    globalEmit(proxy, { type: 'array-splice', index: target.length, deleteCount: 1, insert: [] });
                } else if (key === 'shift') {
                    globalEmit(proxy, { type: 'array-splice', index: 0, deleteCount: 1, insert: [] });
                } else if (key === 'splice') {
                    const [start, deleteCount, ...insert] = args as [number, number, ...unknown[]];
                    globalEmit(proxy, { type: 'array-splice', index: start, deleteCount, insert });
                }
                return res;
            };
        });

        // 2. 结构重置方法 (Reset)
        (['sort', 'reverse', 'fill', 'copyWithin'] as const).forEach(key => {
            instrumentations[key] = function (this: unknown[], ...args: any[]) {
                if (!proxy) return;

                const currentDepth = globalArrayMutationDepth.get(proxy) || 0;
                globalArrayMutationDepth.set(proxy, currentDepth + 1);
                const res = (target as any)[key].apply(target, args);
                globalArrayMutationDepth.set(proxy, currentDepth);
                globalEmit(proxy, { type: 'array-reset', method: key });
                return res;
            };
        });

        // 3. 身份感知查找方法 (Search)
        (['indexOf', 'lastIndexOf', 'includes'] as const).forEach(key => {
            instrumentations[key] = function (this: unknown[], searchElement: unknown, ...args: any[]) {
                let res = (target as any)[key].apply(target, [searchElement, ...args]);
                // 如果没找到且搜索的是 Proxy，尝试用原始值找
                if ((res === -1 || res === false) && isProxy(searchElement)) {
                    res = (target as any)[key].apply(target, [toRaw(searchElement), ...args]);
                }
                return res;
            };
        });

        return instrumentations;
    };

    const createProxy = (target: object, parent: object | null, key: PathKey | null): any => {
        // 如果是不可扩展的对象（如 Object.freeze 过的），不进行代理，防止报错
        if (!Object.isExtensible(target)) {
            return target;
        }

        // 跳过浏览器原生对象（File / Blob 等）
        if (isNativeSkippable(target)) {
            return target;
        }

        // 如果 target 本身就是一个代理对象（即能响应 RAW_SYMBOL），直接返回它
        if ((target as any)[RAW_SYMBOL]) {
            return target;
        }

        // 使用全局缓存
        const cached = globalProxyCache.get(target);
        if (cached) {
            // 不覆盖父子关系，允许多个父对象
            return cached;
        }

        const handler: ProxyHandler<object> = {
            get(t, p, r) {
                if (p === RAW_SYMBOL) return t;

                if (Array.isArray(t)) {
                    const ins = globalArrayInstrumentations.get(proxy);
                    if (ins && Object.prototype.hasOwnProperty.call(ins, p)) {
                        return Reflect.get(ins, p, r);
                    }
                }

                const val = Reflect.get(t, p, r);
                // 排除 Symbol.iterator 等内置属性
                if (typeof p === 'symbol') return val;

                return isObject(val) && !isNativeSkippable(val) ? createProxy(val, proxy, p) : val;
            },

            set(t, p, newVal, r) {
                const oldVal = (t as any)[p];
                // 深度比较或引用比较
                if (deepCompare ? deepEqual(oldVal, newVal) : oldVal === newVal) return true;

                const res = Reflect.set(t, p, newVal, r);

                // 只有非数组内部变异时才触发普通的 set
                const arrayDepth = globalArrayMutationDepth.get(proxy) || 0;
                if (arrayDepth === 0) {
                    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
                        globalEmit(proxy, { type: 'array-replace', oldValue: oldVal, newValue: newVal });
                    } else {
                        globalEmit(proxy, { type: 'set', key: p, newValue: newVal, oldValue: oldVal });
                    }
                }
                return res;
            },

            deleteProperty(t, p) {
                if (!Reflect.has(t, p)) return false;
                const oldVal = (t as any)[p];
                const res = Reflect.deleteProperty(t, p);

                const arrayDepth = globalArrayMutationDepth.get(proxy) || 0;
                if (res && arrayDepth === 0) {
                    globalEmit(proxy, { type: 'delete', key: p, oldValue: oldVal });
                }
                return res;
            },
        };

        const proxy = new Proxy(target, handler);
        globalProxyCache.set(target, proxy);
        globalParentMap.set(proxy, { parent, key });

        if (Array.isArray(target)) {
            globalArrayInstrumentations.set(proxy, createArrayInstrumentations(target, proxy));
        }

        return proxy;
    };

    const rootProxy = createProxy(value, null, null) as T;

    // 注册到全局观察者
    let observers = globalObservers.get(rootProxy);
    if (!observers) {
        observers = new Set();
        globalObservers.set(rootProxy, observers);
    }
    observers.add(observerEntry);

    // immediate 处理
    if (immediate) {
        const walk = (obj: any, currentProxy: any, seen = new WeakSet<object>()) => {
            if (!isObject(obj) || seen.has(obj)) return;
            seen.add(obj);

            Reflect.ownKeys(obj).forEach(k => {
                const val = obj[k];
                // 跳过循环引用
                if (isObject(val) && seen.has(val)) return;
                globalEmit(currentProxy, { type: 'set', key: k, newValue: val, oldValue: undefined });
                if (isObject(val)) {
                    walk(val, createProxy(val, currentProxy, k), seen);
                }
            });
        };
        walk(value, rootProxy);
    }

    return {
        proxy: rootProxy,
        unobserve: () => {
            // 标记观察者为非活跃状态（暂停观察）
            observerEntry.active = false;
            // 清理 pending 和 timer
            observerEntry.pending = [];
            if (observerEntry.timer) {
                clearTimeout(observerEntry.timer);
                observerEntry.timer = null;
            }
            // 从全局观察者中移除
            const obs = globalObservers.get(rootProxy);
            if (obs) {
                obs.delete(observerEntry);
            }
        },
        resume: () => {
            if (observerEntry.active) return; // 已经活跃，避免重复添加
            // 重新标记为活跃
            observerEntry.active = true;
            // 重新添加到全局观察者集合
            let obs = globalObservers.get(rootProxy);
            if (!obs) {
                obs = new Set();
                globalObservers.set(rootProxy, obs);
            }
            // 防止重复添加
            if (!obs.has(observerEntry)) {
                obs.add(observerEntry);
            }
        },
        dispose: () => {
            // 彻底销毁，不可恢复
            observerEntry.active = false;
            observerEntry.pending = [];
            if (observerEntry.timer) {
                clearTimeout(observerEntry.timer);
                observerEntry.timer = null;
            }
            // 从全局观察者中移除
            const obs = globalObservers.get(rootProxy);
            if (obs) {
                obs.delete(observerEntry);
            }
            // 清空回调，防止内存泄漏
            observerEntry.callback = () => {};
            observerEntry.onBatch = undefined;
        },
    };
}
