import { ASTType, IRBranch } from '../../types';
import { IRAttr, IRNode, IRRoot, Meta } from '../../types';
import { runtimeLoop } from '../../types';
import { IS_DEV, showTemplateError } from '../../shared';
import htmlDecode from './html-decode';

/**
 * 样式字符串解析正则
 * - Key: 非冒号分号字符
 * - Value: 优先匹配含括号内容 (url/calc)，否则匹配到分号
 */
const STYLE_PATTERN = /([^:;]+)\s*:\s*([^;]*\(.*?\)[^;]*|[^;]+)/g;

/** XML 命名空间前缀映射 */
const NS_PREFIXES = {
    xml: 'http://www.w3.org/XML/1998/namespace',
    xlink: 'http://www.w3.org/1999/xlink',
    xmlns: 'http://www.w3.org/2000/xmlns/',
} as const;

/** HTML attribute → DOM property 驼峰映射 */
const HTML_PROP_MAP: Record<string, string> = {
    readonly: 'readOnly',
    for: 'htmlFor',
    tabindex: 'tabIndex',
    contenteditable: 'contentEditable',
    maxlength: 'maxLength',
} as const;

/** 只能通过 setAttribute 设置的属性前缀/名称 */
const ATTR_ONLY_PROPS = new Set(['data-', 'aria-', 'role', 'form']);
/** 需在子节点挂载后才能设置的属性（如 select.value） */
const POST_CHILD_PROPS = new Set(['value', 'selectedIndex']);

/** 元素运行时数据，通过 WeakMap 存储以避免在 DOM 上挂载自定义属性 */
interface ElementRuntimeData {
    /** 当前 loops 上下文（事件回调时使用） */
    loops: runtimeLoop[] | null;
    /** 事件桶：按事件名分组，model 优先于 user 执行 */
    events: Record<string, EventBucket>;
    /** 上一次动态 class 快照，用于增量 diff */
    prevClassObj: Record<string, boolean> | undefined;
    /** 上一次动态 style 快照，用于增量 diff */
    prevStyleObj: Record<string, string> | undefined;
}

/** 事件桶：同一事件名下的 model（s-model）和 user 处理器 */
interface EventBucket {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: Array<(e: any) => void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: Array<(e: any) => void>;
    /** DOM listener 引用，用于销毁时 removeEventListener */
    listener: ((e: Event) => void) | null;
}

const elDataMap = new WeakMap<Element, ElementRuntimeData>();

/** 获取或创建元素的运行时数据 */
function getElData(el: Element): ElementRuntimeData {
    let data = elDataMap.get(el);
    if (!data) {
        data = {
            loops: null,
            events: Object.create(null),
            prevClassObj: undefined,
            prevStyleObj: undefined,
        };
        elDataMap.set(el, data);
    }
    return data;
}

/** 初始化静态 class 属性（仅首屏创建时调用一次） */
function initStaticClass(el: HTMLElement | SVGElement, irNode: IRNode) {
    const staticAttr = irNode.a?.find(a => a.k === 'class' && !a.d);
    if (staticAttr?.v) {
        el.setAttribute('class', staticAttr.v);
    }
}

/** 初始化静态 style 属性（仅首屏创建时调用一次） */
function initStaticStyle(el: HTMLElement | SVGElement, irNode: IRNode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyEl = el as any;
    if (!anyEl.style) return;
    const staticAttr = irNode.a?.find(a => a.k === 'style' && !a.d);
    const staticStyle = staticAttr ? flattenStyle(staticAttr.v) : {};
    for (const key in staticStyle) {
        const val = staticStyle[key];
        if (key.startsWith('--')) el.style.setProperty(key, val);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        else (el.style as any)[key] = val;
    }
}

/** 增量更新动态样式：与上次快照 diff，仅变更差异部分 */
const setElementStyles = (el: HTMLElement, dynamicStyle: unknown): void => {
    const data = getElData(el);
    const dynamic = flattenStyle(dynamicStyle);
    const prevDynamic = data.prevStyleObj;

    if (!prevDynamic) {
        for (const key in dynamic) {
            const val = dynamic[key];
            if (key.startsWith('--')) el.style.setProperty(key, val);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            else (el.style as any)[key] = val;
        }
        data.prevStyleObj = dynamic;
        return;
    }

    let hasChanged = false;
    for (const key in prevDynamic) {
        if (!(key in dynamic)) {
            if (key.startsWith('--')) el.style.removeProperty(key);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            else (el.style as any)[key] = '';
            hasChanged = true;
        }
    }
    for (const key in dynamic) {
        const newVal = dynamic[key];
        const oldVal = prevDynamic[key];
        if (newVal !== oldVal) {
            if (key.startsWith('--')) el.style.setProperty(key, newVal);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            else (el.style as any)[key] = newVal;
            hasChanged = true;
        }
    }
    if (hasChanged) {
        data.prevStyleObj = dynamic;
    }
};

