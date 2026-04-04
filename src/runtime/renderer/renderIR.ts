import { ASTType } from '../../types';
import { IRAttr, IRNode, IRRoot, Meta } from '../../types';
import { runtimeLoop } from '../../types';
import { IS_DEV, showTemplateError } from '../../shared';

const IRCTX_SYMBOL = Symbol('solely.irCtx');
const IR_EVENTS_SYMBOL = Symbol('solely.irEvents');

const PREV_CLASS_OBJ = Symbol('solely.prevClassObj');
const PREV_STYLE_OBJ = Symbol('solely.prevStyleObj');

const NS_PREFIXES = {
    xml: 'http://www.w3.org/XML/1998/namespace',
    xlink: 'http://www.w3.org/1999/xlink',
    xmlns: 'http://www.w3.org/2000/xmlns/',
} as const;

const HTML_PROP_MAP: Record<string, string> = {
    readonly: 'readOnly',
    for: 'htmlFor',
    tabindex: 'tabIndex',
    contenteditable: 'contentEditable',
    maxlength: 'maxLength',
} as const;

// data-* / aria-* / role / form 等只能用 setAttribute
const ATTR_ONLY_PROPS = new Set(['data-', 'aria-', 'role', 'form']);

const POST_CHILD_PROPS = new Set(['value', 'selectedIndex']);

function initStaticClass(el: HTMLElement | SVGElement, irNode: IRNode) {
    const staticAttr = irNode.a?.find(a => a.k === 'class' && !a.d);
    if (staticAttr?.v) {
        // 无论 HTML 还是 SVG，这都是最稳妥的首屏赋值方式
        el.setAttribute('class', staticAttr.v);
    }
}

function initStaticStyle(el: HTMLElement | SVGElement, irNode: IRNode) {
    const anyEl = el as any;
    if (!anyEl.style) return;
    const staticAttr = irNode.a?.find(a => a.k === 'style' && !a.d);
    // flatten 成 key-value 对象
    const staticStyle = staticAttr ? flattenStyle(staticAttr.v) : {};

    // 写入 DOM（只写一次）
    for (const key in staticStyle) {
        const val = staticStyle[key];
        if (key.startsWith('--')) el.style.setProperty(key, val);
        else (el.style as any)[key] = val;
    }
}

/**
 * 样式动态设置函数 (支持引用检查 + 增量更新)
 */
const setElementStyles = (el: HTMLElement, dynamicStyle: any): void => {
    const anyEl = el as any;

    const dynamic = flattenStyle(dynamicStyle);
    const prevDynamic = anyEl[PREV_STYLE_OBJ];

    if (!prevDynamic) {
        for (const key in dynamic) {
            const val = dynamic[key];
            if (key.startsWith('--')) el.style.setProperty(key, val);
            else (el.style as any)[key] = val;
        }
        anyEl[PREV_STYLE_OBJ] = dynamic;
        return;
    }

    let hasChanged = false;

    // A. 检查并移除旧样式
    for (const key in prevDynamic) {
        if (!(key in dynamic)) {
            if (key.startsWith('--')) el.style.removeProperty(key);
            else (el.style as any)[key] = '';
            hasChanged = true;
        }
    }

    // B. 检查并更新/添加新样式
    for (const key in dynamic) {
        const newVal = dynamic[key];
        const oldVal = prevDynamic[key];

        if (newVal !== oldVal) {
            if (key.startsWith('--')) el.style.setProperty(key, newVal);
            else (el.style as any)[key] = newVal;
            hasChanged = true;
        }
    }

    if (hasChanged) {
        anyEl[PREV_STYLE_OBJ] = dynamic;
    }
};

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

