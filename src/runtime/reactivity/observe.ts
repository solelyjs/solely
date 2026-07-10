import { isObject } from '../../shared/is-object';

/* ======================= Consts & Types ======================= */

const RAW_SYMBOL = Symbol('solely.raw');

export type PathKey = string | symbol;

export type ChangePayload =
    | { type: 'set'; key: PathKey; newValue: unknown; oldValue: unknown }
    | { type: 'delete'; key: PathKey; oldValue: unknown }
    | { type: 'array-push'; index: number; values: unknown[] }
    | { type: 'array-splice'; index: number; deleteCount: number; insert: unknown[] }
    | { type: 'array-replace'; oldValue: unknown[]; newValue: unknown[] }
    | { type: 'array-reset'; method: string };

export type ChangeItem = ChangePayload & { path: PathKey[] };

export interface ObserveOptions {
    throttle?: number;
    onBatch?: (changes: ChangeItem[]) => void;
    immediate?: boolean;
    filter?: string | string[];
    /** 是否启用深度比较，默认 false */
    deepCompare?: boolean;
}

export interface ObserveReturn<T> {
    proxy: T;
    unobserve: () => void;
    resume: () => void;
    dispose: () => void;
}

/* ======================= 全局状态管理 ======================= */

type ObserverEntry = {
    callback: (change: ChangeItem) => void;
    onBatch?: (changes: ChangeItem[]) => void;
    throttle: number;
    filterRegexes: RegExp[];
    pending: ChangeItem[];
    timer: ReturnType<typeof setTimeout> | null;
    active: boolean;
    deepCompare?: boolean;
};

// 代理对象缓存 (Raw -> Proxy)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalProxyCache = new WeakMap<object, any>();
const globalObservers = new WeakMap<object, Set<ObserverEntry>>();

// 数组突变深度
const globalArrayMutationDepth = new WeakMap<object, number>();

/* ======================= DAG 双向图与弱引用系统 ======================= */

const globalChildrenMap = new WeakMap<object, Map<PathKey, object>>();

type ParentLink = { parentRef: WeakRef<object>; key: PathKey };
const globalParentMap = new WeakMap<object, ParentLink[]>();

function link(parentProxy: object, key: PathKey, childProxy: object) {
    unlink(parentProxy, key);

    let childrenMap = globalChildrenMap.get(parentProxy);
    if (!childrenMap) {
        childrenMap = new Map();
        globalChildrenMap.set(parentProxy, childrenMap);
    }
    childrenMap.set(key, childProxy);

    let parentLinks = globalParentMap.get(childProxy);
    if (!parentLinks) {
        parentLinks = [];
        globalParentMap.set(childProxy, parentLinks);
    }

    const exists = parentLinks.some(link => link.parentRef.deref() === parentProxy && link.key === key);
    if (!exists) {
        parentLinks.push({ parentRef: new WeakRef(parentProxy), key });
    }
}

function unlink(parentProxy: object, key: PathKey) {
    const childrenMap = globalChildrenMap.get(parentProxy);
    if (!childrenMap) return;

    const childProxy = childrenMap.get(key);
    if (!childProxy) return;

    childrenMap.delete(key);

    const parentLinks = globalParentMap.get(childProxy);
    if (parentLinks) {
        const newLinks = parentLinks.filter(pLink => {
            const parent = pLink.parentRef.deref();
            return parent !== undefined && !(parent === parentProxy && pLink.key === key);
        });
        if (newLinks.length === 0) {
            globalParentMap.delete(childProxy);
        } else {
            globalParentMap.set(childProxy, newLinks);
        }
    }
}

function syncArrayLinks(target: unknown[], arrayProxy: object) {
    const childrenMap = globalChildrenMap.get(arrayProxy);
    if (childrenMap) {
        // 使用迭代器减少数组中间变量开销
        for (const key of childrenMap.keys()) {
            unlink(arrayProxy, key);
        }
    }

    for (let i = 0; i < target.length; i++) {
        const item = target[i];
        if (isObject(item) && !isNativeSkippable(item)) {
            link(arrayProxy, String(i), getOrCreateProxy(item));
        }
    }
}