/** 校验 class 名是否合法（不含空白） */
const isValidClassName = (name: string): boolean => {
    if (!name || name.length === 0) return false;
    if (/\s/.test(name)) {
        if (IS_DEV) {
            console.warn(`[Solely] Invalid class name "${name}" contains whitespace, will be ignored`);
        }
        return false;
    }
    return true;
};

/** 增量更新动态 class：批量 add/remove，仅变更差异部分 */
const setElementClasses = (el: HTMLElement | SVGElement, dynamicClass: unknown): void => {
    const data = getElData(el);
    const lastDynamic = data.prevClassObj;
    const currentDynamic = flattenClasses(dynamicClass);
    const validCurrent: Record<string, boolean> = {};
    for (const cls in currentDynamic) {
        if (isValidClassName(cls)) {
            validCurrent[cls] = currentDynamic[cls];
        }
    }

    if (!lastDynamic) {
        const toAdd: string[] = [];
        for (const cls in validCurrent) toAdd.push(cls);
        if (toAdd.length) el.classList.add(...toAdd);
        data.prevClassObj = validCurrent;
        return;
    }

    const toAdd: string[] = [];
    const toRemove: string[] = [];
    for (const cls in lastDynamic) {
        if (!validCurrent[cls]) toRemove.push(cls);
    }
    for (const cls in validCurrent) {
        if (!lastDynamic[cls]) toAdd.push(cls);
    }

    if (toAdd.length || toRemove.length) {
        if (toAdd.length) el.classList.add(...toAdd);
        if (toRemove.length) el.classList.remove(...toRemove);
        data.prevClassObj = validCurrent;
    }
};

/** 将样式扁平化 */
function flattenStyle(styleObj: unknown): Record<string, string> {
    const result: Record<string, string> = {};
    const stack: [unknown, string?][] = [[styleObj]];

    while (stack.length) {
        const [obj, prefix] = stack.pop() || [];
        if (!obj) continue;

        if (typeof obj === 'string') {
            STYLE_PATTERN.lastIndex = 0;
            let match;
            while ((match = STYLE_PATTERN.exec(obj)) !== null) {
                const key = match[1].trim();
                const value = match[2].trim();
                if (key && value) result[key] = value;
            }
            continue;
        }

        if (Array.isArray(obj)) {
            for (let i = obj.length - 1; i >= 0; i--) stack.push([obj[i]]);
            continue;
        }

        if (typeof obj === 'object') {
            const rec = obj as Record<string, unknown>;
            for (const k in rec) {
                const v = rec[k];
                if (v === null || v === undefined) continue;
                const fullKey = prefix ? `${prefix}-${k}` : k;
                if (typeof v === 'object' && !Array.isArray(v)) {
                    stack.push([v, fullKey]);
                } else {
                    result[fullKey] = String(v);
                }
            }
        }
    }
    return result;
}

/** 将 class 值扁平化 */
function flattenClasses(classObj: unknown): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    const stack = [classObj];
    while (stack.length) {
        const obj = stack.pop();
        if (!obj) continue;
        if (typeof obj === 'string') {
            const parts = obj.split(' ');
            for (let i = 0; i < parts.length; i++) {
                const c = parts[i].trim();
                if (c) result[c] = true;
            }
        } else if (Array.isArray(obj)) {
            for (let i = obj.length - 1; i >= 0; i--) stack.push(obj[i]);
        } else if (typeof obj === 'object') {
            const rec = obj as Record<string, unknown>;
            for (const k in rec) if (rec[k]) result[k] = true;
        }
    }
    return result;
}

