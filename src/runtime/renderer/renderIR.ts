import { ASTType } from "@/types";
import { IRAttr, IRNode, IRRoot, Meta } from "@/types";
import { runtimeLoop } from "@/types";
import { showTemplateError } from "@/shared";

const IS_SVG_SYMBOL = Symbol("solely.isSVG");
const IRCTX_SYMBOL = Symbol("solely.irCtx");
const IR_EVENTS_SYMBOL = Symbol("solely.irEvents");
const IR_META_SYMBOL = Symbol.for("solely.irMeta");

const DYNAMIC_CLASS_LAST = Symbol("solely.lastDynamicClass");
const DYNAMIC_STYLE_LAST = Symbol("solely.dynamicStyleLast");

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
    const anyEl = el as any;
    const staticAttr = irNode.attrs?.find(a => a.key === 'class' && !a.dynamic);
    const value = staticAttr ? staticAttr.value : '';

    // 初始化渲染静态 class
    if (value) {
        if (anyEl[IS_SVG_SYMBOL]) {
            anyEl.className.baseVal = value;
        } else {
            anyEl.className = value;
        }
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


const setElementStyles = (el: HTMLElement, dynamicStyle: any): void => {
    const anyEl = el as any;

    // flatten 当前动态 style
    const dynamic = flattenStyle(dynamicStyle);

    const prevDynamic: Record<string, string> = anyEl[DYNAMIC_STYLE_LAST] || {};

    // 删除上次存在但现在不存在的 key
    for (const key in prevDynamic) {
        if (!(key in dynamic)) {
            if (key.startsWith('--')) el.style.removeProperty(key);
            else (el.style as any)[key] = '';
        }
    }

    // 更新/添加新的动态 key
    for (const key in dynamic) {
        const val = dynamic[key];
        if (key.startsWith('--')) el.style.setProperty(key, val);
        else (el.style as any)[key] = val; // 普通属性直接赋值，天然支持驼峰命名 (camelCase)，且性能更好
    }

    // 缓存当前动态 style
    anyEl[DYNAMIC_STYLE_LAST] = dynamic;
}

const setElementClasses = (el: HTMLElement | SVGElement, dynamicClass: any): void => {
    const anyEl = el as any;

    const lastDynamic: Record<string, boolean> = anyEl[DYNAMIC_CLASS_LAST] || {};
    const currentDynamic = flattenClasses(dynamicClass); // 当前计算出的动态 class

    // 移除上一次有但这次没有的 class
    for (const cls in lastDynamic) {
        if (lastDynamic[cls] && !currentDynamic[cls]) {
            if (anyEl[IS_SVG_SYMBOL]) {
                anyEl.className.baseVal = anyEl.className.baseVal.replace(new RegExp(`\\b${cls}\\b`, 'g'), '').trim();
            } else {
                anyEl.classList.remove(cls);
            }
        }
    }

    // 添加这次为 true 的 class
    for (const cls in currentDynamic) {
        if (currentDynamic[cls]) {
            if (anyEl[IS_SVG_SYMBOL]) {
                const classes = anyEl.className.baseVal.split(/\s+/);
                if (!classes.includes(cls)) {
                    classes.push(cls);
                    anyEl.className.baseVal = classes.join(' ');
                }
            } else {
                anyEl.classList.add(cls);
            }
        }
    }

    // 更新 Symbol 缓存
    anyEl[DYNAMIC_CLASS_LAST] = currentDynamic;
};

// 递归 → 迭代的扁平化
function flattenStyle(styleObj: any): Record<string, string> {
    const result: Record<string, string> = {};
    const stack: [any, string?][] = [[styleObj]];

    while (stack.length) {
        const [obj, prefix] = stack.pop()!;

        if (typeof obj === 'string') {
            obj.split(';').forEach(rule => {
                const [p, v] = rule.split(':').map(s => s.trim());
                if (p && v) result[p] = v;
            });
            continue;
        }

        if (Array.isArray(obj)) {
            obj.forEach(item => stack.push([item]));
            continue;
        }

        if (obj && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
                const fullKey = prefix ? `${prefix}-${k}` : k;
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    stack.push([v, fullKey]);
                } else {
                    result[fullKey] = String(v ?? '');
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
            obj.split(/\s+/).forEach(c => c && (result[c] = true));
        }
        else if (Array.isArray(obj)) {
            stack.push(...obj);
        }
        else if (typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
                result[k] = !!v;
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

        (el as any)[IS_SVG_SYMBOL] = isSVG;

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
                dynamicClassVal = this.evalIR(fid!, [loops]);
                hasDynamicClass = true;
                continue;
            }
            if (key === ':style') {
                dynamicStyleVal = this.evalIR(fid!, [loops]);
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
            } else {
                setAttribute(el, key, String(val));
            }
        }

        if (hasDynamicClass || !isUpdate) {
            // 如果是初始化，即便没有动态类，也要把静态类画上去
            // 如果是更新，只有存在动态绑定时才需要重新计算合并
            setElementClasses(el as HTMLElement, dynamicClassVal);
        }

        if (hasDynamicStyle || !isUpdate) {
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