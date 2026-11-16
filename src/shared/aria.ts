/**
 * ARIA IDREF 代理基座（0.8.0 框架层 F-3）
 *
 * 问题：ARIA 的 IDREF 属性（`aria-describedby` / `aria-labelledby` /
 * `aria-controls` / `aria-activedescendant` 等）只在引用元素所属的树内解析。
 * 当被引用 id 位于 shadow root 内、引用方位于 light DOM 或另一棵树时，
 * 浏览器不会跨树查找，`document.getElementById()` 也查不到 shadow 内节点。
 *
 * 解决：被引用方（source）与引用方（target）不同树时，在 target 所在树内
 * 创建一个视觉隐藏的代理节点，承载同一个 id、role 与文本内容，并让 target
 * 的 aria 属性引用该代理 id。source 与 target 同树时直接引用原节点，不创建
 * 代理，避免同树出现重复 id。
 *
 * 生命周期契约：
 * - `linkAria()` 创建代理并挂上 aria 属性；
 * - `release()` 移除代理，并精确还原 target 原有的 aria 属性（原本不存在时移除属性）；
 * - 代理按“容器 + id”共享引用计数，多个 target 引用同一 id 时不会产生重复 id；
 * - 单值 IDREF（`aria-activedescendant` / `aria-details` / `aria-error-message`）
 *   链接期间临时覆盖为用户值，释放后还原；多值 IDREF 则在原值基础上追加。
 *
 * 说明：jsdom 不构建无障碍树，本模块用“id 可在引用方根节点内被解析”作为断言，
 * 与浏览器 IDREF 的树作用域规则一致。
 */

import { IS_DEV } from './env';

/** 可代理的 ARIA IDREF 属性；同时允许传入其它 `aria-*` 字符串 */
export type AriaIdRefAttribute =
    | 'aria-describedby'
    | 'aria-labelledby'
    | 'aria-controls'
    | 'aria-activedescendant'
    | (string & {});

/** 单值 IDREF：只能承载一个 id，链接期间临时覆盖，释放后还原 */
const SINGLE_ID_ATTRS = new Set<string>(['aria-activedescendant', 'aria-details', 'aria-error-message']);

/** 描述 source 的最小信息；用于 source 不是真实元素、只有逻辑 id 的场景 */
export interface AriaSourceSpec {
    /** 被引用 id；缺省时自动生成 */
    id?: string;
    /** 代理节点 role；缺省沿用 source 元素的 role */
    role?: string;
    /** 代理节点文本内容；缺省沿用 source 元素的 textContent */
    content?: string;
}

export interface LinkAriaOptions {
    /** 代理节点 id；优先于 source.id，主要供“只有逻辑 id”的组件使用 */
    id?: string;
    /** 覆盖代理 role */
    role?: string;
    /** 覆盖代理文本内容 */
    content?: string;
    /** 代理插入容器；缺省按 target 的根节点推导 */
    container?: Node | null;
}

export interface AriaLinkHandle {
    /** 实际被引用的 id（写入 target 的 aria 属性） */
    readonly id: string;
    /** 代理节点；同树直连时为 null */
    readonly proxy: HTMLElement | null;
    /** 更新代理内容/role；同树直连时为空操作 */
    update(content: string, role?: string): void;
    /** 解除链接：移除代理并精确还原 target 原值；幂等 */
    release(): void;
}

/** 代理容器 -> id -> 代理记录（引用计数） */
interface ProxyRecord {
    node: HTMLElement;
    refs: number;
}

/** target -> aria 属性 -> 原值与当前追加的 id */
interface AttrBinding {
    original: string | null;
    ids: string[];
}

const proxyRecords = new WeakMap<Node, Map<string, ProxyRecord>>();
const attrBindings = new WeakMap<Element, Map<string, AttrBinding>>();

let ariaIdCounter = 0;

/** 生成代理 id；带前缀与自增序号，避免和业务 id 冲突 */
export function createAriaId(prefix = 'solely-aria'): string {
    return `${prefix}-${++ariaIdCounter}`;
}

/** 判断传入值是否为元素：用 nodeType 判断，避免跨 realm 的 instanceof 失效 */
function isElementNode(value: Element | AriaSourceSpec): value is Element {
    return !!value && typeof value === 'object' && (value as Element).nodeType === 1;
}

/**
 * 解析代理容器：Document 挂到 body，ShadowRoot 挂到自身。
 *
 * 必须用 `nodeType === 9` 判断 Document，`instanceof Document` 在跨 realm
 * （例如 iframe）时会失效；ShadowRoot 的 nodeType 是 11。
 */
function resolveProxyContainer(target: Element): Node | null {
    const root = target.getRootNode();

    if (root.nodeType === 9) {
        const doc = root as Document;
        return doc.body ?? doc.documentElement ?? null;
    }

    if (root.nodeType === 11 && (root as ShadowRoot).host) {
        return root;
    }

    const doc = target.ownerDocument;
    return doc?.body ?? doc?.documentElement ?? null;
}

/** 两节点是否处于同一棵树；dev 模式对跨树引用给出提示 */
export function assertSameTree(a: Node, b: Node): boolean {
    const same = a.getRootNode() === b.getRootNode();
    if (!same && IS_DEV) {
        console.warn('[Solely] ARIA IDREF 引用方与被引用方不在同一棵树，已使用代理节点。');
    }
    return same;
}