/* ======================= 核心 Helpers ======================= */

export function toRaw<T>(observed: T): T {
    if (observed && typeof observed === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (observed as any)[RAW_SYMBOL];
        if (raw) return raw;
    }
    return observed;
}

const objectToString = Object.prototype.toString;
const isNativeSkippable = (obj: unknown): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    // 拦截高频且不应响应式的原生类型
    const tag = objectToString.call(obj);
    if (tag === '[object Date]' || tag === '[object RegExp]' || tag === '[object Map]' || tag === '[object Set]')
        return true;

    // Some of these Web APIs are absent in SSR runtimes and older Node.js
    // versions. Guard every constructor so observing a plain object never
    // depends on a browser-only global being defined.
    return (
        (typeof File !== 'undefined' && obj instanceof File) ||
        (typeof Blob !== 'undefined' && obj instanceof Blob) ||
        (typeof FormData !== 'undefined' && obj instanceof FormData) ||
        (typeof ArrayBuffer !== 'undefined' && obj instanceof ArrayBuffer) ||
        (typeof Response !== 'undefined' && obj instanceof Response) ||
        (typeof Request !== 'undefined' && obj instanceof Request)
    );
};

export function isProxy(value: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !!(value && (value as any)[RAW_SYMBOL]);
}

export type ReactiveSource<T extends object = object> = T | ObserveReturn<T>;

export function toProxy<T extends object = object>(source: ReactiveSource<T>): T {
    if (source && typeof source === 'object' && 'proxy' in source) {
        return (source as ObserveReturn<T>).proxy;
    }
    return source as T;
}

// 缓存正则编译结果，提升过滤性能
const regexCache = new Map<string, RegExp>();
const compileFilters = (filters: string[]): RegExp[] => {
    return filters.map(pattern => {
        if (pattern === '') return /^.*$/;
        const cached = regexCache.get(pattern);
        if (cached) return cached;

        let escaped = '';
        for (let i = 0; i < pattern.length; i++) {
            const ch = pattern[i];
            if (ch === '*' && pattern[i + 1] === '*') {
                escaped += '**';
                i++;
            } else if (ch === '*') {
                escaped += '*';
            } else if (ch === '.') {
                escaped += '.';
            } else if (/[.*+?^${}()|[\]\\]/.test(ch)) {
                escaped += '\\' + ch;
            } else {
                escaped += ch;
            }
        }

        const segments = escaped.split('.');
        const parts: string[] = [];

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (seg === '**') {
                if (segments.length === 1) parts.push('.*');
                else if (i === 0) parts.push('(?:[^.]+\\.)*');
                else parts.push('(?:\\.[^.]+)*');
            } else if (seg === '*') {
                parts.push('[^.]+');
            } else {
                parts.push(seg);
            }
        }

        let regexStr = '^';
        for (let i = 0; i < parts.length; i++) {
            regexStr += parts[i];
            if (i < parts.length - 1) {
                const current = parts[i];
                const next = parts[i + 1];
                if (current.endsWith('\\.)*')) continue;
                if (next.startsWith('(?:\\.')) continue;
                regexStr += '\\.';
            }
        }
        regexStr += '$';

        const compiled = new RegExp(regexStr);
        regexCache.set(pattern, compiled);
        return compiled;
    });
};

const isPathMatched = (path: PathKey[], filterRegexes: RegExp[]): boolean => {
    if (filterRegexes.length === 0) return true;
    const parts = path.map(String);
    for (let i = parts.length; i > 0; i--) {
        const pathStr = parts.slice(0, i).join('.');
        if (filterRegexes.some(regex => regex.test(pathStr))) return true;
    }
    return false;
};

const deepEqual = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    const keysA = Reflect.ownKeys(a);
    const keysB = Reflect.ownKeys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!Reflect.has(b, key)) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!deepEqual((a as any)[key], (b as any)[key])) return false;
    }
    return true;
};

