/**
 * 公共测试工具：挂载、等待渲染、事件录制与 DOM 清理。
 *
 * 背景见本地审计材料 docs/internal/framework-issues.md（F-7，不入库）：各测试文件长期各自实现 mount / tick / collect，
 * 导致「挂载静默」「attribute/property 一致」没有统一入口。这里提供最小可复用工具，
 * 新用例直接调用；既有用例按需迁移，不做一次性重写。
 */

/** 默认等待时长（ms）：组件刷新经 queueMicrotask + 模板异步路径，20ms 是既有用例的稳定值 */
export const RENDER_WAIT = 20;

export type AttrValue = string | number | boolean | null | undefined;

/** 等待渲染队列稳定（可与 fake timers 之外的场景直接配合） */
export function tick(ms: number = RENDER_WAIT): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/** 批量写 attribute：boolean true 写空串，false / null / undefined 跳过（HTML 布尔语义） */
export function setAttributes(el: Element, attrs: Record<string, AttrValue> = {}): void {
    for (const [name, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        el.setAttribute(name, value === true ? '' : String(value));
    }
}

/**
 * 同步挂载：创建元素 → 写 attribute → append → 返回元素（不等待渲染）。
 *
 * @example
 * const el = mount('solely-pagination', { total: 50 });
 * await tick();
 */
export function mount<T extends HTMLElement = HTMLElement>(
    tag: string,
    attrs: Record<string, AttrValue> = {},
    parent: Element = document.body,
): T {
    const el = document.createElement(tag) as T;
    setAttributes(el, attrs);
    parent.appendChild(el);
    return el;
}

/** 挂载并等待渲染稳定，适合绝大多数「挂载后立即断言」的用例 */
export async function mountAndWait<T extends HTMLElement = HTMLElement>(
    tag: string,
    attrs: Record<string, AttrValue> = {},
    wait: number = RENDER_WAIT,
    parent: Element = document.body,
): Promise<T> {
    const el = mount<T>(tag, attrs, parent);
    await tick(wait);
    return el;
}

/** 清空 body；与 tests/setup.ts 的全局兜底清理语义一致 */
export function clearBody(): void {
    document.body.innerHTML = '';
}

/**
 * 在元素挂载前写入自有属性，模拟「元素定义前的属性升级」。
 * 属性升级是 F-1 挂载静默的三条写入路径之一。
 */
export function defineOwnProperty(target: object, key: string, value: unknown): void {
    Object.defineProperty(target, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
    });
}

/** 获取必须存在的 open shadowRoot，避免每处写 `as ShadowRoot` */
export function getShadowRoot(el: Element): ShadowRoot {
    const root = (el as HTMLElement).shadowRoot;
    if (!root) throw new Error(`<${el.tagName.toLowerCase()}> 没有 open shadowRoot`);
    return root;
}

/** 类型化的 querySelectorAll */
export function queryAll<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
    return Array.from(root.querySelectorAll(selector)) as T[];
}

/** 轮询等待条件成立，超时抛错（用于非固定时长的异步渲染） */
export async function waitFor(predicate: () => boolean, timeout = 1000, interval = 10): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (predicate()) return;
        await tick(interval);
    }
    throw new Error(`waitFor 超时（${timeout}ms）`);
}

export interface EventRecorder<T extends Event = Event> {
    /** 按派发顺序记录的事件 */
    events: T[];
    /** 按类型过滤 */
    of(type: string): T[];
    /** 出现过的类型（去重，按首次出现顺序） */
    types(): string[];
    /** 清空已记录事件，但保持监听 */
    reset(): void;
    /** 停止记录/还原 dispatchEvent */
    stop(): void;
}

/**
 * 监听指定类型的事件，返回可复位的录制器。
 * 不传 types 时仅记录「宿主自身 dispatchEvent 派发的事件」，见 recordAllEvents。
 */
export function recordEvents<T extends Event = Event>(el: EventTarget, types: string[] = []): EventRecorder<T> {
    const events: T[] = [];
    const listeners: Array<{ type: string; handler: EventListener }> = [];

    for (const type of types) {
        const handler: EventListener = e => events.push(e as T);
        el.addEventListener(type, handler);
        listeners.push({ type, handler });
    }

    return {
        events,
        of: type => events.filter(e => e.type === type),
        types: () => Array.from(new Set(events.map(e => e.type))),
        reset: () => {
            events.length = 0;
        },
        stop: () => {
            for (const { type, handler } of listeners) {
                el.removeEventListener(type, handler);
            }
            listeners.length = 0;
        },
    };
}

/**
 * 拦截宿主自身的 `dispatchEvent`，记录它派发的全部事件（含 CustomEvent）。
 *
 * 与 recordEvents(el, types) 的区别：这里不需要预先枚举事件名，适合矩阵测试里
 * 「挂载期不应出现任何业务事件」这类未知事件名的断言。子节点冒泡上来的事件
 * 不会经过宿主的 dispatchEvent，因此不会被误记。
 */
export function recordAllEvents<T extends Event = Event>(el: EventTarget): EventRecorder<T> {
    const events: T[] = [];
    const original = el.dispatchEvent.bind(el) as (event: Event) => boolean;
    const patched = (event: Event): boolean => {
        events.push(event as T);
        return original(event);
    };

    el.dispatchEvent = patched as EventTarget['dispatchEvent'];

    return {
        events,
        of: type => events.filter(e => e.type === type),
        types: () => Array.from(new Set(events.map(e => e.type))),
        reset: () => {
            events.length = 0;
        },
        stop: () => {
            if ((el.dispatchEvent as unknown) === patched) {
                el.dispatchEvent = original as EventTarget['dispatchEvent'];
            }
        },
    };
}