/** 设置元素 attribute，带脏检查和 XML 命名空间支持 */
function setAttribute(el: Element, key: string, value: unknown): void {
    const strVal = value == null ? '' : String(value);
    const colonIndex = key.indexOf(':');
    if (colonIndex > 0) {
        const prefix = key.slice(0, colonIndex);
        const ns = NS_PREFIXES[prefix as keyof typeof NS_PREFIXES];
        if (ns) {
            if (el.getAttributeNS(ns, key) !== strVal) {
                el.setAttributeNS(ns, key, strVal);
            }
            return;
        }
    }
    if (el.getAttribute(key) !== strVal) {
        el.setAttribute(key, strVal);
    }
}

/** 安全地将属性值设置到 DOM 元素上 */
function setProperty(el: Element, propKey: string, value: unknown, isSVGHint?: boolean): void {
    const camelKey = HTML_PROP_MAP[propKey] || propKey;
    if (propKey.startsWith('data-') || propKey.startsWith('aria-') || ATTR_ONLY_PROPS.has(propKey)) {
        setAttribute(el, propKey, value);
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyEl = el as any;
    const tagName = anyEl.tagName;
    if (value == null) {
        if (typeof anyEl[camelKey] === 'boolean') {
            if (anyEl[camelKey] !== false) anyEl[camelKey] = false;
        } else {
            const current = anyEl[camelKey];
            if (current !== '' && current !== undefined) anyEl[camelKey] = '';
            if (el.hasAttribute(propKey)) el.removeAttribute(propKey);
        }
        return;
    }

    if (camelKey === 'src' || camelKey === 'href') {
        const strValue = String(value);
        if (anyEl[camelKey] === strValue || el.getAttribute(camelKey) === strValue) return;
    }

    if (camelKey === 'value') {
        if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
            if (anyEl.value === value) return;
        }
    }

    if (typeof value === 'boolean') {
        if (anyEl[camelKey] === value) return;
        anyEl[camelKey] = value;
        return;
    }

    const isSVG = isSVGHint ?? (el instanceof SVGElement || anyEl.ownerSVGElement !== undefined);
    if (isSVG && !HTML_PROP_MAP[propKey]) {
        setAttribute(el, propKey, value);
    } else if (anyEl[camelKey] !== value) {
        anyEl[camelKey] = value;
    }
}

/** 节点映射条目 */
interface NodeEntry {
    irNode: IRNode;
    node: Node;
    loops: runtimeLoop[];
    /** 所属 keepalive 分支的 key */
    kaKey?: string;
}

/** Keepalive 缓存条目 */
interface KaCacheEntry {
    fragment: DocumentFragment;
    entries: Array<[string, NodeEntry]>;
    lastUsed: number;
    /** 是否正在显示中（恢复后未再次缓存），LRU 淘汰时跳过 */
    active: boolean;
}

/**
 * IR 渲染器：将 IR 中间树渲染为真实 DOM
 * - 支持静态子树克隆缓存
 * - 支持 keepalive 分支 LRU 缓存并支持内部完整树 Reconciliation
 * - 支持高效精确生命周期控制与全面的事件 GC 清理
 */
export class IRRenderer {
    private nodeMap = new Map<string, NodeEntry>();
    private prevNodeMap = new Map<string, NodeEntry>();
    private pathStack: number[] = [];
    private pathKey = '';
    private staticSubtreeCache = new Map<string, Node>();
    private keepaliveCache = new Map<string, KaCacheEntry>();

    private currentKaKey: string | null = null;
    private kaDepth = 0;
    private isKaRestoring = false;
    private rafIds = new Set<number>();
    private keepaliveAccessCounter = 0;
    private readonly maxKeepalive = 20;

    /** 核心追踪：记录当前帧中真实活跃或被完全恢复的 Keepalive 分支 Key 集合 */
    private renderedKaKeys = new Set<string>();

    constructor(
        private ir: IRRoot,
        private container: HTMLElement,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        private scope: any = {},
    ) {}

    private scheduleRaf(callback: () => void): number {
        const id = requestAnimationFrame(() => {
            this.rafIds.delete(id);
            callback();
        });
        this.rafIds.add(id);
        return id;
    }

    private pushPath(idx: number) {
        this.pathStack.push(idx);
        this.pathKey = this.pathStack.join('.');
    }