function getOrCreateBinding(target: Element, attr: string): AttrBinding {
    let map = attrBindings.get(target);
    if (!map) {
        map = new Map();
        attrBindings.set(target, map);
    }

    let binding = map.get(attr);
    if (!binding) {
        binding = { original: target.getAttribute(attr), ids: [] };
        map.set(attr, binding);
    }
    return binding;
}

/** 多值 IDREF：保留用户原值，并在末尾追加代理 id（去重） */
function composeIds(original: string | null, ids: string[]): string {
    const output: string[] = [];
    if (original) {
        for (const id of original.split(/\s+/)) {
            if (id) output.push(id);
        }
    }
    for (const id of ids) {
        if (!output.includes(id)) output.push(id);
    }
    return output.join(' ');
}

function applyBinding(target: Element, attr: string, binding: AttrBinding): void {
    if (binding.ids.length === 0) {
        if (binding.original === null) {
            target.removeAttribute(attr);
        } else {
            target.setAttribute(attr, binding.original);
        }
        return;
    }

    if (SINGLE_ID_ATTRS.has(attr)) {
        // 单值 IDREF 只能有一个 id：链接期间由最后一次链接覆盖
        target.setAttribute(attr, binding.ids[binding.ids.length - 1]);
        return;
    }

    target.setAttribute(attr, composeIds(binding.original, binding.ids));
}

function removeBinding(target: Element, attr: string, id: string): void {
    const map = attrBindings.get(target);
    const binding = map?.get(attr);
    if (!map || !binding) return;

    const index = binding.ids.indexOf(id);
    if (index >= 0) binding.ids.splice(index, 1);

    applyBinding(target, attr, binding);

    if (binding.ids.length === 0) {
        map.delete(attr);
        if (map.size === 0) attrBindings.delete(target);
    }
}

/** 视觉隐藏但仍暴露给读屏的样式 */
const VISUALLY_HIDDEN =
    'position:fixed;top:0;left:0;width:1px;height:1px;margin:-1px;padding:0;border:0;' +
    'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';

function acquireProxy(
    container: Node,
    doc: Document,
    id: string,
    role: string | undefined,
    content: string,
): ProxyRecord {
    let map = proxyRecords.get(container);
    if (!map) {
        map = new Map();
        proxyRecords.set(container, map);
    }

    let record = map.get(id);
    if (!record) {
        const node = doc.createElement('div');
        node.id = id;
        node.style.cssText = VISUALLY_HIDDEN;
        node.textContent = content;
        if (role !== undefined) node.setAttribute('role', role);
        container.appendChild(node);
        record = { node, refs: 0 };
        map.set(id, record);
    } else {
        // 同一 id 被多个引用方共享：内容以最后一次链接为准
        record.node.textContent = content;
        if (role !== undefined) record.node.setAttribute('role', role);
        // 容器被外部清空（例如 innerHTML = ''）后重新挂回，避免残留断开节点
        if (!record.node.isConnected) container.appendChild(record.node);
    }

    record.refs++;
    return record;
}

function releaseProxy(container: Node, id: string): void {
    const map = proxyRecords.get(container);
    const record = map?.get(id);
    if (!map || !record) return;

    record.refs--;
    if (record.refs > 0) return;

    record.node.remove();
    map.delete(id);
    if (map.size === 0) proxyRecords.delete(container);
}

/**
 * 建立一条 ARIA IDREF 关联。
 *
 * - `source` 为元素且与 `target` 同树：直接引用 source 的 id，不创建代理；
 * - 否则在 target 所在树内创建代理节点，承载 id / role / 文本内容；
 * - 返回的 handle 必须由调用方在“被描述内容隐藏/销毁”时 `release()`，
 *   以保证读屏不会拿到过期描述。
 */
export function linkAria(
    target: Element,
    attr: AriaIdRefAttribute,
    source: Element | AriaSourceSpec,
    options: LinkAriaOptions = {},
): AriaLinkHandle {
    const sourceElement = isElementNode(source) ? source : null;
    const spec = isElementNode(source) ? null : source;

    let id = options.id ?? spec?.id ?? sourceElement?.id ?? '';
    if (!id) {
        id = createAriaId();
        if (sourceElement) sourceElement.id = id;
    }

    const role = options.role ?? spec?.role ?? sourceElement?.getAttribute('role') ?? undefined;
    const content = options.content ?? spec?.content ?? (sourceElement ? (sourceElement.textContent ?? '') : '');

    // 同树且被引用节点真实存在时，原生 IDREF 可解析，无需代理
    const sameTree = !!sourceElement && sourceElement.getRootNode() === target.getRootNode();

    const binding = getOrCreateBinding(target, attr);
    binding.ids.push(id);
    applyBinding(target, attr, binding);

    let record: ProxyRecord | null = null;
    let container: Node | null = null;
    const doc = target.ownerDocument ?? (typeof document !== 'undefined' ? document : null);

    if (!sameTree) {
        container = options.container ?? resolveProxyContainer(target);
        if (container && doc) {
            record = acquireProxy(container, doc, id, role, content);
        } else if (IS_DEV) {
            console.warn(`[Solely] 无法为 ${attr} 创建 IDREF 代理：缺少目标树容器。`);
        }
    }

    let released = false;

    return {
        id,
        get proxy(): HTMLElement | null {
            return record ? record.node : null;
        },
        update(nextContent: string, nextRole?: string): void {
            if (released || !record) return;
            record.node.textContent = nextContent;
            if (nextRole !== undefined) record.node.setAttribute('role', nextRole);
        },
        release(): void {
            if (released) return;
            released = true;
            removeBinding(target, attr, id);
            if (record && container) releaseProxy(container, id);
        },
    };
}