const setElementClasses = (el: HTMLElement | SVGElement, dynamicClass: any): void => {
    const anyEl = el as any;
    const lastDynamic = anyEl[PREV_CLASS_OBJ];
    const currentDynamic = flattenClasses(dynamicClass);

    const validCurrent: Record<string, boolean> = {};
    for (const cls in currentDynamic) {
        if (isValidClassName(cls)) {
            validCurrent[cls] = currentDynamic[cls];
        }
    }

    // 1. 初次渲染处理
    if (!lastDynamic) {
        for (const cls in validCurrent) {
            el.classList.add(cls);
        }
        anyEl[PREV_CLASS_OBJ] = validCurrent;
        return;
    }

    let hasChanged = false;

    // 2. 移除旧的：在上一次有，但这一次没有的 class
    for (const cls in lastDynamic) {
        if (!validCurrent[cls]) {
            el.classList.remove(cls);
            hasChanged = true;
        }
    }

    // 3. 添加新的：在这一次有，但上一次没有的 class
    for (const cls in validCurrent) {
        if (!lastDynamic[cls]) {
            el.classList.add(cls);
            hasChanged = true;
        }
    }

    // 4. 只有发生变化时才覆盖缓存
    if (hasChanged) {
        anyEl[PREV_CLASS_OBJ] = validCurrent;
    }
};

/**
 * 样式扁平化处理函数
 * 支持:
 * 1. 字符串: "color: red; background: url(data:image/png;base64,xxx;)"
 * 2. 数组: [{color: 'red'}, "margin: 10px"]
 * 3. 对象: { color: 'red', '--custom-var': 'blue', nested: { opacity: 0.5 } }
 */
function flattenStyle(styleObj: any): Record<string, string> {
    const result: Record<string, string> = {};
    const stack: [any, string?][] = [[styleObj]];

    while (stack.length) {
        const [obj, prefix] = stack.pop()!;

        if (!obj) continue;

        // 1. 处理字符串类型 (增加正则状态机，防止切碎 url/calc)
        if (typeof obj === 'string') {
            // 正则说明：
            // ([^:;]+) -> 匹配 Key (非冒号分号字符)
            // \s*:\s* -> 匹配冒号及周围空格
            // (        -> 开始匹配 Value
            //   [^;]*\(.*?\)[^;]* -> 优先匹配包含括号的内容 (如 url(...), calc(...))
            //   | [^;]+           -> 或者匹配到分号为止的普通字符串
            // )
            const pattern = /([^:;]+)\s*:\s*([^;]*\(.*?\)[^;]*|[^;]+)/g;
            let match;
            while ((match = pattern.exec(obj)) !== null) {
                const key = match[1].trim();
                const value = match[2].trim();
                if (key && value) {
                    result[key] = value;
                }
            }
            continue;
        }

        // 2. 处理数组类型 (递归压栈)
        if (Array.isArray(obj)) {
            for (let i = obj.length - 1; i >= 0; i--) {
                stack.push([obj[i]]);
            }
            continue;
        }

        // 3. 处理对象类型 (支持 CSS 变量和简单的嵌套)
        if (typeof obj === 'object') {
            for (const k in obj) {
                const v = obj[k];
                if (v === null || v === undefined) continue;

                const fullKey = prefix ? `${prefix}-${k}` : k;

                if (typeof v === 'object' && !Array.isArray(v)) {
                    // 处理嵌套对象 (如 { header: { color: 'red' } } -> header-color: red)
                    stack.push([v, fullKey]);
                } else {
                    // 普通属性或 CSS 变量
                    result[fullKey] = String(v);
                }
            }
        }
    }

    return result;
}

function flattenClasses(classObj: any): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    const stack = [classObj];

    while (stack.length) {
        const obj = stack.pop();

        if (!obj) continue;

        if (typeof obj === 'string') {
            // 优化：仅在非空时处理，使用简单的 split 提高性能
            const parts = obj.split(' ');
            for (let i = 0; i < parts.length; i++) {
                const c = parts[i].trim();
                if (c) result[c] = true;
            }
        } else if (Array.isArray(obj)) {
            // 优化：倒序压栈保持原有的顺序感知（虽然 class 顺序通常不重要）
            for (let i = obj.length - 1; i >= 0; i--) {
                stack.push(obj[i]);
            }
        } else if (typeof obj === 'object') {
            for (const k in obj) {
                // 仅存储真值，减少结果对象的大小
                if (obj[k]) {
                    result[k] = true;
                }
            }
        }
    }

    return result;
}