    private popPath() {
        this.pathStack.pop();
        this.pathKey = this.pathStack.join('.');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evalIR(fid: number, args: any[], meta?: Meta) {
        const fn = this.ir.fns[fid - 1];
        if (IS_DEV) {
            try {
                return fn ? fn.apply(this.scope, args) : '';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (e: any) {
                showTemplateError(e.message || e.toString(), this.ir.m?.src || '', meta, this.scope.tagName);
                return '';
            }
        }
        return fn ? fn.apply(this.scope, args) : '';
    }

    private createElement(irNode: IRNode, parent: Node): SVGElement | HTMLElement {
        const tag = irNode.g ?? '';
        const isSVG = parent instanceof SVGElement || tag === 'svg';
        return isSVG ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    }

    private createText(irNode: IRNode, loops: runtimeLoop[]): Text {
        const value = irNode.d ? this.evalIR(irNode.f ?? -1, [loops], irNode.__m) : htmlDecode(irNode.x || '');
        return document.createTextNode(value);
    }

    private createComment(irNode: IRNode, loops: runtimeLoop[]): Comment {
        const value = irNode.d ? this.evalIR(irNode.f ?? -1, [loops], irNode.__m) : irNode.x || '';
        return document.createComment(value);
    }

    /** 统一元素事件解绑助手，防止闭包级物理内存泄露 */
    private removeEventListenersFromNode(node: Node) {
        const data = elDataMap.get(node as Element);
        if (data) {
            for (const [eventName, bucket] of Object.entries(data.events)) {
                if (bucket.listener) {
                    (node as Element).removeEventListener(eventName, bucket.listener);
                }
            }
        }
    }

    private applyAttrs(
        el: Element,
        attrs: IRAttr[],
        loops: runtimeLoop[],
        isUpdate = false,
        isKeepaliveRestore = false,
    ) {
        const postTasks: (() => void)[] = [];
        const data = getElData(el);
        const isSVG =
            el instanceof SVGElement || // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (el as any).ownerSVGElement !== undefined;
        data.loops = loops;

        let dynamicClassVal: string | undefined = undefined;
        let hasDynamicClass = false;
        let dynamicStyleVal: string | undefined = undefined;
        let hasDynamicStyle = false;

        for (const attr of attrs) {
            const { k: key, f: fid, d: dynamic, v: staticValue } = attr;
            if (key === ':class') {
                dynamicClassVal = this.evalIR(fid ?? -1, [loops], attr.__m);
                hasDynamicClass = true;
                continue;
            }
            if (key === ':style') {
                dynamicStyleVal = this.evalIR(fid ?? -1, [loops], attr.__m);
                hasDynamicStyle = true;
                continue;
            }
            if (key === 'class' || key === 'style') continue;
            const first = key[0];

            if (first === '@') {
                const eventName = key.slice(1);
                const role = attr.r ?? 'user';
                let bucket = data.events[eventName];
                if (!bucket) {
                    bucket = { model: [], user: [], listener: null };
                    const listener = (e: Event) => {
                        for (const fn of bucket.model) fn(e);
                        for (const fn of bucket.user) fn(e);
                    };
                    bucket.listener = listener;
                    el.addEventListener(eventName, listener);
                    data.events[eventName] = bucket;
                }
                if (!isUpdate) {
                    const handler = (e: Event) => this.evalIR(fid ?? -1, [e, data.loops], attr.__m);
                    bucket[role].push(handler);
                }
                continue;
            }

            if (key === 'mounted') {
                if (!isUpdate && !isKeepaliveRestore) {
                    this.scheduleRaf(() => this.evalIR(fid ?? -1, [el, loops], attr.__m));
                }
                continue;
            }

            if (key === 'activated') {
                if (isKeepaliveRestore) {
                    this.scheduleRaf(() => this.evalIR(fid ?? -1, [el, loops], attr.__m));
                }
                continue;
            }

            if (key === 'deactivated') continue;

            if (key === 'updated') {
                // 完美的生命周期拦截：只有处于正常数据更新阶段，且并非 Keepalive 缓存恢复阶段，才触发 updated
                if (isUpdate && !isKeepaliveRestore) {
                    this.scheduleRaf(() => this.evalIR(fid ?? -1, [el, loops], attr.__m));
                }
                continue;
            }

            if (key === 'ref' && staticValue) {
                this.scope.$refs = this.scope.$refs || {};
                this.scope.$refs[staticValue] = el;
                continue;
            }

            const val = dynamic ? this.evalIR(fid ?? -1, [loops], attr.__m) : (staticValue ?? '');

            if (first === ':') {
                const prop = key.slice(1);
                if (el.tagName === 'SELECT' && POST_CHILD_PROPS.has(prop)) {
                    postTasks.push(() => setProperty(el, prop, val, isSVG));
                } else {
                    setProperty(el, prop, val, isSVG);
                }
            } else if (!isUpdate) {
                setAttribute(el, key, String(val));
            }
        }

        if (hasDynamicClass) setElementClasses(el as HTMLElement, dynamicClassVal);
        if (hasDynamicStyle) setElementStyles(el as HTMLElement, dynamicStyleVal);

        return postTasks;
    }

    private updateNode(node: Node, irNode: IRNode, loops: runtimeLoop[]) {
        const newText = irNode.d ? this.evalIR(irNode.f ?? -1, [loops], irNode.__m) : irNode.x || '';
        if (irNode.d && node.textContent !== newText) {
            node.textContent = newText;
        }
    }

    private createStaticSubtree(irNode: IRNode, parentNode: Node, loops: runtimeLoop[]): Node {
        switch (irNode.t) {
            case ASTType.Element: {
                const node = this.createElement(irNode, parentNode);
                initStaticClass(node as HTMLElement, irNode);
                initStaticStyle(node as HTMLElement, irNode);
                const postTasks = this.applyAttrs(node as HTMLElement, irNode.a ?? [], loops);
                irNode.c?.forEach(child => {
                    const childNode = this.createStaticSubtree(child, node, loops);
                    node.appendChild(childNode);
                });
                postTasks.forEach(fn => fn());
                return node;
            }
            case ASTType.Text:
                return this.createText(irNode, loops);
            case ASTType.Comment:
                return this.createComment(irNode, loops);
            default:
                return document.createComment('unknown');
        }
    }

    private handleStaticSubtree(irNode: IRNode, key: string, parentNode: Node, loops: runtimeLoop[]): Node {
        const cached = this.staticSubtreeCache.get(key);
        if (cached) {
            const clone = cached.cloneNode(true);
            parentNode.appendChild(clone);
            return clone;
        }
        const node = this.createStaticSubtree(irNode, parentNode, loops);
        parentNode.appendChild(node);
        this.staticSubtreeCache.set(key, node.cloneNode(true));
        return node;
    }

    private currentKey(): string {
        return this.pathKey;
    }

    private findEntry(key: string): NodeEntry | undefined {
        let entry = this.nodeMap.get(key);
        if (!entry) {
            entry = this.prevNodeMap.get(key);
            if (entry) {
                this.prevNodeMap.delete(key);
                this.nodeMap.set(key, entry);
            }
        }
        return entry;
    }

    private registerNode(key: string, irNode: IRNode, node: Node, loops: runtimeLoop[]): void {
        const entry: NodeEntry = this.currentKaKey
            ? { irNode, node, loops, kaKey: this.currentKaKey }
            : { irNode, node, loops };
        this.nodeMap.set(key, entry);
    }

    private processNode(irNode: IRNode, parentNode: Node, loops: runtimeLoop[]) {
        const key = this.currentKey();
        const existing = this.findEntry(key);
        let node: Node | undefined = undefined;

        if (irNode.s === 1) {
            if (existing) {
                node = existing.node;
            } else {
                node = this.handleStaticSubtree(irNode, key, parentNode, loops);
                this.registerNode(key, irNode, node, loops);
            }
            return;
        }

        if (existing) {
            node = existing.node;
            let postTasks: (() => void)[] = [];
            if (irNode.d) {
                if (irNode.t === ASTType.Element) {
                    postTasks = this.applyAttrs(node as Element, irNode.a ?? [], loops, true, this.isKaRestoring);
                } else {
                    this.updateNode(node, irNode, loops);
                }
            }
            irNode.c?.forEach((child, childIdx) => {
                this.pushPath(childIdx);
                this.processNode(child, node as Node, loops);
                this.popPath();
            });
            postTasks.forEach(fn => fn());
        } else {
            switch (irNode.t) {
                case ASTType.Element:
                    node = this.createElement(irNode, parentNode);
                    initStaticClass(node as HTMLElement, irNode);
                    initStaticStyle(node as HTMLElement, irNode);
                    const postTasks = this.applyAttrs(node as HTMLElement, irNode.a ?? [], loops);
                    parentNode.appendChild(node);
                    this.registerNode(key, irNode, node, loops);
                    irNode.c?.forEach((child, childIdx) => {
                        this.pushPath(childIdx);
                        this.processNode(child, node as Node, loops);
                        this.popPath();
                    });
                    postTasks.forEach(fn => fn());
                    break;
                case ASTType.Text:
                    node = this.createText(irNode, loops);
                    parentNode.appendChild(node);
                    this.registerNode(key, irNode, node, loops);
                    break;
                case ASTType.Comment:
                    node = this.createComment(irNode, loops);
                    parentNode.appendChild(node);
                    this.registerNode(key, irNode, node, loops);
                    break;
                case ASTType.For: {
                    this.pushPath(-1);
                    const anchorKey = this.currentKey();
                    this.popPath();

                    let anchor = this.findEntry(anchorKey)?.node as Comment | undefined;
                    if (!anchor) {
                        anchor = document.createComment('for');
                        parentNode.appendChild(anchor);
                        this.registerNode(anchorKey, { t: ASTType.Comment } as IRNode, anchor, loops);
                    }

                    const list = this.evalIR(irNode.f ?? -1, [loops], irNode.__m) || [];
                    const fragment = document.createDocumentFragment();
                    list.forEach((item: unknown, i: number) => {
                        const childLoops = [...loops, { itmVal: item, idxVal: i }];
                        irNode.c?.forEach((child, childIdx) => {
                            this.pushPath(i);
                            this.pushPath(childIdx);
                            this.processNode(child, fragment as Node, childLoops);
                            this.popPath();
                            this.popPath();
                        });
                    });
                    anchor.parentNode?.insertBefore(fragment, anchor);
                    break;
                }
                case ASTType.Conditional: {
                    this.pushPath(-1);
                    const anchorKey = this.currentKey();
                    this.popPath();

                    let anchor = this.findEntry(anchorKey)?.node as Comment | undefined;
                    if (!anchor) {
                        anchor = document.createComment('if');
                        parentNode.appendChild(anchor);
                        this.registerNode(anchorKey, {} as IRNode, anchor, loops);
                    }

                    for (let ifIdx = 0; ifIdx < (irNode.b || []).length; ifIdx++) {
                        const branch = irNode.b?.[ifIdx] as IRBranch;
                        const matched = branch.f === null || this.evalIR(branch.f, [loops], branch.__m);
                        if (matched) {
                            this.pushPath(ifIdx);
                            const branchKey = this.currentKey();
                            this.popPath();

                            if (branch.ka === 1) {
                                this.renderedKaKeys.add(branchKey);
                                const cached = this.keepaliveCache.get(branchKey);

                                if (cached && !cached.active) {
                                    // 完美的缓存恢复策略：
                                    // 1. 将物理 DOM 重回页面中
                                    anchor.parentNode?.insertBefore(cached.fragment, anchor);

                                    // 2. 关键优化：注入到 prevNodeMap，而不是注入到 nodeMap
                                    // 使得接下来的完整 processNode 递归中可以利用标准树 Diff 对内部所有的 If/For 进行结构性对齐
                                    for (const [k, entry] of cached.entries) {
                                        this.prevNodeMap.set(k, entry);
                                    }

                                    cached.active = true;
                                    cached.lastUsed = ++this.keepaliveAccessCounter;

                                    const prevKaRestoring = this.isKaRestoring;
                                    this.isKaRestoring = true;

                                    const prevKaKey = this.currentKaKey;
                                    this.currentKaKey = branchKey;
                                    this.kaDepth++;

                                    if (IS_DEV && this.kaDepth > 1) {
                                        console.warn(
                                            '[Solely] Nested keepalive is not supported. ' +
                                                'Inner keepalive branches may not cache correctly.',
                                        );
                                    }

                                    // 3. 执行完整、安全的递归 Reconciliation
                                    branch.c.forEach((child, childIdx) => {
                                        this.pushPath(ifIdx);
                                        this.pushPath(childIdx);
                                        this.processNode(child, parentNode, loops);
                                        this.popPath();
                                        this.popPath();
                                    });

                                    this.kaDepth--;
                                    this.currentKaKey = prevKaKey;
                                    this.isKaRestoring = prevKaRestoring;
                                } else {
                                    if (cached && cached.active) {
                                        cached.lastUsed = ++this.keepaliveAccessCounter;
                                    }
                                    const prevKaKey = this.currentKaKey;
                                    this.currentKaKey = branchKey;
                                    this.kaDepth++;
                                    if (IS_DEV && this.kaDepth > 1) {
                                        console.warn(
                                            '[Solely] Nested keepalive is not supported. ' +
                                                'Inner keepalive branches may not cache correctly.',
                                        );
                                    }

                                    const firstChildKey = branchKey + '.0';
                                    const existingBranch = this.prevNodeMap.get(firstChildKey);

                                    if (existingBranch) {
                                        // 原地更新
                                        branch.c.forEach((child, childIdx) => {
                                            this.pushPath(ifIdx);
                                            this.pushPath(childIdx);
                                            this.processNode(child, parentNode, loops);
                                            this.popPath();
                                            this.popPath();
                                        });
                                    } else {
                                        // 首次初创
                                        const fragment = document.createDocumentFragment();
                                        branch.c.forEach((child, childIdx) => {
                                            this.pushPath(ifIdx);
                                            this.pushPath(childIdx);
                                            this.processNode(child, fragment as Node, loops);
                                            this.popPath();
                                            this.popPath();
                                        });
                                        anchor.parentNode?.insertBefore(fragment, anchor);
                                    }
                                    this.kaDepth--;
                                    this.currentKaKey = prevKaKey;
                                }
                            } else {
                                // 普通条件分支路由
                                const fragment = document.createDocumentFragment();
                                branch.c.forEach((child, childIdx) => {
                                    this.pushPath(ifIdx);
                                    this.pushPath(childIdx);
                                    this.processNode(child, fragment as Node, loops);
                                    this.popPath();
                                    this.popPath();
                                });
                                anchor.parentNode?.insertBefore(fragment, anchor);
                            }
                            break;
                        }
                    }
                    break;
                }
                default:
                    break;
            }
        }
    }

    /** LRU 淘汰：当 keepalive 缓存超过上限时安全移除最久未用的非 active 条目 */
    private evictKeepaliveIfNeeded() {
        let inactiveCount = 0;
        for (const [, v] of this.keepaliveCache.entries()) {
            if (!v.active) inactiveCount++;
        }
        if (inactiveCount <= this.maxKeepalive) return;

        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [k, v] of this.keepaliveCache.entries()) {
            if (v.active) continue;
            if (v.lastUsed < oldestTime) {
                oldestTime = v.lastUsed;
                oldestKey = k;
            }
        }

        if (oldestKey) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const entry = this.keepaliveCache.get(oldestKey)!;
            for (const [, nodeEntry] of entry.entries) {
                this.removeEventListenersFromNode(nodeEntry.node);
                if (nodeEntry.irNode.a) {
                    const unmountedAttr = nodeEntry.irNode.a.find(a => a.k === 'unmounted');
                    if (unmountedAttr) {
                        this.scheduleRaf(() => {
                            this.evalIR(unmountedAttr.f ?? -1, [nodeEntry.node, nodeEntry.loops], unmountedAttr.__m);
                        });
                    }
                }
                (nodeEntry.node as HTMLElement | null)?.remove();
            }
            this.keepaliveCache.delete(oldestKey);
        }
    }

