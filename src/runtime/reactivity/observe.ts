import { isObject } from "../../shared/is-object";

/* ======================= Consts & Types ======================= */

const RAW_SYMBOL = Symbol("solely.raw");

export type PathKey = string | symbol;

/** 变更项的原始载荷 */
export type ChangePayload =
    | { type: "set"; key: PathKey; newValue: unknown; oldValue: unknown }
    | { type: "delete"; key: PathKey; oldValue: unknown }
    | { type: "array-push"; index: number; values: unknown[] }
    | { type: "array-splice"; index: number; deleteCount: number; insert: unknown[] }
    | { type: "array-replace"; oldValue: unknown[]; newValue: unknown[] }
    | { type: "array-reset"; method: string };

/** 完整的变更对象 */
export type ChangeItem = ChangePayload & { path: PathKey[] };

export interface ObserveOptions {
    throttle?: number;
    onBatch?: (changes: ChangeItem[]) => void;
    immediate?: boolean;
    filter?: string | string[];
    deepCompare?: boolean;
}

export interface ObserveReturn<T> {
    proxy: T;
    unobserve: () => void;
    resume: () => void;
}

/* ======================= 核心 Helpers ======================= */

/** 将 Proxy 还原为原始对象 */
export function toRaw<T>(observed: T): T {
    const raw = observed && (observed as any)[RAW_SYMBOL];
    return raw ? toRaw(raw) : observed;
}

function isProxy(value: any): boolean {
    return !!(value && value[RAW_SYMBOL]);
}

/** 深度比较 */
const deepEqual = (a: any, b: any, map = new WeakMap()): boolean => {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== "object" || typeof b !== "object") return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        if (map.has(a)) return map.get(a) === b;
        map.set(a, b);
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i], map)) return false;
        }
        return true;
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (map.has(a)) return map.get(a) === b;
    map.set(a, b);
    const keys = Reflect.ownKeys(a);
    if (keys.length !== Reflect.ownKeys(b).length) return false;
    for (const key of keys) {
        if (!Reflect.has(b, key) || !deepEqual(a[key as any], b[key as any], map)) return false;
    }
    return true;
};

/* ======================= observe 主函数 ======================= */

