/**
 * 浮层栈基座：Esc / 焦点 / 滚动锁 / z-index / inert
 *
 * 约束见 `docs/architecture/contracts.md`（浮层部分）；完整编号版见本地审计材料 `docs/internal/design-contracts.md`（不入库）。
 *
 * 本模块已接线到 tooltip / select / popconfirm / modal / drawer：
 * - 全库唯一的 `document` capture 阶段 `keydown` 监听在这里。
 * - 类型按任务要求内联在本文件，不依赖 `./types.ts`（另一会话并行创建中）。
 */

export type OverlayKind = 'modal' | 'drawer' | 'popover' | 'dropdown' | 'tooltip';

export interface OverlayOptions {
    kind: OverlayKind;
    /** 接收 Tab / 焦点 / 初始聚焦的节点，也是浮层根节点 */
    container: HTMLElement;
    /** 打开者，用于焦点还原 */
    trigger?: HTMLElement | null;
    /**
     * Esc 行为：
     * - `true`（默认）：关闭当前层并消费 Esc（preventDefault + stopPropagation）
     * - `false`：不响应 Esc，继续向下找
     * - `'passthrough'`：关闭当前层但不消费，Esc 继续向下传递（tooltip）
     */
    escClosable?: boolean | 'passthrough';
    /** 默认 false；仅 modal/drawer 打开 */
    trapFocus?: boolean;
    /** 默认 false；仅 modal/drawer 打开 */
    lockScroll?: boolean;
    /** 默认 false；仅 modal/drawer 打开 */
    inertBackground?: boolean;
    /** 默认 true；select 下拉传 false，焦点留在宿主 */
    autoFocus?: boolean;
    /** 默认 true */
    returnFocus?: boolean;
    initialFocus?: HTMLElement | (() => HTMLElement | null);
    /** 仅 escClosable !== false 的层需要提供 */
    onEscape?: () => void;
}

export interface OverlayHandle {
    /** 打开：分配 z-index、入栈、聚焦、加锁 */
    activate(): void;
    /** 开始关闭：出栈，停止 Esc / Tab 陷阱；保留锁与 inert */
    deactivate(): void;
    /** 动画结束：还原焦点，释放锁与 inert */
    dispose(): void;
    isTop(): boolean;
    getZIndex(): number;
}

type LayerState = 'idle' | 'active' | 'inactive' | 'disposed';

interface Layer {
    options: OverlayOptions;
    container: HTMLElement;
    state: LayerState;
    zIndex: number;
    /** 打开时记录的来源焦点 */
    previousFocus: HTMLElement | null;
    /** 本层打开后最后聚焦的元素 */
    lastFocus: HTMLElement | null;
    /** 关闭（deactivate）瞬间本层是否为栈顶 */
    wasTopWhenClosed: boolean;
    releaseScroll: (() => void) | null;
    inertElements: Set<Element> | null;
    onFocus: ((event: Event) => void) | null;
    /** 基座是否为兜底聚焦自行添加了 tabindex="-1"（dispose 时还原） */
    autoTabIndex: boolean;
    /** 容器是否曾连接在文档中；用于异常卸载兜底，避免误伤"注册后才挂载"的时序 */
    containerWasConnected: boolean;
}

// ---------- 常量 ----------

/** kind 对应的第一层起点；首次读取优先用 CSS 变量覆盖 */
const KIND_FLOORS: Record<OverlayKind, number> = {
    dropdown: 1000,
    modal: 1050,
    drawer: 1050,
    popover: 1060,
    tooltip: 1070,
};

const Z_INDEX_STEP = 10;
const Z_INDEX_WRAP_THRESHOLD = 1990;

/** 浏览器原生可聚焦候选（是否可 Tab 到由 isTabbable 再判定） */
const TABBABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'iframe',
    'object',
    'embed',
    'audio[controls]',
    'video[controls]',
    '[contenteditable]:not([contenteditable="false"])',
    '[tabindex]',
].join(',');