/* ======================= 事件派发 ======================= */

const dispatchToEntry = (entry: ObserverEntry, change: ChangeItem) => {
    if (!entry.active) return;

    if (entry.deepCompare && change.type === 'set') {
        if (deepEqual(change.oldValue, change.newValue)) return;
    }

    if (entry.throttle > 0) {
        entry.pending.push(change);
        if (!entry.timer) {
            entry.timer = setTimeout(() => {
                if (!entry.active) return;
                const batch = [...entry.pending];
                entry.pending = [];
                entry.timer = null;
                if (batch.length > 0) {
                    if (entry.onBatch) entry.onBatch(batch);
                    else entry.callback(batch[batch.length - 1]);
                }
            }, entry.throttle);
        }
    } else {
        if (entry.onBatch) entry.onBatch([change]);
        else entry.callback(change);
    }
};

const globalEmit = (targetProxy: object, payload: ChangePayload) => {
    const queue: { node: object; relativePath: PathKey[]; visited: Set<object> }[] = [
        { node: targetProxy, relativePath: [], visited: new Set([targetProxy]) },
    ];

    let head = 0;
    while (head < queue.length) {
        const { node, relativePath, visited } = queue[head++];

        const observers = globalObservers.get(node);
        if (observers) {
            observers.forEach(entry => {
                if (!entry.active) return;

                let finalPath = relativePath;
                if (payload.type === 'set' || payload.type === 'delete') {
                    finalPath = [...relativePath, payload.key];
                } else if (payload.type === 'array-push' || payload.type === 'array-splice') {
                    finalPath = [...relativePath, String(payload.index)];
                }

                if (!isPathMatched(finalPath, entry.filterRegexes)) return;

                const change: ChangeItem = { ...payload, path: finalPath };
                dispatchToEntry(entry, change);
            });
        }

        const parentLinks = globalParentMap.get(node);
        if (parentLinks) {
            for (let i = parentLinks.length - 1; i >= 0; i--) {
                const pLink = parentLinks[i];
                const parentNode = pLink.parentRef.deref();

                if (!parentNode) {
                    parentLinks.splice(i, 1);
                    continue;
                }

                if (visited.has(parentNode)) continue;

                const newVisited = new Set(visited);
                newVisited.add(parentNode);

                queue.push({
                    node: parentNode,
                    relativePath: [pLink.key, ...relativePath],
                    visited: newVisited,
                });
            }
        }
    }
};

/* ======================= 全局代理生成器与静态拦截器 ======================= */

// 全局静态的数组仪器（解耦于具体 proxy 实例，依靠 this 绑定获取）
const arrayInstrumentations: Record<string, Function> = {};

(['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
    arrayInstrumentations[key] = function (this: unknown[], ...args: unknown[]) {
        const proxy = this as object;
        const target = toRaw(proxy) as unknown[];
        const currentDepth = globalArrayMutationDepth.get(proxy) || 0;
        globalArrayMutationDepth.set(proxy, currentDepth + 1);

        try {
            const oldLength = target.length;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = (target as any)[key].apply(target, args);

            if (key === 'push') {
                const startIndex = target.length - args.length;
                for (let i = 0; i < args.length; i++) {
                    const item = target[startIndex + i];
                    if (isObject(item) && !isNativeSkippable(item)) {
                        link(proxy, String(startIndex + i), getOrCreateProxy(item));
                    }
                }
                globalEmit(proxy, { type: 'array-push', index: startIndex, values: args });
            } else if (key === 'pop') {
                unlink(proxy, String(oldLength - 1));
                globalEmit(proxy, { type: 'array-splice', index: oldLength - 1, deleteCount: 1, insert: [] });
            } else {
                syncArrayLinks(target, proxy);

                if (key === 'unshift') {
                    globalEmit(proxy, { type: 'array-push', index: 0, values: args });
                } else if (key === 'shift') {
                    globalEmit(proxy, { type: 'array-splice', index: 0, deleteCount: 1, insert: [] });
                } else if (key === 'splice') {
                    const [start, deleteCount, ...insert] = args as [number, number, ...unknown[]];
                    globalEmit(proxy, { type: 'array-splice', index: start, deleteCount, insert });
                }
            }
            return res;
        } finally {
            globalArrayMutationDepth.set(proxy, currentDepth);
        }
    };
});