    /**
     * 增量清理旧节点算法
     * 优雅地在“全分支休眠(deactivated)”与“内部嵌套结构销毁(unmounted)”之间进行精确切换
     */
    private cleanupOldNodes() {
        const oldMap = this.prevNodeMap;
        const kaGroups = new Map<string, { fragment: DocumentFragment; entries: Array<[string, NodeEntry]> }>();

        for (const [key, entry] of oldMap.entries()) {
            const { irNode, node, loops } = entry;

            // 完美的判断条件：若节点带有 kaKey 标记，但其所属的 Keepalive 分支目前正处于存活显示状态，
            // 说明它不是“整个分支休眠”，而是“分支内部由于 If/For 动态更新而产生的多余淘汰节点”！
            const isInnerDestroy = entry.kaKey && this.renderedKaKeys.has(entry.kaKey);

            if (irNode.a) {
                if (entry.kaKey && !isInnerDestroy) {
                    // 整个分支切走，安全挂起，调用 deactivated
                    const deactivatedAttr = irNode.a.find(a => a.k === 'deactivated');
                    if (deactivatedAttr) {
                        this.scheduleRaf(() =>
                            this.evalIR(deactivatedAttr.f ?? -1, [node, loops], deactivatedAttr.__m),
                        );
                    }
                } else {
                    // 普通元素卸载，或者 Keepalive 内部的淘汰节点，应当真正走向生命终点，调用 unmounted
                    const unmountedAttr = irNode.a.find(a => a.k === 'unmounted');
                    if (unmountedAttr) {
                        this.scheduleRaf(() => this.evalIR(unmountedAttr.f ?? -1, [node, loops], unmountedAttr.__m));
                    }
                }
                const refAttr = irNode.a.find(a => a.k === 'ref');
                if (refAttr && refAttr.v) {
                    delete this.scope.$refs[refAttr.v];
                }
            }

            if (entry.kaKey && !isInnerDestroy && node.parentNode) {
                // 只有真正被切走的休眠节点才加入到 Keepalive 缓存容器中
                let group = kaGroups.get(entry.kaKey);
                if (!group) {
                    group = { fragment: document.createDocumentFragment(), entries: [] };
                    kaGroups.set(entry.kaKey, group);
                }
                const branchDepth = entry.kaKey.split('.').length;
                const nodeDepth = key.split('.').length;
                if (nodeDepth === branchDepth + 1) {
                    group.fragment.appendChild(node);
                }
                group.entries.push([key, entry]);
            } else {
                // 普通节点或组件内多余淘汰节点：清除事件，拔除 DOM
                this.removeEventListenersFromNode(node);
                (node as HTMLElement | null)?.remove();
            }
        }

        for (const [branchKey, group] of kaGroups.entries()) {
            const existing = this.keepaliveCache.get(branchKey);
            if (existing && existing.active) {
                existing.fragment = group.fragment;
                existing.entries = group.entries;
                existing.active = false; // 进入休眠
                existing.lastUsed = ++this.keepaliveAccessCounter;
            } else if (!existing) {
                this.keepaliveCache.set(branchKey, {
                    fragment: group.fragment,
                    entries: group.entries,
                    lastUsed: ++this.keepaliveAccessCounter,
                    active: false,
                });
            }
        }

        this.evictKeepaliveIfNeeded();
        oldMap.clear();
    }

