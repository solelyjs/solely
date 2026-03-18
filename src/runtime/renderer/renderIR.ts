import { ASTType } from "@/types";
import { IRAttr, IRNode, IRRoot, Meta } from "@/types";
import { runtimeLoop } from "@/types";
import { showTemplateError } from "@/shared";

const IRCTX_SYMBOL = Symbol("solely.irCtx");
const IR_EVENTS_SYMBOL = Symbol("solely.irEvents");
const IR_META_SYMBOL = Symbol.for("solely.irMeta");

const PREV_CLASS_OBJ = Symbol("solely.prevClassObj");
const PREV_STYLE_OBJ = Symbol("solely.prevStyleObj");

const NS_PREFIXES = {
    xml: 'http://www.w3.org/XML/1998/namespace',
    xlink: 'http://www.w3.org/1999/xlink',
    xmlns: 'http://www.w3.org/2000/xmlns/'
} as const;

const HTML_PROP_MAP: Record<string, string> = {
    readonly: 'readOnly',
    for: 'htmlFor',
    tabindex: 'tabIndex',
    contenteditable: 'contentEditable',
    maxlength: 'maxLength'
} as const;

// data-* / aria-* / role / form 等只能用 setAttribute
const ATTR_ONLY_PROPS = new Set(['data-', 'aria-', 'role', 'form']);

const POST_CHILD_PROPS = new Set([
    'value',
    'selectedIndex'
]);

function initStaticClass(el: HTMLElement | SVGElement, irNode: IRNode) {
    const staticAttr = irNode.attrs?.find(a => a.key === 'class' && !a.dynamic);
    if (staticAttr?.value) {
        // 无论 HTML 还是 SVG，这都是最稳妥的首屏赋值方式
        el.setAttribute('class', staticAttr.value);
    }
}