/**
 * 带有“脏检查”和命名空间支持的 Attribute 设置函数
 */
function setAttribute(el: Element, key: string, value: any): void {
    const strVal = value == null ? '' : String(value);

    // 1. 命名空间检查 (针对 xlink:href, xml:lang 等)
    const colonIndex = key.indexOf(':');
    if (colonIndex > 0) {
        const prefix = key.slice(0, colonIndex);
        const ns = NS_PREFIXES[prefix as keyof typeof NS_PREFIXES];
        if (ns) {
            // 特殊处理：setAttributeNS 需要比对当前命名空间下的值
            if (el.getAttributeNS(ns, key) !== strVal) {
                el.setAttributeNS(ns, key, strVal);
            }
            return;
        }
    }

    // 2. 普通属性脏检查
    // getAttribute 返回的是原始字符串，这对于 'd', 'points', 'viewBox' 等非常有效
    if (el.getAttribute(key) !== strVal) {
        el.setAttribute(key, strVal);
    }
}

/**
 * 安全地将属性值设置到 DOM 元素上
 * @param el - 目标 DOM 元素
 * @param propKey - 原始属性名（如 'data-id', 'class', 'value'）
 * @param value - 要设置的值，可以是任意类型
 */
function setProperty(el: Element, propKey: string, value: any): void {
    // 1. 将 propKey 映射为 DOM property 的键名（驼峰形式）
    const camelKey = HTML_PROP_MAP[propKey] || propKey;

    // 2. 处理必须通过 setAttribute 设置的属性（data-*, aria-*, 以及显式指定的属性）
    if (propKey.startsWith('data-') || propKey.startsWith('aria-') || ATTR_ONLY_PROPS.has(propKey)) {
        // 只有当值真正改变时才调用 setAttribute，避免触发不必要的 MutationObserver
        setAttribute(el, propKey, value);
        return;
    }

    const anyEl = el as any;
    const tagName = anyEl.tagName;

    // 3. 处理 null/undefined：将 null 或 undefined 转换为移除属性或设为默认值
    //    - 对于布尔属性，null/undefined 视为 false
    //    - 对于其他属性，通常应移除 attribute 或设 property 为 ''（根据规范选择）
    if (value == null) {
        // 如果是布尔属性，直接置 false
        if (typeof anyEl[camelKey] === 'boolean') {
            if (anyEl[camelKey] !== false) {
                anyEl[camelKey] = false;
            }
        } else {
            // 对于非布尔属性，移除 attribute（若存在），同时 property 设为空字符串或默认值
            // 但 property 可能无法直接移除，这里选择将 property 设为空字符串（与浏览器行为一致）
            const current = anyEl[camelKey];
            if (current !== '' && current !== undefined) {
                anyEl[camelKey] = '';
            }
            // 如果存在对应的 attribute，也一并移除（保持清洁）
            if (el.hasAttribute(propKey)) {
                el.removeAttribute(propKey);
            }
        }
        return;
    }

    // 4. 特殊属性处理：src / href（避免重复加载）
    if (camelKey === 'src' || camelKey === 'href') {
        const strValue = String(value);
        // 比较时同时检查 property 和 attribute 的当前值，因为 property 可能返回绝对路径
        if (anyEl[camelKey] === strValue || el.getAttribute(camelKey) === strValue) {
            return;
        }
    }

    // 5. 表单元素的 value 处理（保持光标位置，避免不必要的更新）
    if (camelKey === 'value') {
        if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
            // 注意：对于 select，应使用 'selectedIndex' 或修改 option，这里不做处理
            if (anyEl.value === value) {
                return;
            }
        }
        // 其他情况继续赋值
    }

    // 6. 布尔属性（如 disabled, checked, readonly 等）
    if (typeof value === 'boolean') {
        if (anyEl[camelKey] === value) {
            return;
        }
        anyEl[camelKey] = value;
        return;
    }

    // 7. 通用赋值：如果是 SVG 元素，很多时候 property 赋值是不生效的
    // 比如 <circle cx="50">，在 JS 里 el.cx = 50 往往没用，必须 setAttribute
    const isSVG = el instanceof SVGElement || anyEl.ownerSVGElement !== undefined;
    if (isSVG && !HTML_PROP_MAP[propKey]) {
        setAttribute(el, propKey, value);
    } else if (anyEl[camelKey] !== value) {
        anyEl[camelKey] = value;
    }
}