    mount() {
        this.renderedKaKeys.clear();
        this.prevNodeMap = this.nodeMap;
        this.nodeMap = new Map<string, NodeEntry>();
        this.pathStack.length = 0;
        this.pathKey = '';
        this.ir.n.forEach((node, idx) => {
            this.irToNode(node, idx, this.container, []);
        });
        this.cleanupOldNodes();
    }

    update() {
        this.renderedKaKeys.clear();
        this.prevNodeMap = this.nodeMap;
        this.nodeMap = new Map<string, NodeEntry>();
        this.pathStack.length = 0;
        this.pathKey = '';
        this.ir.n.forEach((node, idx) => {
            this.irToNode(node, idx, this.container, []);
        });
        this.cleanupOldNodes();
    }

    destroy() {
        this.rafIds.forEach(id => cancelAnimationFrame(id));
        this.rafIds.clear();

        const removeListeners = (map: Map<string, NodeEntry>) => {
            for (const [, entry] of map.entries()) {
                this.removeEventListenersFromNode(entry.node);
            }
        };
        removeListeners(this.nodeMap);
        removeListeners(this.prevNodeMap);

        for (const [, kaEntry] of this.keepaliveCache.entries()) {
            for (const [, nodeEntry] of kaEntry.entries) {
                this.removeEventListenersFromNode(nodeEntry.node);
                if (nodeEntry.irNode.a) {
                    const unmountedAttr = nodeEntry.irNode.a.find(a => a.k === 'unmounted');
                    if (unmountedAttr) {
                        this.evalIR(unmountedAttr.f ?? -1, [nodeEntry.node, nodeEntry.loops], unmountedAttr.__m);
                    }
                }
                (nodeEntry.node as HTMLElement | null)?.remove();
            }
        }

        this.container.innerHTML = '';
        this.scope.$refs = {};
        this.nodeMap.clear();
        this.prevNodeMap.clear();
        this.staticSubtreeCache.clear();
        this.keepaliveCache.clear();
        this.renderedKaKeys.clear();
    }

    private irToNode(irNode: IRNode, index: number, parentNode: Node, loops: runtimeLoop[]) {
        this.pushPath(index);
        this.processNode(irNode, parentNode, loops);
        this.popPath();
    }
}

export interface IRRenderInstance {
    update: () => void;
    destroy: () => void;
}

export const createRender = (ir: IRRoot, el: HTMLElement, ctx: unknown = {}): IRRenderInstance => {
    const renderer = new IRRenderer(ir, el, ctx);
    renderer.mount();
    return {
        update: () => renderer.update(),
        destroy: () => renderer.destroy(),
    };
};