(['sort', 'reverse', 'fill', 'copyWithin'] as const).forEach(key => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arrayInstrumentations[key] = function (this: unknown[], ...args: any[]) {
        const proxy = this as object;
        const target = toRaw(proxy) as unknown[];
        const currentDepth = globalArrayMutationDepth.get(proxy) || 0;
        globalArrayMutationDepth.set(proxy, currentDepth + 1);

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = (target as any)[key].apply(target, args);
            syncArrayLinks(target, proxy);
            globalEmit(proxy, { type: 'array-reset', method: key });
            return res;
        } finally {
            globalArrayMutationDepth.set(proxy, currentDepth);
        }
    };
});

(['indexOf', 'lastIndexOf', 'includes'] as const).forEach(key => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arrayInstrumentations[key] = function (this: unknown[], searchElement: unknown, ...args: any[]) {
        const target = toRaw(this) as unknown[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let res = (target as any)[key].apply(target, [searchElement, ...args]);
        if ((res === -1 || res === false) && isProxy(searchElement)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res = (target as any)[key].apply(target, [toRaw(searchElement), ...args]);
        }
        return res;
    };
});

// 全局静态 Proxy Handler (彻底消除高频闭包开销)
const reactiveHandler: ProxyHandler<object> = {
    get(target, key, receiver) {
        if (key === RAW_SYMBOL) return target;

        if (Array.isArray(target) && Object.prototype.hasOwnProperty.call(arrayInstrumentations, key)) {
            return Reflect.get(arrayInstrumentations, key, receiver);
        }

        const val = Reflect.get(target, key, receiver);
        if (typeof key === 'symbol') return val;

        if (isObject(val) && !isNativeSkippable(val)) {
            const childProxy = getOrCreateProxy(val);
            // receiver 就是当前的 Proxy 实例
            const current = globalChildrenMap.get(receiver)?.get(key);
            if (current !== childProxy) {
                link(receiver, key, childProxy);
            }
            return childProxy;
        }

        return val;
    },

    set(target, key, newVal, receiver) {
        const oldVal = Reflect.get(target, key, receiver);
        // Keep raw objects in the source graph. Assigning a value read from a
        // reactive proxy should be a no-op when it is the same underlying
        // object, rather than storing a proxy and emitting a false change.
        const rawNewVal = toRaw(newVal);
        if (Object.is(oldVal, rawNewVal)) return true;

        const res = Reflect.set(target, key, rawNewVal, receiver);
        if (!res) return false;

        if (isObject(rawNewVal) && !isNativeSkippable(rawNewVal)) {
            const childProxy = getOrCreateProxy(rawNewVal);
            link(receiver, key, childProxy);
        } else {
            unlink(receiver, key);
        }

        const arrayDepth = globalArrayMutationDepth.get(receiver) || 0;
        if (arrayDepth === 0) {
            if (!Array.isArray(target) && Array.isArray(oldVal) && Array.isArray(rawNewVal)) {
                globalEmit(receiver, { type: 'array-replace', oldValue: oldVal, newValue: rawNewVal });
            } else {
                globalEmit(receiver, { type: 'set', key, newValue: rawNewVal, oldValue: oldVal });
            }
        }
        return res;
    },

    deleteProperty(target, key) {
        if (!Reflect.has(target, key)) return false;

        const oldVal = Reflect.get(target, key);
        const res = Reflect.deleteProperty(target, key);

        if (res) {
            // deleteProperty 没有 receiver 参数，从全局缓存获取当前 proxy 实例
            const proxy = globalProxyCache.get(target);
            if (proxy) {
                unlink(proxy, key);
                const arrayDepth = globalArrayMutationDepth.get(proxy) || 0;
                if (arrayDepth === 0) {
                    globalEmit(proxy, { type: 'delete', key, oldValue: oldVal });
                }
            }
        }
        return res;
    },
};