// ==================== 最终完整 Renderer ====================

interface NodeEntry {
    irNode: IRNode;
    node: Node;
    loops: runtimeLoop[];
    marker: boolean;
}

/**
 * IR 渲染器类 - 负责将 IR（中间表示）渲染到 DOM
 */
export class IRRenderer {
    private nodeMap = new Map<string, NodeEntry>();
    private marker: boolean = false;
    /** 静态子树缓存：key -> DOM节点模板 */
    private staticSubtreeCache = new Map<string, Node>();

    constructor(
        private ir: IRRoot,
        private container: HTMLElement,
        private scope: any = {},
    ) {}

    evalIR(fid: number, args: any[], meta?: Meta) {
        const fn = this.ir.fns[fid - 1];
        try {
            return fn ? fn.apply(this.scope, args) : '';
        } catch (e: any) {
            showTemplateError(e.message || e.toString(), this.ir.m?.src || '', meta, this.scope.tagName);
            return '';
        }
    }

    // ================ 创建节点 ================
    private createElement(irNode: IRNode, parent: Node): SVGElement | HTMLElement {
        const tag = irNode.g!;

        const isSVG = parent instanceof SVGElement || tag === 'svg';

        const el = isSVG ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);

        return el;
    }

    private createText(irNode: IRNode, loops: runtimeLoop[]): Text {
        const value = irNode.d ? this.evalIR(irNode.f!, [loops], irNode.__m) : irNode.x || '';
        return document.createTextNode(value);
    }

    private createComment(irNode: IRNode, loops: runtimeLoop[]): Comment {
        const value = irNode.d ? this.evalIR(irNode.f!, [loops], irNode.__m) : irNode.x || '';
        return document.createComment(value);
    }

    // ================ 属性全量应用（创建或更新时用） ================
    private applyAttrs(el: Element, attrs: IRAttr[], loops: runtimeLoop[], isUpdate: boolean = false) {
        const postTasks: (() => void)[] = [];
        const anyEl = el as any;

        /** =============================
         *  Runtime Context（关键）
         *  永远保存“最新 loops”
         * ============================= */
        if (!anyEl[IRCTX_SYMBOL]) {
            anyEl[IRCTX_SYMBOL] = {
                loops: null as runtimeLoop[] | null,
            };
        }
        anyEl[IRCTX_SYMBOL].loops = loops;

        /** =============================
         *  Event Buckets（每元素一次）
         * ============================= */
        if (!anyEl[IR_EVENTS_SYMBOL]) {
            anyEl[IR_EVENTS_SYMBOL] = Object.create(null) as Record<
                string,
                {
                    model: Array<(e: any) => void>;
                    user: Array<(e: any) => void>;
                }
            >;
        }

        let dynamicClassVal: any = undefined;
        let hasDynamicClass = false;
        let dynamicStyleVal: any = undefined;
        let hasDynamicStyle = false;

        for (const attr of attrs) {
            const { k: key, f: fid, d: dynamic, v: staticValue } = attr;

            // 拦截：完全接管 class 和 style
            if (key === ':class') {
                dynamicClassVal = this.evalIR(fid!, [loops], attr.__m);
                hasDynamicClass = true;
                continue;
            }
            if (key === ':style') {
                dynamicStyleVal = this.evalIR(fid!, [loops], attr.__m);
                hasDynamicStyle = true;
                continue;
            }
            if (key === 'class' || key === 'style') {
                continue; // 静态的直接跳过，因为 initStatic 已经收集过了
            }

            const first = key[0];

            /** -----------------------------
             *  事件处理 @xxx
             * ----------------------------- */
            if (first === '@') {
                const eventName = key.slice(1);
                const role = attr.r ?? 'user';

                let bucket = anyEl[IR_EVENTS_SYMBOL][eventName];
                if (!bucket) {
                    bucket = anyEl[IR_EVENTS_SYMBOL][eventName] = {
                        model: [],
                        user: [],
                    };

                    // 只注册一次 DOM listener
                    el.addEventListener(eventName, (e: any) => {
                        // ① s-model 先执行
                        for (const fn of bucket.model) {
                            fn(e);
                        }

                        // ② 用户事件后执行
                        for (const fn of bucket.user) {
                            fn(e);
                        }
                    });
                }

                // handler 只在首次渲染时创建
                if (!isUpdate) {
                    const handler = (e: any) => this.evalIR(fid!, [e, anyEl[IRCTX_SYMBOL].loops], attr.__m);

                    bucket[role].push(handler);
                }

                continue;
            }

            /** -----------------------------
             *  生命周期 mounted / updated
             * ----------------------------- */
            if (key === 'mounted') {
                if (!isUpdate) {
                    requestAnimationFrame(() => this.evalIR(fid!, [el, loops], attr.__m));
                }
                continue;
            }

            if (key === 'updated') {
                if (isUpdate) {
                    requestAnimationFrame(() => this.evalIR(fid!, [el, loops], attr.__m));
                }
                continue;
            }

            /** -----------------------------
             *  ref
             * ----------------------------- */
            if (key === 'ref' && staticValue) {
                this.scope.$refs = this.scope.$refs || {};
                this.scope.$refs[staticValue] = el;
                continue;
            }

            /** -----------------------------
             *  普通属性 / 动态属性
             * ----------------------------- */
            const val = dynamic ? this.evalIR(fid!, [loops], attr.__m) : (staticValue ?? '');

            if (first === ':') {
                const prop = key.slice(1);

                if (el.tagName === 'SELECT' && POST_CHILD_PROPS.has(prop)) {
                    // select.value 等需等待 children ready
                    postTasks.push(() => setProperty(el, prop, val));
                } else {
                    setProperty(el, prop, val);
                }
            } else if (!isUpdate) {
                // 普通 HTML Attribute（如 href, src, title）
                // 只有在元素首次挂载（mount）时设置一次
                setAttribute(el, key, String(val));
            }
        }

        if (hasDynamicClass) {
            // 只需要处理动态 class 的变更即可, 因为静态 class 已经在 initStaticClass 中设置过了
            setElementClasses(el as HTMLElement, dynamicClassVal);
        }

        if (hasDynamicStyle) {
            setElementStyles(el as HTMLElement, dynamicStyleVal);
        }

        return postTasks;
    }

    // ================ 更新已有节点 Text Or Comment ================
    private updateNode(node: Node, irNode: IRNode, loops: runtimeLoop[]) {
        const newText = irNode.d ? this.evalIR(irNode.f!, [loops], irNode.__m) : irNode.x || '';
        if (irNode.d && node.textContent !== newText) {
            node.textContent = newText;
        }
    }

    // ================ 核心遍历 ================

    /**
     * 创建静态子树（首次渲染）
     * 内部节点不进入 nodeMap，只返回根节点
     */
    private createStaticSubtree(irNode: IRNode, parentNode: Node, loops: runtimeLoop[]): Node {
        switch (irNode.t) {
            case ASTType.Element: {
                const node = this.createElement(irNode, parentNode);
                initStaticClass(node as HTMLElement, irNode);
                initStaticStyle(node as HTMLElement, irNode);

                // 应用静态属性（静态子树不会有动态属性）
                const postTasks = this.applyAttrs(node as HTMLElement, irNode.a ?? [], loops);

                // 递归创建子节点（都是静态的）
                irNode.c?.forEach(child => {
                    const childNode = this.createStaticSubtree(child, node, loops);
                    node.appendChild(childNode);
                });

                postTasks.forEach((fn: () => any) => fn());
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

    /**
     * 处理静态子树
     * 首次渲染创建并缓存，后续直接克隆
     */
    private handleStaticSubtree(irNode: IRNode, id: string, parentNode: Node, loops: runtimeLoop[]): Node {
        const cached = this.staticSubtreeCache.get(id);
        if (cached) {
            // 克隆缓存的静态子树
            const clone = cached.cloneNode(true);
            parentNode.appendChild(clone);
            // 静态子树只需记录根节点，不进入 nodeMap
            return clone;
        }

        // 首次渲染：创建并缓存
        const node = this.createStaticSubtree(irNode, parentNode, loops);
        parentNode.appendChild(node);
        // 缓存模板（用于后续克隆）
        this.staticSubtreeCache.set(id, node.cloneNode(true));
        return node;
    }

    private irToNode(irNode: IRNode, index: number | string, pid: string, parentNode: Node, loops: runtimeLoop[]) {
        const id = pid + '-' + index;
        const existing = this.nodeMap.get(id);
        let node: Node | undefined = undefined;

        // ========== 静态子树优化 ==========
        // 如果是完全静态子树，使用克隆优化
        if (irNode.s === 1) {
            // 静态子树不走 nodeMap，直接处理
            if (existing) {
                // 已存在，标记为活跃
                existing.marker = this.marker;
                node = existing.node;
            } else {
                // 创建或克隆
                node = this.handleStaticSubtree(irNode, id, parentNode, loops);
                // 记录到 nodeMap 用于清理，但内部节点不记录
                this.nodeMap.set(id, { irNode, node, loops, marker: this.marker });
            }
            return;
        }

        if (existing) {
            node = existing.node;
            existing.marker = this.marker;

            let postTasks: (() => void)[] = [];

            if (irNode.d) {
                if (irNode.t === ASTType.Element) {
                    // 只有 dynamic Element 才需要更新属性
                    postTasks = this.applyAttrs(node as Element, irNode.a ?? [], loops, true);
                } else {
                    // dynamic Text / Comment
                    this.updateNode(node, irNode, loops);
                }
            }

            // children 始终递归（结构变化由 IR 保证）
            irNode.c?.forEach((child, childIdx) => {
                this.irToNode(child, childIdx, id, node!, loops);
            });

            // post-children 属性
            postTasks.forEach(fn => fn());
        } else {
            // 创建新节点
            switch (irNode.t) {
                case ASTType.Element:
                    node = this.createElement(irNode, parentNode);
                    // 初始化静态 class / style
                    initStaticClass(node as HTMLElement, irNode);
                    initStaticStyle(node as HTMLElement, irNode);

                    const postTasks = this.applyAttrs(node as HTMLElement, irNode.a ?? [], loops);
                    parentNode.appendChild(node);
                    this.nodeMap.set(id, { irNode, node, loops, marker: this.marker });
                    // 递归子节点
                    irNode.c?.forEach((child, childIdx) => {
                        this.irToNode(child, childIdx, id, node!, loops);
                    });
                    postTasks.forEach((fn: () => any) => fn());
                    break;
                case ASTType.Text:
                    node = this.createText(irNode, loops);
                    parentNode.appendChild(node);
                    this.nodeMap.set(id, { irNode, node, loops, marker: this.marker });
                    break;
                case ASTType.Comment:
                    node = this.createComment(irNode, loops);
                    parentNode.appendChild(node);
                    this.nodeMap.set(id, { irNode, node, loops, marker: this.marker });
                    break;
                case ASTType.For: {
                    const anchorId = `${id}-end`;
                    let anchor = this.nodeMap.get(anchorId)?.node as Comment | undefined;

                    if (!anchor) {
                        anchor = document.createComment(`for:${id}`);
                        parentNode.appendChild(anchor);
                        this.nodeMap.set(anchorId, {
                            irNode: { t: ASTType.Comment } as any,
                            node: anchor,
                            loops,
                            marker: this.marker,
                        });
                    } else {
                        this.nodeMap.get(anchorId)!.marker = this.marker;
                    }

                    // 清空旧内容（简单方式：等会 cleanup 会处理）
                    const list = this.evalIR(irNode.f!, [loops], irNode.__m) || [];
                    const fragment = document.createDocumentFragment();

                    list.forEach((item: any, i: number) => {
                        const childLoops = [...loops, { itmVal: item, idxVal: i }];
                        irNode.c?.forEach((child, childIdx) => {
                            this.irToNode(child, childIdx, `${id}-for-${i}`, fragment as any, childLoops);
                        });
                    });

                    anchor.parentNode!.insertBefore(fragment, anchor);
                    break;
                }
                case ASTType.Conditional: {
                    const anchorId = `${id}-end`;
                    let anchor = this.nodeMap.get(anchorId)?.node as Comment | undefined;

                    if (!anchor) {
                        anchor = document.createComment(`if:${id}`);
                        parentNode.appendChild(anchor);
                        this.nodeMap.set(anchorId, { irNode: {} as any, node: anchor, loops, marker: this.marker });
                    } else {
                        this.nodeMap.get(anchorId)!.marker = this.marker;
                    }

                    // 找到第一个真的分支
                    for (let ifIdx = 0; ifIdx < (irNode.b || []).length; ifIdx++) {
                        const branch = irNode.b![ifIdx];
                        const matched = branch.f === null || this.evalIR(branch.f, [loops], branch.__m);

                        if (matched) {
                            const fragment = document.createDocumentFragment();
                            branch.c.forEach((child, childIdx) => {
                                this.irToNode(child, childIdx, `${id}-if-${ifIdx}`, fragment as any, loops);
                            });
                            anchor.parentNode!.insertBefore(fragment, anchor);
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

    // ================ 清理被删除的节点 ================
    private cleanupOldNodes() {
        for (const [id, entry] of this.nodeMap.entries()) {
            if (entry.marker !== this.marker) {
                const { irNode, node, loops } = entry;

                if (irNode.a) {
                    // 调用 unmounted 生命周期
                    const unmountedAttr = irNode.a.find(a => a.k === 'unmounted');
                    if (unmountedAttr) {
                        requestAnimationFrame(() => {
                            this.evalIR(unmountedAttr.f!, [node, loops], unmountedAttr.__m);
                        });
                    }

                    // 移除 ref 节点
                    const refAttr = irNode.a.find(a => a.k === 'ref');
                    if (refAttr && refAttr.v) {
                        delete this.scope.$refs[refAttr.v];
                    }
                }

                // 删除真实节点
                (node as HTMLElement | null)?.remove();

                // 从映射删除
                this.nodeMap.delete(id);
            }
        }
    }

    // ================ 公共 API ================
    mount() {
        this.marker = !this.marker;
        this.ir.n.forEach((node, idx) => {
            this.irToNode(node, idx, 'root', this.container, []);
        });

        this.cleanupOldNodes();
    }

    update() {
        this.marker = !this.marker;
        this.ir.n.forEach((node, idx) => {
            this.irToNode(node, idx, 'root', this.container, []);
        });

        this.cleanupOldNodes();
    }

    destroy() {
        this.container.innerHTML = '';
        this.nodeMap.clear();
        this.staticSubtreeCache.clear();
    }
}

/** 渲染实例接口 */
export interface IRRenderInstance {
    /** 更新渲染 */
    update: () => void;
    /** 销毁渲染实例，清理 DOM */
    destroy: () => void;
}

// ================ 对外 API ================
/**
 * 创建渲染实例
 * @param ir IR 根节点
 * @param el 容器元素
 * @param ctx 上下文数据
 * @returns 渲染实例
 */
export const createRender = (ir: IRRoot, el: HTMLElement, ctx: any = {}): IRRenderInstance => {
    const renderer = new IRRenderer(ir, el, ctx);
    renderer.mount();
    return {
        update: () => renderer.update(),
        destroy: () => renderer.destroy(),
    };
};