export function observe<T extends object>(
    value: T,
    callback: (change: ChangeItem) => void,
    options: ObserveOptions = {}
): ObserveReturn<T> {
    const { throttle = 0, onBatch, immediate = false, deepCompare = false } = options;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: ChangeItem[] = [];
    let arrayMutationDepth = 0;

    // 状态容器
    const proxyMap = new WeakMap<object, any>();
    const parentMap = new WeakMap<object, { parent: object | null; key: PathKey | null }>();
    const arrayInstrumentationsMap = new WeakMap<object, Record<string, Function>>();

    // 路径过滤正则缓存
    const filters = Array.isArray(options.filter) ? options.filter : options.filter ? [options.filter] : [];

    const isPathMatched = (path: PathKey[]): boolean => {
        if (filters.length === 0) return true;
        const pathStr = path.map(String).join(".");
        return filters.some((pattern) => {
            if (pattern === "") return true;
            const regexStr = pattern
                .replace(/\./g, "\\.")
                .replace(/\*\*/g, "(.+)")
                .replace(/\*/g, "[^.]+")
                .replace(/\[\d+\]/g, "\\[\\d+\\]");
            return new RegExp(`^${regexStr}$`).test(pathStr);
        });
    };

    const resolvePath = (proxy: object): PathKey[] => {
        const path: PathKey[] = [];
        let cur: object | null = proxy;
        while (cur) {
            const info = parentMap.get(cur);
            if (!info || info.key == null) break;
            path.unshift(info.key);
            cur = info.parent;
        }
        return path;
    };

    const emit = (proxy: object, payload: ChangePayload) => {
        if (!active) return;
        const path = resolvePath(proxy);
        if (!isPathMatched(path)) return;

        const full: ChangeItem = { ...payload, path } as ChangeItem;

        if (throttle > 0) {
            pending.push(full);
            if (!timer) {
                timer = setTimeout(() => {
                    const batch = [...pending];
                    pending = [];
                    timer = null;
                    if (!active) return;
                    onBatch?.(batch);
                    batch.forEach(callback);
                }, throttle);
            }
        } else {
            onBatch?.([full]);
            callback(full);
        }
    };

    const createArrayInstrumentations = (target: unknown[], proxy: object): Record<string, Function> => {
        const instrumentations: Record<string, Function> = {};

        // 1. 变异方法 (Mutation)
        (['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
            instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
                arrayMutationDepth++;
                const res = (target as any)[key].apply(target, args);
                arrayMutationDepth--;

                // 计算触发事件的参数
                if (key === 'push') {
                    emit(proxy, { type: "array-push", index: target.length - args.length, values: args });
                } else if (key === 'unshift') {
                    emit(proxy, { type: "array-push", index: 0, values: args });
                } else if (key === 'pop') {
                    emit(proxy, { type: "array-splice", index: target.length, deleteCount: 1, insert: [] });
                } else if (key === 'shift') {
                    emit(proxy, { type: "array-splice", index: 0, deleteCount: 1, insert: [] });
                } else if (key === 'splice') {
                    const [start, deleteCount, ...insert] = args as [number, number, ...unknown[]];
                    emit(proxy, { type: "array-splice", index: start, deleteCount, insert });
                }
                return res;
            };
        });

        // 2. 结构重置方法 (Reset)
        (['sort', 'reverse', 'fill', 'copyWithin'] as const).forEach(key => {
            instrumentations[key] = function (this: unknown[], ...args: any[]) {
                arrayMutationDepth++;
                const res = (target as any)[key].apply(target, args);
                arrayMutationDepth--;
                emit(proxy, { type: "array-reset", method: key });
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

        // 如果 target 本身就是一个代理对象（即能响应 RAW_SYMBOL），直接返回它
        if ((target as any)[RAW_SYMBOL]) {
            return target;
        }

        // 缓存原始对象对应的代理
        const cached = proxyMap.get(target);
        if (cached) {
            // 更新父子关系（一个对象可能挂在不同路径下，这里保留最近一次的）
            parentMap.set(cached, { parent, key });
            return cached;
        }

        const handler: ProxyHandler<object> = {
            get(t, p, r) {
                if (p === RAW_SYMBOL) return t;

                if (Array.isArray(t)) {
                    const ins = arrayInstrumentationsMap.get(proxy);
                    if (ins && Object.prototype.hasOwnProperty.call(ins, p)) {
                        return Reflect.get(ins, p, r);
                    }
                }

                const val = Reflect.get(t, p, r);
                // 排除 Symbol.iterator 等内置属性
                if (typeof p === 'symbol') return val;

                return isObject(val) ? createProxy(val, proxy, p) : val;
            },

            set(t, p, newVal, r) {
                const oldVal = (t as any)[p];
                // 深度比较或引用比较
                if (deepCompare ? deepEqual(oldVal, newVal) : oldVal === newVal) return true;

                const res = Reflect.set(t, p, newVal, r);

                // 只有非数组内部变异时才触发普通的 set
                if (arrayMutationDepth === 0) {
                    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
                        emit(proxy, { type: "array-replace", oldValue: oldVal, newValue: newVal });
                    } else {
                        emit(proxy, { type: "set", key: p, newValue: newVal, oldValue: oldVal });
                    }
                }
                return res;
            },

            deleteProperty(t, p) {
                if (!Reflect.has(t, p)) return false;
                const oldVal = (t as any)[p];
                const res = Reflect.deleteProperty(t, p);

                if (res && arrayMutationDepth === 0) {
                    emit(proxy, { type: "delete", key: p, oldValue: oldVal });
                }
                return res;
            }
        };

        const proxy = new Proxy(target, handler);
        proxyMap.set(target, proxy);
        parentMap.set(proxy, { parent, key });

        if (Array.isArray(target)) {
            arrayInstrumentationsMap.set(proxy, createArrayInstrumentations(target, proxy));
        }

        return proxy;
    };

    const rootProxy = createProxy(value, null, null) as T;

    // immediate 处理
    if (immediate) {
        const walk = (obj: any, currentProxy: any, seen = new WeakSet<object>()) => {
            if (!isObject(obj) || seen.has(obj)) return;
            seen.add(obj);

            Reflect.ownKeys(obj).forEach((k) => {
                const val = obj[k];
                emit(currentProxy, { type: "set", key: k, newValue: val, oldValue: undefined });
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
            active = false;
            pending = [];
            if (timer) clearTimeout(timer);
        },
        resume: () => { active = true; }
    };
}