function getOrCreateProxy<T extends object>(target: T): T {
    if (!Object.isExtensible(target)) return target;
    if (isNativeSkippable(target)) return target;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((target as any)[RAW_SYMBOL]) return target;

    const cached = globalProxyCache.get(target);
    if (cached) return cached;

    // 直接复用全局单例 Handler
    const proxy = new Proxy(target, reactiveHandler) as T;
    globalProxyCache.set(target, proxy);

    return proxy;
}

/* ======================= observe 观察函数 ======================= */

export function observe<T extends object>(
    value: T,
    callback: (change: ChangeItem) => void,
    options: ObserveOptions = {},
): ObserveReturn<T> {
    const { throttle = 0, onBatch, immediate = false, deepCompare } = options;

    const filterPatterns = Array.isArray(options.filter) ? options.filter : options.filter ? [options.filter] : [];
    const filterRegexes = compileFilters(filterPatterns);

    const observerEntry: ObserverEntry = {
        callback,
        onBatch,
        throttle,
        filterRegexes,
        pending: [],
        timer: null,
        active: true,
        deepCompare,
    };

    const rootProxy = getOrCreateProxy(value);

    let observers = globalObservers.get(rootProxy);
    if (!observers) {
        observers = new Set();
        globalObservers.set(rootProxy, observers);
    }
    observers.add(observerEntry);

    if (immediate) {
        const rootObservers = observers;
        // 将快照提取到循环外部，防止大规模树遍历时重复解构产生 GC
        const snapshot = [...rootObservers];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const walk = (obj: any, currentProxy: any, path: PathKey[] = [], seen = new WeakSet<object>()) => {
            if (!isObject(obj) || seen.has(obj)) return;
            seen.add(obj);

            Reflect.ownKeys(obj).forEach(k => {
                const val = Reflect.get(obj, k);
                if (isObject(val) && seen.has(val)) return;

                const childProxy = Reflect.get(currentProxy, k);
                const childPath = [...path, k];

                snapshot.forEach(entry => {
                    if (!isPathMatched(childPath, entry.filterRegexes)) return;
                    const change: ChangeItem = {
                        type: 'set',
                        key: k,
                        newValue: val,
                        oldValue: undefined,
                        path: childPath,
                    };
                    dispatchToEntry(entry, change);
                });

                if (isObject(val) && !isNativeSkippable(val)) {
                    walk(val, childProxy, childPath, seen);
                }
            });
        };
        walk(toRaw(value), rootProxy);
    }

    const removeObserver = () => {
        const obs = globalObservers.get(rootProxy);
        if (obs) {
            obs.delete(observerEntry);
            if (obs.size === 0) {
                globalObservers.delete(rootProxy);
            }
        }
        observerEntry.pending = [];
        if (observerEntry.timer) {
            clearTimeout(observerEntry.timer);
            observerEntry.timer = null;
        }
    };

    const addObserver = () => {
        let obs = globalObservers.get(rootProxy);
        if (!obs) {
            obs = new Set();
            globalObservers.set(rootProxy, obs);
        }
        obs.add(observerEntry);
    };

    return {
        proxy: rootProxy,
        unobserve: () => {
            if (!observerEntry.active) return;
            observerEntry.active = false;
            removeObserver();
        },
        resume: () => {
            if (observerEntry.active) return;
            observerEntry.active = true;
            addObserver();
        },
        dispose: () => {
            if (!observerEntry.active) {
                observerEntry.callback = () => {};
                observerEntry.onBatch = undefined;
                return;
            }
            observerEntry.active = false;
            removeObserver();
            observerEntry.callback = () => {};
            observerEntry.onBatch = undefined;
        },
    };
}