/** 仅当作用域是 document.body 时排除的通告类节点 */
const BODY_SCOPE_EXCLUDED_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK']);

// ---------- 模块级状态 ----------

const stack: Layer[] = [];
/** 所有已注册且未 dispose 的层，用于 inert 排除与焦点引用重定向 */
const liveLayers = new Set<Layer>();
let keydownBound = false;
/** 兜底清理：仅在层仍持有滚动锁 / inert 时启用，避免常态下的全文档观察开销 */
let detachedObserver: MutationObserver | null = null;

// ---------- z-index 分配（C-OVL-16） ----------

function readFloor(kind: OverlayKind): number {
    const fallback = KIND_FLOORS[kind];
    if (typeof document === 'undefined' || !document.documentElement) return fallback;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--solely-z-index-${kind}`).trim();
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 后开者永远在上：以当前仍存活的层为基准计算，而不是维护单调递增的全局计数器，
 * 避免单层反复开合把 z-index 累积到回绕阈值。
 */
function allocateZIndex(kind: OverlayKind, current?: Layer): number {
    const floor = readFloor(kind);
    let activeMax = 0;
    liveLayers.forEach(layer => {
        if (layer === current || layer.state === 'disposed') return;
        // inactive 层关闭动画期间仍在 DOM 中，必须计入，保证新层压住它；
        // idle 层 zIndex 为 0，不影响结果。
        if (layer.zIndex > activeMax) activeMax = layer.zIndex;
    });

    const next = Math.max(floor, activeMax + Z_INDEX_STEP);
    // 主题把起点设在阈值以上属于异常配置，不回绕；正常路径达不到该阈值
    if (next >= Z_INDEX_WRAP_THRESHOLD && floor < Z_INDEX_WRAP_THRESHOLD) {
        console.warn(`[solely] 浮层 z-index 已达 ${next}，回绕到 ${floor}。`);
        return floor;
    }
    return next;
}

// ---------- 焦点判定（C-OVL-12 的可聚焦判定） ----------

/**
 * 候选是否"可能"接收焦点：连接、非 inert、非 hidden、非 disabled、可见且有盒子。
 * 是否真正拿到焦点由 tryFocus 的 activeElement 校验决定。
 */
function isUsableFocusTarget(el: HTMLElement | null | undefined): el is HTMLElement {
    if (!el || !el.isConnected) return false;
    if (el.closest('[inert]')) return false;
    if (el.hasAttribute('hidden')) return false;
    if (el.matches(':disabled')) return false;
    if (getComputedStyle(el).visibility === 'hidden') return false;
    if (el.getClientRects().length === 0) return false;
    return true;
}

/** Tab 序列中的可聚焦元素：额外要求 tabIndex >= 0 或 contentEditable */
function isTabbable(el: HTMLElement | null | undefined): el is HTMLElement {
    if (!isUsableFocusTarget(el)) return false;
    return el.tabIndex >= 0 || el.isContentEditable === true;
}

/**
 * 穿透 Shadow DOM 读取真正获得焦点的元素。
 * `document.activeElement` 在 shadow 内会返回宿主，导致 focus 校验与还原判定失效。
 */
function getDeepActiveElement(): HTMLElement | null {
    let active = document.activeElement as HTMLElement | null;
    while (active?.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement as HTMLElement;
    }
    return active;
}

/**
 * 跨 Shadow DOM 的祖先判定。
 * `Node.contains()` 不穿透 shadow 边界，而 `getDeepActiveElement()` 返回的可能是
 * shadow tree 内的元素，直接用 contains 会把「层内焦点」误判为「层外」。
 */
function composedContains(container: Node, target: Node | null): boolean {
    let node: Node | null = target;
    while (node) {
        if (node === container) return true;
        if (node.parentNode) {
            node = node.parentNode;
            continue;
        }
        const root = typeof node.getRootNode === 'function' ? node.getRootNode() : null;
        node = root instanceof ShadowRoot ? root.host : null;
    }
    return false;
}

/**
 * 尝试聚焦并校验结果。
 * 仅检查 focus 是否存在不够：无 tabindex 的自定义元素宿主可能 focus() 无效，
 * 契约要求此时继续沿候选链前进。
 */
function tryFocus(el: HTMLElement | null | undefined): boolean {
    if (!el || typeof el.focus !== 'function') return false;
    try {
        el.focus({ preventScroll: true });
    } catch {
        // 老环境不接受 focus options
        try {
            el.focus();
        } catch {
            return false;
        }
    }
    const active = getDeepActiveElement();
    return !!active && (active === el || composedContains(el, active));
}

function collectTabbables(container: HTMLElement): HTMLElement[] {
    // 每次 Tab 重新计算，不缓存：浮层内容可能动态变化
    const nodes = Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR));
    return nodes.filter(isTabbable);
}

function resolveInitialFocus(layer: Layer): HTMLElement | null {
    const { initialFocus } = layer.options;
    if (!initialFocus) return null;
    return typeof initialFocus === 'function' ? initialFocus() : initialFocus;
}

/**
 * 兜底聚焦容器前确保它可聚焦：无 tabindex 的自定义元素/容器宿主默认
 * tabIndex 为 -1，直接 focus() 会静默失败。基座自行补 tabindex="-1"，
 * 调用方无需预先设置；dispose 时若值仍由基座写入则移除。
 */
function ensureContainerFocusable(layer: Layer): void {
    const container = layer.container;
    if (container.hasAttribute('tabindex')) return;
    if (container.tabIndex >= 0 || container.isContentEditable) return;
    container.setAttribute('tabindex', '-1');
    layer.autoTabIndex = true;
}

/** C-OVL-10：initialFocus → [autofocus] → 第一个可聚焦元素 → container */
function focusIntoLayer(layer: Layer): void {
    const initial = resolveInitialFocus(layer);
    if (isUsableFocusTarget(initial) && tryFocus(initial)) return;

    const autofocus = layer.container.querySelector<HTMLElement>('[autofocus]');
    if (isTabbable(autofocus) && tryFocus(autofocus)) return;

    const first = collectTabbables(layer.container)[0];
    if (first && tryFocus(first)) return;

    // 容器兜底焦点：必要时自动补 tabindex="-1"，不再要求调用方预置
    ensureContainerFocusable(layer);
    tryFocus(layer.container);
}

// ---------- 键盘：Esc（C-OVL-09）与 Tab 陷阱（C-OVL-11） ----------

/**
 * 解析一次 Esc 需要通知的层（栈顶向下）：
 * - `escClosable === false`：跳过；
 * - `escClosable === 'passthrough'`：收入结果但不中断，继续向下；
 * - 其余（true）：收入结果并终止。
 */
function resolveEscLayers(): Array<{ layer: Layer; consume: boolean }> {
    const resolved: Array<{ layer: Layer; consume: boolean }> = [];
    for (let i = stack.length - 1; i >= 0; i--) {
        const layer = stack[i];
        if (layer.options.escClosable === false) continue;
        const consume = layer.options.escClosable !== 'passthrough';
        resolved.push({ layer, consume });
        if (consume) break;
    }
    return resolved;
}

function applyTabTrap(layer: Layer, event: KeyboardEvent): void {
    const items = collectTabbables(layer.container);
    const active = getDeepActiveElement();
    const inside = !!active && active !== layer.container && composedContains(layer.container, active);

    if (items.length === 0) {
        event.preventDefault();
        // 无 Tab 可聚焦项时兜底聚焦容器，同样自动补 tabindex
        ensureContainerFocusable(layer);
        tryFocus(layer.container);
        return;
    }

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey) {
        if (!inside || active === first) {
            event.preventDefault();
            tryFocus(last);
        }
        return;
    }

    if (!inside || active === last) {
        event.preventDefault();
        tryFocus(first);
    }
}

/** 全库唯一的 document capture keydown 监听 */
function handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;

    if (event.key === 'Escape') {
        const resolved = resolveEscLayers();
        if (resolved.length === 0) return; // 没有可关闭层：不处理、不 preventDefault

        let consumed = false;
        for (const { layer, consume } of resolved) {
            layer.options.onEscape?.();
            if (consume) {
                consumed = true;
                break;
            }
        }
        // passthrough 层只关闭自身，不阻止事件继续传递
        if (consumed) {
            event.preventDefault();
            event.stopPropagation();
        }
        return;
    }

    if (event.key === 'Tab') {
        // 从栈顶向下找最近的焦点陷阱层：tooltip / 下拉等 trapFocus=false 的层
        // 可能悬在 modal 之上，不能让它们旁路下层浮层的焦点约束。
        let trapping: Layer | undefined;
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].options.trapFocus === true) {
                trapping = stack[i];
                break;
            }
        }
        if (!trapping) return;
        applyTabTrap(trapping, event);
    }
}

function syncKeydownListener(): void {
    if (typeof document === 'undefined') return;
    const needed = stack.length > 0;
    if (needed && !keydownBound) {
        document.addEventListener('keydown', handleDocumentKeydown, true);
        keydownBound = true;
    } else if (!needed && keydownBound) {
        document.removeEventListener('keydown', handleDocumentKeydown, true);
        keydownBound = false;
    }
}

// ---------- 滚动锁（C-OVL-14） ----------

let scrollLockCount = 0;
let savedBodyOverflow: string | null = null;
let savedBodyPaddingRight: string | null = null;

/**
 * 引用计数滚动锁；返回的 unlock 幂等，且只在最后一个锁释放时精确还原内联值。
 */
export function lockScroll(): () => void {
    if (typeof document === 'undefined' || !document.body) return () => undefined;

    scrollLockCount += 1;
    if (scrollLockCount === 1) {
        const body = document.body;
        savedBodyOverflow = body.style.overflow;
        savedBodyPaddingRight = body.style.paddingRight;
        // 必须先量滚动条宽度：一旦把 overflow 置为 hidden，滚动条消失，
        // documentElement.clientWidth 会立刻变成 innerWidth，此时再量恒为 0，
        // 补偿永远不会写入，打开浮层时页面会横向跳动一个滚动条宽度。
        const gap = window.innerWidth - document.documentElement.clientWidth;
        body.style.overflow = 'hidden';

        if (gap > 0) {
            const padding = Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
            body.style.paddingRight = `${padding + gap}px`;
        }
    }

    let released = false;
    return () => {
        if (released) return;
        released = true;
        scrollLockCount = Math.max(0, scrollLockCount - 1);
        if (scrollLockCount > 0) return;
        if (savedBodyOverflow === null || savedBodyPaddingRight === null) return;

        document.body.style.overflow = savedBodyOverflow;
        document.body.style.paddingRight = savedBodyPaddingRight;
        savedBodyOverflow = null;
        savedBodyPaddingRight = null;
    };
}

// ---------- 背景 inert（C-OVL-27 的引用计数部分） ----------

interface InertSnapshot {
    inert: boolean;
    ariaHidden: string | null;
}

const inertRefCounts = new Map<Element, number>();
const inertSnapshots = new Map<Element, InertSnapshot>();

function supportsInertAttribute(): boolean {
    return typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
}

/** 浮层的挂载作用域：Document → body；ShadowRoot → 该 shadow root */
function resolveInertScope(container: HTMLElement): ParentNode | null {
    const root = container.getRootNode();
    if (typeof document !== 'undefined' && root === document) return document.body;
    if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) return root;
    return null;
}

function collectInertTargets(layer: Layer): Element[] {
    const scope = resolveInertScope(layer.container);
    if (!scope) return [];

    // 其他仍存在的浮层根节点必须排除，否则嵌套 modal 会互相 inert
    const excluded = new Set<Element>();
    liveLayers.forEach(other => {
        if (other !== layer) excluded.add(other.container);
    });

    const targets: Element[] = [];
    const bodyScope = typeof document !== 'undefined' && scope === document.body;

    Array.from(scope.children).forEach(child => {
        if (child === layer.container || excluded.has(child)) return;
        if (bodyScope) {
            if (BODY_SCOPE_EXCLUDED_TAGS.has(child.tagName.toUpperCase())) return;
            // 通告类节点永远可读
            if (child.matches('[aria-live]')) return;
            if (child.classList.contains('solely-message-container')) return;
        }
        targets.push(child);
    });

    return targets;
}

function applyInert(layer: Layer, targets: Element[]): void {
    layer.inertElements = new Set(targets);
    const useInert = supportsInertAttribute();

    targets.forEach(el => {
        const count = inertRefCounts.get(el) ?? 0;
        inertRefCounts.set(el, count + 1);
        if (count > 0) return; // 已有其他浮层 inert 该节点，不重复写入

        inertSnapshots.set(el, {
            inert: el.hasAttribute('inert'),
            ariaHidden: el.getAttribute('aria-hidden'),
        });
        el.setAttribute('inert', '');
        // inert 不支持时退化为 aria-hidden + 焦点陷阱
        if (!useInert) el.setAttribute('aria-hidden', 'true');
    });
}

function releaseInert(layer: Layer): void {
    if (!layer.inertElements) return;

    layer.inertElements.forEach(el => {
        const count = inertRefCounts.get(el) ?? 0;
        if (count > 1) {
            inertRefCounts.set(el, count - 1);
            return;
        }

        inertRefCounts.delete(el);
        const snapshot = inertSnapshots.get(el);
        inertSnapshots.delete(el);
        if (!snapshot) {
            el.removeAttribute('inert');
            return;
        }
        if (!snapshot.inert) el.removeAttribute('inert');
        if (snapshot.ariaHidden === null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', snapshot.ariaHidden);
    });

    layer.inertElements = null;
}

// ---------- 焦点还原（C-OVL-12） ----------

function isInsideClosingLayer(container: HTMLElement, el: HTMLElement): boolean {
    return el === container || composedContains(container, el);
}

/**
 * 关闭任意层时，把其他层中"指向本层内部"的 previousFocus / lastFocus
 * 重定向到本层的 previousFocus，避免还原指针悬空。
 */
function redirectFocusReferences(closing: Layer): void {
    const replacement = closing.previousFocus;
    liveLayers.forEach(other => {
        if (other === closing) return;
        const previous = other.previousFocus;
        if (previous && isInsideClosingLayer(closing.container, previous)) {
            other.previousFocus = replacement;
        }
        if (other.lastFocus && isInsideClosingLayer(closing.container, other.lastFocus)) {
            other.lastFocus = replacement;
        }
    });
}

function shouldRestoreFocus(layer: Layer, wasTop: boolean): boolean {
    if (layer.options.returnFocus === false) return false;
    if (!wasTop) return false;
    const active = getDeepActiveElement();
    // 动画期间用户把焦点移到别处（既不在本层内也不是 body）时不抢焦点
    if (!active || active === document.body) return true;
    return composedContains(layer.container, active);
}

/** 六段候选链：trigger → previousFocus → 下层 lastFocus → 下层 container → 下层 trigger/previousFocus → blur */
function restoreFocusAfterClose(layer: Layer): void {
    const below = stack[stack.length - 1];

    const candidates: Array<HTMLElement | null> = [
        layer.options.trigger ?? null,
        layer.previousFocus,
        below ? below.lastFocus : null,
        below ? below.container : null,
        below ? (below.options.trigger ?? null) : null,
        below ? below.previousFocus : null,
    ];

    for (const candidate of candidates) {
        if (!isUsableFocusTarget(candidate)) continue;
        if (tryFocus(candidate)) return;
    }

    const active = getDeepActiveElement();
    if (active && active !== document.body && typeof active.blur === 'function') {
        active.blur();
    }
}

// ---------- 栈操作与生命周期 ----------

function isTopLayer(layer: Layer): boolean {
    return stack[stack.length - 1] === layer;
}

function removeFromStack(layer: Layer): void {
    const index = stack.indexOf(layer);
    if (index !== -1) stack.splice(index, 1);
}

/* ---------- 异常卸载兜底（容器被移除而组件未 dispose） ---------- */

/** 是否还有层持有需要兜底释放的资源（滚动锁 / 背景 inert） */
function hasHeldResources(): boolean {
    for (const layer of liveLayers) {
        if (layer.releaseScroll || layer.inertElements) return true;
    }
    return false;
}

function syncDetachedObserver(): void {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const needed = hasHeldResources();
    if (needed && !detachedObserver) {
        detachedObserver = new MutationObserver(() => {
            pruneDetachedLayers();
        });
        detachedObserver.observe(document.documentElement, { childList: true, subtree: true });
    } else if (!needed && detachedObserver) {
        detachedObserver.disconnect();
        detachedObserver = null;
    }
}

/**
 * 释放容器已从文档移除、但组件未调用 dispose 的层。
 * 只处理"曾经连接过"的容器：注册后延迟挂载属于合法时序，不能被误伤。
 */
function pruneDetachedLayers(): void {
    const detached: Layer[] = [];
    liveLayers.forEach(layer => {
        if (layer.containerWasConnected && !layer.container.isConnected) detached.push(layer);
    });
    if (detached.length === 0) return;
    detached.forEach(layer => disposeLayer(layer));
    syncDetachedObserver();
}

let pruneScheduled = false;

/**
 * 延迟到微任务再剪枝。
 *
 * activate / register 可能发生在「容器移出 → 重新插入」的同一任务中，
 * 同步剪枝会把仍要复用的层误 dispose；微任务执行时 DOM 移动已经完成。
 * 真正遗留的层仍会在本次微任务中被清理，不改变兜底语义。
 */
function scheduleDetachedPrune(): void {
    if (pruneScheduled) return;
    pruneScheduled = true;
    queueMicrotask(() => {
        pruneScheduled = false;
        pruneDetachedLayers();
    });
}

function attachFocusTracking(layer: Layer): void {
    if (layer.onFocus) return;
    layer.onFocus = (event: Event) => {
        const target = event.target as HTMLElement | null;
        if (target && composedContains(layer.container, target)) {
            layer.lastFocus = target;
        }
    };
    // focusin 与 focus 都监听：focus 不冒泡但 capture 阶段可到达；
    // 两者重复触发只是幂等赋值。
    layer.container.addEventListener('focusin', layer.onFocus, true);
    layer.container.addEventListener('focus', layer.onFocus, true);
}

function detachFocusTracking(layer: Layer): void {
    if (!layer.onFocus) return;
    layer.container.removeEventListener('focusin', layer.onFocus, true);
    layer.container.removeEventListener('focus', layer.onFocus, true);
    layer.onFocus = null;
}

function activateLayer(layer: Layer): void {
    if (layer.state === 'disposed') {
        console.warn('[solely] 已 dispose 的浮层句柄不能再次 activate。');
        return;
    }
    if (layer.state === 'active') return;

    // 打开前安排清理容器已被移除的残留层，避免旧的滚动锁拖累新浮层。
    // 延迟到微任务：容器可能正在同一任务内被移出再插回。
    scheduleDetachedPrune();
    if (!liveLayers.has(layer)) return;

    const firstOpen = layer.state === 'idle';
    layer.state = 'active';
    layer.wasTopWhenClosed = false;
    if (layer.container.isConnected) layer.containerWasConnected = true;

    // z-index 每次打开都重新分配：重新激活时可能已被其它层超越，
    // 复用旧值会导致后激活的层压在已打开层之下。
    layer.zIndex = allocateZIndex(layer.options.kind, layer);
    if (firstOpen) {
        const active = getDeepActiveElement();
        layer.previousFocus = active && active !== document.body ? active : null;
    }
    layer.container.style.zIndex = String(layer.zIndex);

    attachFocusTracking(layer);
    stack.push(layer);
    syncKeydownListener();

    if (firstOpen) {
        if (layer.options.lockScroll === true) layer.releaseScroll = lockScroll();
        if (layer.options.inertBackground === true) applyInert(layer, collectInertTargets(layer));
    }
    syncDetachedObserver();

    if (layer.options.autoFocus !== false) {
        focusIntoLayer(layer);
        const active = getDeepActiveElement();
        if (active && composedContains(layer.container, active)) layer.lastFocus = active;
    }
}

function deactivateLayer(layer: Layer): void {
    if (layer.state !== 'active') return;
    // D8：deactivate 只停键盘/焦点进入；锁与 inert 留到 dispose 释放
    layer.wasTopWhenClosed = isTopLayer(layer);
    removeFromStack(layer);
    layer.state = 'inactive';
    syncKeydownListener();
    // deactivate 仍持有锁与 inert（D8），兜底观察器继续工作
    syncDetachedObserver();
}

function disposeLayer(layer: Layer): void {
    if (layer.state === 'disposed') return;

    const wasActive = layer.state === 'active';
    const wasTop = wasActive ? isTopLayer(layer) : layer.wasTopWhenClosed;

    if (wasActive) removeFromStack(layer);
    layer.state = 'disposed';
    liveLayers.delete(layer);
    syncKeydownListener();

    // 关闭动画期间焦点若仍在本层内，即为本层最后聚焦元素
    const active = getDeepActiveElement();
    if (active && composedContains(layer.container, active)) layer.lastFocus = active;

    redirectFocusReferences(layer);
    releaseInert(layer);

    if (layer.releaseScroll) {
        layer.releaseScroll();
        layer.releaseScroll = null;
    }

    detachFocusTracking(layer);

    if (shouldRestoreFocus(layer, wasTop)) restoreFocusAfterClose(layer);

    // 还原基座代办的可聚焦性，避免把内部契约遗留到 DOM 上
    if (layer.autoTabIndex && layer.container.getAttribute('tabindex') === '-1') {
        layer.container.removeAttribute('tabindex');
    }
    layer.autoTabIndex = false;

    syncDetachedObserver();
}

/**
 * 注册浮层。返回的 handle 由组件在 open/close 时序中驱动：
 * open → activate；关闭动画开始 → deactivate；动画结束 → dispose。
 */
export function registerOverlay(options: OverlayOptions): OverlayHandle {
    // 注册时安排清理已被移除的旧层（延迟到微任务，避免误伤同一任务内的 DOM 移动）
    scheduleDetachedPrune();

    const layer: Layer = {
        options,
        container: options.container,
        state: 'idle',
        zIndex: 0,
        previousFocus: null,
        lastFocus: null,
        wasTopWhenClosed: false,
        releaseScroll: null,
        inertElements: null,
        onFocus: null,
        autoTabIndex: false,
        containerWasConnected: options.container.isConnected,
    };

    liveLayers.add(layer);
    // escClosable 层必须提供关闭回调，否则 Esc 被消费却没有任何响应
    if (options.escClosable !== false && !options.onEscape) {
        console.warn(`[solely] ${options.kind} 浮层设置了 escClosable 但缺少 onEscape，Esc 将无效。`);
    }
    syncDetachedObserver();

    return {
        activate() {
            activateLayer(layer);
        },
        deactivate() {
            deactivateLayer(layer);
        },
        dispose() {
            disposeLayer(layer);
        },
        isTop() {
            return isTopLayer(layer);
        },
        getZIndex() {
            return layer.zIndex;
        },
    };
}