function initStaticStyle(el: HTMLElement, irNode: IRNode) {
    const staticAttr = irNode.attrs?.find(a => a.key === 'style' && !a.dynamic);
    // flatten 成 key-value 对象
    const staticStyle = staticAttr ? flattenStyle(staticAttr.value) : {};

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

const setElementClasses = (el: HTMLElement | SVGElement, dynamicClass: any): void => {
    const anyEl = el as any;
    const lastDynamic = anyEl[PREV_CLASS_OBJ];
    const currentDynamic = flattenClasses(dynamicClass);

    // 1. 初次渲染处理
    if (!lastDynamic) {
        for (const cls in currentDynamic) {
            el.classList.add(cls);
        }
        anyEl[PREV_CLASS_OBJ] = currentDynamic;
        return;
    }

    let hasChanged = false;

    // 2. 移除旧的：在上一次有，但这一次没有的 class
    for (const cls in lastDynamic) {
        if (!currentDynamic[cls]) {
            el.classList.remove(cls);
            hasChanged = true;
        }
    }

    // 3. 添加新的：在这一次有，但上一次没有的 class
    for (const cls in currentDynamic) {
        if (!lastDynamic[cls]) {
            el.classList.add(cls);
            hasChanged = true;
        }
    }

    // 4. 只有发生变化时才覆盖缓存
    if (hasChanged) {
        anyEl[PREV_CLASS_OBJ] = currentDynamic;
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
        }
        else if (Array.isArray(obj)) {
            // 优化：倒序压栈保持原有的顺序感知（虽然 class 顺序通常不重要）
            for (let i = obj.length - 1; i >= 0; i--) {
                stack.push(obj[i]);
            }
        }
        else if (typeof obj === 'object') {
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

// 属性设置
function setAttribute(el: Element, key: string, value: string) {
    const colonIndex = key.indexOf(':');
    if (colonIndex > 0) {
        const prefix = key.slice(0, colonIndex);
        const ns = NS_PREFIXES[prefix as keyof typeof NS_PREFIXES];
        if (ns) return el.setAttributeNS(ns, key, value);
    }
    el.setAttribute(key, value);
}

function setProperty(el: Element, propKey: string, value: any) {
    if (propKey.startsWith('data-') || propKey.startsWith('aria-') || ATTR_ONLY_PROPS.has(propKey)) {
        el.setAttribute(propKey, value);
        return;
    }
    const camelKey = HTML_PROP_MAP[propKey as keyof typeof HTML_PROP_MAP] || propKey;
    (el as any)[camelKey] = value;
}

// ==================== 最终完整 Renderer ====================

interface NodeEntry {
    irNode: IRNode;
    node: Node;
    loops: runtimeLoop[];
    marker: boolean;
}

export class IRRenderer {
    private nodeMap = new Map<string, NodeEntry>();
    private marker: boolean = false;

    constructor(
        private ir: IRRoot,
        private container: HTMLElement,
        private scope: any = {}
    ) { }

    evalIR(fid: number, args: any[], meta?: Meta) {
        const fn = this.ir.functions[fid - 1];
        try {
            return fn ? fn.apply(this.scope, args) : '';
        }
        catch (e: any) {
            showTemplateError(e.message || e.toString(), this.ir.metadata?.source || '', meta, this.scope.tagName);
            return '';
        }
    }

    // ================ 创建节点 ================
    private createElement(irNode: IRNode, parent: Node): SVGElement | HTMLElement {
        const tag = irNode.tag!;

        const isSVG = parent instanceof SVGElement || tag === 'svg';

        const el = isSVG
            ? document.createElementNS('http://www.w3.org/2000/svg', tag)
            : document.createElement(tag);

        return el;
    }

    private createText(irNode: IRNode, loops: runtimeLoop[]): Text {
        const value = irNode.dynamic ? this.evalIR(irNode.fid!, [loops], (irNode as any)[IR_META_SYMBOL]) : irNode.txt || '';
        return document.createTextNode(value);
    }

    private createComment(irNode: IRNode, loops: runtimeLoop[]): Comment {
        const value = irNode.dynamic ? this.evalIR(irNode.fid!, [loops], (irNode as any)[IR_META_SYMBOL]) : irNode.txt || '';
        return document.createComment(value);
    }

    // ================ 属性全量应用（创建或更新时用） ================
    private applyAttrs(
        el: Element,
        attrs: IRAttr[],
        loops: runtimeLoop[],
        isUpdate: boolean = false
    ) {
        const postTasks: (() => void)[] = [];
        const anyEl = el as any;

        /** =============================
         *  Runtime Context（关键）
         *  永远保存“最新 loops”
         * ============================= */
        if (!anyEl[IRCTX_SYMBOL]) {
            anyEl[IRCTX_SYMBOL] = {
                loops: null as runtimeLoop[] | null
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
            const { key, fid, dynamic, value: staticValue } = attr;

            // 拦截：完全接管 class 和 style
            if (key === ':class') {
                dynamicClassVal = this.evalIR(fid!, [loops], (attr as any)[IR_META_SYMBOL]);
                hasDynamicClass = true;
                continue;
            }
            if (key === ':style') {
                dynamicStyleVal = this.evalIR(fid!, [loops], (attr as any)[IR_META_SYMBOL]);
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
                const role = attr.role ?? 'user';

                let bucket = anyEl[IR_EVENTS_SYMBOL][eventName];
                if (!bucket) {
                    bucket = anyEl[IR_EVENTS_SYMBOL][eventName] = {
                        model: [],
                        user: []
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
                    const handler = (e: any) =>
                        this.evalIR(
                            fid!,
                            [e, anyEl[IRCTX_SYMBOL].loops],
                            (attr as any)[IR_META_SYMBOL]
                        );

                    bucket[role].push(handler);
                }

                continue;
            }

            /** -----------------------------
             *  生命周期 mounted / updated
             * ----------------------------- */
            if (key === 'mounted') {
                if (!isUpdate) {
                    requestAnimationFrame(() =>
                        this.evalIR(fid!, [el, loops], (attr as any)[IR_META_SYMBOL])
                    );
                }
                continue;
            }

            if (key === 'updated') {
                if (isUpdate) {
                    requestAnimationFrame(() =>
                        this.evalIR(fid!, [el, loops], (attr as any)[IR_META_SYMBOL])
                    );
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
            const val = dynamic
                ? this.evalIR(fid!, [loops], (attr as any)[IR_META_SYMBOL])
                : staticValue ?? '';

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
        const newText = irNode.dynamic ? this.evalIR(irNode.fid!, [loops], (irNode as any)[IR_META_SYMBOL]) : irNode.txt || '';
        if (irNode.dynamic && node.textContent !== newText) {
            node.textContent = newText;
        }
    }

    // ================ 核心遍历 ================
    private irToNode(irNode: IRNode, index: number | string, pid: string, parentNode: Node, loops: runtimeLoop[]) {
        const id = pid + "-" + index;
        const existing = this.nodeMap.get(id);
        let node: Node | undefined = undefined;

        if (existing) {
            node = existing.node;
            existing.marker = this.marker;

            let postTasks: (() => void)[] = [];

            if (irNode.dynamic) {
                if (irNode.type === ASTType.Element) {
                    // 只有 dynamic Element 才需要更新属性
                    postTasks = this.applyAttrs(
                        node as Element,
                        irNode.attrs ?? [],
                        loops,
                        true
                    );
                } else {
                    // dynamic Text / Comment
                    this.updateNode(node, irNode, loops);
                }
            }

            // children 始终递归（结构变化由 IR 保证）
            irNode.children?.forEach((child, childIdx) => {
                this.irToNode(child, childIdx, id, node!, loops);
            });

            // post-children 属性
            postTasks.forEach(fn => fn());
        } else {
            // 创建新节点
            switch (irNode.type) {
                case ASTType.Element:
                    node = this.createElement(irNode, parentNode);
                    // 初始化静态 class / style
                    initStaticClass(node as HTMLElement, irNode);
                    initStaticStyle(node as HTMLElement, irNode);

                    const postTasks = this.applyAttrs(node as HTMLElement, irNode.attrs ?? [], loops);
                    parentNode.appendChild(node);
                    this.nodeMap.set(id, { irNode, node, loops, marker: this.marker });
                    // 递归子节点
                    irNode.children?.forEach((child, childIdx) => {
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
                            irNode: { type: ASTType.Comment } as any,
                            node: anchor,
                            loops,
                            marker: this.marker
                        });
                    } else {
                        this.nodeMap.get(anchorId)!.marker = this.marker;
                    }

                    // 清空旧内容（简单方式：等会 cleanup 会处理）
                    const list = this.evalIR(irNode.fid!, [loops], (irNode as any)[IR_META_SYMBOL]) || [];
                    const fragment = document.createDocumentFragment();

                    list.forEach((item: any, i: number) => {
                        const childLoops = [...loops, { itmVal: item, idxVal: i }];
                        irNode.children?.forEach((child, childIdx) => {
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
                    for (let ifIdx = 0; ifIdx < (irNode.branches || []).length; ifIdx++) {
                        const branch = irNode.branches![ifIdx];
                        const matched = branch.condFid === null || this.evalIR(branch.condFid, [loops], (branch as any)[IR_META_SYMBOL]);

                        if (matched) {
                            const fragment = document.createDocumentFragment();
                            branch.children.forEach((child, childIdx) => {
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

                if (irNode.attrs) {
                    // 调用 unmounted 生命周期
                    const unmountedAttr = irNode.attrs.find(a => a.key === 'unmounted');
                    if (unmountedAttr) {
                        requestAnimationFrame(() => {
                            this.evalIR(
                                unmountedAttr.fid!,
                                [node, loops],
                                (unmountedAttr as any)[IR_META_SYMBOL]
                            );
                        });
                    }

                    // 移除 ref 节点
                    const refAttr = irNode.attrs.find(a => a.key === 'ref');
                    if (refAttr && refAttr.value) {
                        delete this.scope.$refs[refAttr.value];
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
        this.ir.nodes.forEach((node, idx) => {
            this.irToNode(node, idx, "root", this.container, []);
        });

        this.cleanupOldNodes();
    }

    update() {
        this.marker = !this.marker;
        this.ir.nodes.forEach((node, idx) => {
            this.irToNode(node, idx, "root", this.container, []);
        });

        this.cleanupOldNodes();
    }

    destroy() {
        this.container.innerHTML = '';
        this.nodeMap.clear();
    }
}

export interface IRRenderInstance {
    update: () => void;
    destroy: () => void;
}

// ================ 对外 API ================
export const createRender = (ir: IRRoot, el: HTMLElement, ctx: any = {}): IRRenderInstance => {
    const renderer = new IRRenderer(ir, el, ctx);
    renderer.mount();
    return {
        update: () => renderer.update(),
        destroy: () => renderer.destroy()
    };
};