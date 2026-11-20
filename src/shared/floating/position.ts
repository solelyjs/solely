/**
 * 浮层定位纯函数（0.8.0 浮层基座第一步）
 *
 * 约束见 `docs/architecture/contracts.md`（浮层部分）；完整编号版见本地审计材料 `docs/internal/design-contracts.md`（不入库）：
 * - 只做几何计算，不查询 DOM、不监听事件、不创建元素、不读取 window。
 * - 所有环境输入（视口、容器、矩形）都由参数传入。
 * - 算法顺序固定：定位 → flip（主轴） → shift（交叉轴） → 主轴保底钳制 → 箭头钳制。
 *
 * auto 的判定规则（明确回答"可用空间优先还是首选方向优先"）：
 * 可用空间优先。依次计算 top / bottom / right / left 四侧的可用空间，
 * 在能完整容纳浮层（含 offset）的一侧中选可用空间最大者；
 * 四侧都放不下时选溢出最小者；仅当数值并列时，才按 top → bottom → right → left
 * 的书写顺序决胜（top 只是并列时的默认回退，不是优先级）。
 */

import type {
    ArrowPosition,
    ComputeOptions,
    FlipState,
    Overflow,
    Placement,
    PositionResult,
    RectLike,
    Size,
    ViewportSize,
} from './types';

/** 锚点与浮层默认间距 */
export const DEFAULT_OFFSET = 8;
/** 与视口边界默认内边距 */
export const DEFAULT_BOUNDARY_PADDING = 8;
/** 箭头距浮层边缘的最小距离 */
const ARROW_EDGE = 8;

type Side = 'top' | 'bottom' | 'left' | 'right';
type Alignment = 'center' | 'start' | 'end';

interface PlacementParts {
    readonly side: Side;
    readonly align: Alignment;
}

interface NormalizedRect {
    top: number;
    left: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
}

interface Point {
    x: number;
    y: number;
}

const PLACEMENT_PARTS: Record<Placement, PlacementParts> = {
    top: { side: 'top', align: 'center' },
    topLeft: { side: 'top', align: 'start' },
    topRight: { side: 'top', align: 'end' },
    bottom: { side: 'bottom', align: 'center' },
    bottomLeft: { side: 'bottom', align: 'start' },
    bottomRight: { side: 'bottom', align: 'end' },
    left: { side: 'left', align: 'center' },
    leftTop: { side: 'left', align: 'start' },
    leftBottom: { side: 'left', align: 'end' },
    right: { side: 'right', align: 'center' },
    rightTop: { side: 'right', align: 'start' },
    rightBottom: { side: 'right', align: 'end' },
};

/** 由 side + 对齐方式还原为 12 方位名 */
const PLACEMENT_NAME: Record<Side, Record<Alignment, Placement>> = {
    top: { center: 'top', start: 'topLeft', end: 'topRight' },
    bottom: { center: 'bottom', start: 'bottomLeft', end: 'bottomRight' },
    left: { center: 'left', start: 'leftTop', end: 'leftBottom' },
    right: { center: 'right', start: 'rightTop', end: 'rightBottom' },
};

const isVerticalSide = (side: Side): boolean => side === 'top' || side === 'bottom';

const OPPOSITE_SIDE: Record<Side, Side> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
};

const oppositeSide = (side: Side): Side => OPPOSITE_SIDE[side];

/** 主轴翻转：切换到对侧，保持对齐方式（topLeft ↔ bottomLeft） */
const flipPlacement = (placement: Placement): Placement => {
    const { side, align } = PLACEMENT_PARTS[placement];
    return PLACEMENT_NAME[oppositeSide(side)][align];
};

const normalizeRect = (rect: RectLike): NormalizedRect => ({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.right ?? rect.left + rect.width,
    bottom: rect.bottom ?? rect.top + rect.height,
});

/** 按方位计算浮层左上角（尚未做任何越界修正） */
const placeAt = (placement: Placement, anchor: NormalizedRect, size: Size, offset: number): Point => {
    const { side, align } = PLACEMENT_PARTS[placement];
    const centerX = anchor.left + (anchor.width - size.width) / 2;
    const centerY = anchor.top + (anchor.height - size.height) / 2;

    if (isVerticalSide(side)) {
        const x = align === 'center' ? centerX : align === 'start' ? anchor.left : anchor.right - size.width;
        const y = side === 'top' ? anchor.top - size.height - offset : anchor.bottom + offset;
        return { x, y };
    }

    const y = align === 'center' ? centerY : align === 'start' ? anchor.top : anchor.bottom - size.height;
    const x = side === 'left' ? anchor.left - size.width - offset : anchor.right + offset;
    return { x, y };
};

/**
 * 单轴溢出量：浮层在某一轴上越过 `[padding, extent - padding]` 的总量
 *
 * 两端都计入，因此锚点被滚出视口时（浮层整体位于视口外）也能得到正值。
 */
const axisOverflow = (start: number, size: number, extent: number, padding: number): number =>
    Math.max(0, padding - start, start + size - (extent - padding));

const mainOverflowOf = (
    point: Point,
    placement: Placement,
    size: Size,
    viewport: ViewportSize,
    padding: number,
): number => {
    const { side } = PLACEMENT_PARTS[placement];
    return isVerticalSide(side)
        ? axisOverflow(point.y, size.height, viewport.height, padding)
        : axisOverflow(point.x, size.width, viewport.width, padding);
};

const crossOverflowOf = (
    point: Point,
    placement: Placement,
    size: Size,
    viewport: ViewportSize,
    padding: number,
): number => {
    const { side } = PLACEMENT_PARTS[placement];
    return isVerticalSide(side)
        ? axisOverflow(point.x, size.width, viewport.width, padding)
        : axisOverflow(point.y, size.height, viewport.height, padding);
};

/**
 * 单轴钳制
 *
 * 浮层大于可用空间时（`extent - size - padding < padding`）无法两全，
 * 降级为贴住起点边界（top / left 可见），剩余溢出由 overflow 报告，调用方可选择隐藏。
 */
const clampAxis = (value: number, size: number, extent: number, padding: number): number => {
    const max = extent - size - padding;
    if (max < padding) return padding;
    return Math.min(Math.max(value, padding), max);
};

/**
 * auto：可用空间优先选侧
 *
 * 可用空间包含 offset，即"完整容纳"要求 `space >= size + offset`。
 * 四侧都不完整时按 `size + offset - space` 最小者降级。
 */
const chooseAutoPlacement = (
    anchor: NormalizedRect,
    size: Size,
    viewport: ViewportSize,
    offset: number,
    padding: number,
): Placement => {
    // 顺序即并列时的决胜顺序：top → bottom → right → left
    const candidates: Array<{ placement: Placement; space: number; need: number }> = [
        { placement: 'top', space: anchor.top - padding, need: size.height + offset },
        { placement: 'bottom', space: viewport.height - anchor.bottom - padding, need: size.height + offset },
        { placement: 'right', space: viewport.width - anchor.right - padding, need: size.width + offset },
        { placement: 'left', space: anchor.left - padding, need: size.width + offset },
    ];

    let bestFitting: Placement | undefined;
    let bestFittingSpace = Number.NEGATIVE_INFINITY;
    let bestFallback: Placement = 'top';
    let bestFallbackOverflow = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        const overflow = candidate.need - candidate.space;
        if (overflow <= 0 && candidate.space > bestFittingSpace) {
            bestFitting = candidate.placement;
            bestFittingSpace = candidate.space;
        }
        if (overflow < bestFallbackOverflow) {
            bestFallback = candidate.placement;
            bestFallbackOverflow = overflow;
        }
    }

    return bestFitting ?? bestFallback;
};

/** 箭头偏移：钳制在 [8, size - 8]；尺寸过小时取中点 */
const clampArrow = (value: number, size: number): number => {
    const max = size - ARROW_EDGE;
    if (max <= ARROW_EDGE) return size / 2;
    return Math.min(Math.max(value, ARROW_EDGE), max);
};

/**
 * 计算箭头在浮层交叉轴上的位置：
 * - 居中方位（top / bottom / left / right）：跟踪锚点中心；
 * - 变体方位（align=start / end）：靠近对应的对齐边（16px，与 CSS 方位类一致）。
 *
 * 变体方位若仍取锚点中心，当锚点明显大于浮层时箭头会被钳制到与方位名相反的一侧，
 * 例如 leftTop 的箭头落到气泡底部、leftBottom 落到气泡顶部。0.8.0 声明式 tooltip
 * 改为 JS 定位后暴露了这一点，此处与静态 CSS 规则重新对齐。
 */
const computeArrow = (placement: Placement, point: Point, anchor: NormalizedRect, size: Size): ArrowPosition => {
    const { side, align } = PLACEMENT_PARTS[placement];
    const vertical = isVerticalSide(side);
    const extent = vertical ? size.width : size.height;
    const origin = vertical ? point.x : point.y;
    const anchorStart = vertical ? anchor.left : anchor.top;
    const anchorEnd = vertical ? anchor.right : anchor.bottom;

    let target: number;
    if (align === 'start') {
        target = anchorStart + ARROW_EDGE * 2;
    } else if (align === 'end') {
        target = anchorEnd - ARROW_EDGE * 2;
    } else {
        target = (anchorStart + anchorEnd) / 2;
    }

    const offset = clampArrow(target - origin, extent);
    return vertical ? { x: offset } : { y: offset };
};

/**
 * 计算浮层坐标
 *
 * @param anchorRect 锚点矩形（`getBoundingClientRect()` 结果或等价数据）
 * @param floatingSize 浮层尺寸
 * @param options 期望方位、视口、偏移、边界与坐标策略
 */
export const computePosition = (anchorRect: RectLike, floatingSize: Size, options: ComputeOptions): PositionResult => {
    const {
        placement,
        viewport,
        offset = DEFAULT_OFFSET,
        boundaryPadding = DEFAULT_BOUNDARY_PADDING,
        flip = true,
        shift = true,
        strategy = 'fixed',
        container,
    } = options;

    const anchor = normalizeRect(anchorRect);
    const preferred =
        placement === 'auto' ? chooseAutoPlacement(anchor, floatingSize, viewport, offset, boundaryPadding) : placement;

    let finalPlacement = preferred;
    let point = placeAt(preferred, anchor, floatingSize, offset);
    let mainOverflow = mainOverflowOf(point, preferred, floatingSize, viewport, boundaryPadding);
    let flipped = false;
    const tried: Placement[] = [preferred];

    if (flip && mainOverflow > 0) {
        // 两级回退：首选 → 对侧。对侧同样溢出时取主轴溢出更小者，
        // 溢出相等则保留首选，避免无意义的视觉跳变。
        const candidate = flipPlacement(preferred);
        tried.push(candidate);
        const candidatePoint = placeAt(candidate, anchor, floatingSize, offset);
        const candidateOverflow = mainOverflowOf(candidatePoint, candidate, floatingSize, viewport, boundaryPadding);
        if (candidateOverflow < mainOverflow) {
            finalPlacement = candidate;
            point = candidatePoint;
            mainOverflow = candidateOverflow;
            flipped = true;
        }
    }

    // shift：交叉轴平移回边界内（主轴不参与）
    if (shift) {
        if (isVerticalSide(PLACEMENT_PARTS[finalPlacement].side)) {
            point.x = clampAxis(point.x, floatingSize.width, viewport.width, boundaryPadding);
        } else {
            point.y = clampAxis(point.y, floatingSize.height, viewport.height, boundaryPadding);
        }
    }

    // 主轴保底钳制：即使 flip 关闭或对侧仍溢出，也保证至少起点边界可见
    if (isVerticalSide(PLACEMENT_PARTS[finalPlacement].side)) {
        point.y = clampAxis(point.y, floatingSize.height, viewport.height, boundaryPadding);
    } else {
        point.x = clampAxis(point.x, floatingSize.width, viewport.width, boundaryPadding);
    }

    const crossOverflow = crossOverflowOf(point, finalPlacement, floatingSize, viewport, boundaryPadding);
    const arrow = computeArrow(finalPlacement, point, anchor, floatingSize);

    // 坐标空间：fixed 直接使用视口坐标；absolute 按 C-OVL-03 换算到容器坐标
    let x = point.x;
    let y = point.y;
    if (strategy === 'absolute' && container) {
        x = x - container.rect.left + (container.scrollLeft ?? 0) - (container.clientLeft ?? 0);
        y = y - container.rect.top + (container.scrollTop ?? 0) - (container.clientTop ?? 0);
    }

    const overflow: Overflow = { main: mainOverflow, cross: crossOverflow };
    const flipState: FlipState = { requested: placement, preferred, final: finalPlacement, flipped, tried };

    return {
        x,
        y,
        top: y,
        left: x,
        placement: finalPlacement,
        arrow,
        overflow,
        flipState,
    };
};

/* -------------------- 重定位订阅（C-OVL-04） -------------------- */

export interface ObservePositionOptions {
    /** 锚点：位置变化时触发重新计算 */
    anchor: HTMLElement;
    /** 浮层：尺寸变化时触发重新计算 */
    floating: HTMLElement;
    /** 重新定位回调；由调用方自行读取几何并调用 `computePosition` */
    update: () => void;
    /** 锚点从文档中移除时的回调（例如滚动容器中被删除） */
    onAnchorLost?: () => void;
}

interface PositionSubscription extends ObservePositionOptions {
    stopped: boolean;
    /** 锚点路径上的滚动祖先，需逐个订阅（scroll 不冒泡且不跨 shadow boundary） */
    scrollTargets: EventTarget[];
    onScroll: () => void;
}

const subscriptions = new Set<PositionSubscription>();
let scheduled: number | null = null;
let globalsBound = false;
let resizeObserver: ResizeObserver | null = null;

/** 锚点可能被移动到新的滚动容器；滚动祖先变化时重订阅，避免其滚动不再触发重定位 */
function refreshScrollTargets(subscription: PositionSubscription): void {
    const next = collectScrollAncestors(subscription.anchor);
    const prev = subscription.scrollTargets;
    if (next.length === prev.length && next.every((target, index) => target === prev[index])) return;

    for (const target of prev) target.removeEventListener('scroll', subscription.onScroll, true);
    for (const target of next) {
        target.addEventListener('scroll', subscription.onScroll, { capture: true, passive: true });
    }
    subscription.scrollTargets = next;
}

function runSubscriptions(): void {
    scheduled = null;
    for (const subscription of Array.from(subscriptions)) {
        if (subscription.stopped) continue;
        if (!subscription.anchor.isConnected) {
            subscription.onAnchorLost?.();
            continue;
        }
        if (!subscription.floating.isConnected) continue;
        refreshScrollTargets(subscription);
        subscription.update();
    }
}

function scheduleSubscriptions(): void {
    if (scheduled !== null) return;
    if (typeof requestAnimationFrame === 'function') {
        scheduled = requestAnimationFrame(runSubscriptions);
        return;
    }
    scheduled = setTimeout(runSubscriptions, 16) as unknown as number;
}

/**
 * 收集锚点到文档根之间的祖先节点（含 ShadowRoot）。
 *
 * scroll 事件不冒泡，且元素触发时 composed=false：事件路径在 shadow root 处被截断，
 * window 上的 capture 监听只能收到 document 级滚动，收不到 shadow DOM 内滚动容器
 * （例如文档站 `.content`、组件内部滚动区）的滚动。
 * 因此必须沿 parentNode 链逐个订阅；遇到 ShadowRoot 时跳到它的 host 继续向上。
 * 统一用 capture 监听，滚动容器自身作为事件 target 时也能触发。
 */
function collectScrollAncestors(anchor: HTMLElement): EventTarget[] {
    const targets: EventTarget[] = [];
    let node: Node | null = anchor.parentNode;
    while (node && node !== document) {
        targets.push(node);
        const parent: Node | null = node.parentNode;
        if (parent) {
            node = parent;
            continue;
        }
        // ShadowRoot 是 DocumentFragment：没有 parentNode，但有宿主元素
        const host = (node as ShadowRoot).host;
        node = host ? host.parentNode : null;
    }
    return targets;
}

function bindGlobalListeners(): void {
    if (globalsBound || typeof window === 'undefined') return;
    globalsBound = true;
    // 仅覆盖 document 级滚动与窗口尺寸变化；shadow 内滚动容器由每个订阅单独监听
    window.addEventListener('scroll', scheduleSubscriptions, true);
    window.addEventListener('resize', scheduleSubscriptions);

    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleSubscriptions);
    }
}

function unbindGlobalListeners(): void {
    if (!globalsBound || typeof window === 'undefined') return;
    globalsBound = false;
    window.removeEventListener('scroll', scheduleSubscriptions, true);
    window.removeEventListener('resize', scheduleSubscriptions);
    resizeObserver?.disconnect();
    resizeObserver = null;
}

/**
 * 订阅锚点/浮层的位置与尺寸变化。
 *
 * 内部复用一组全局监听与单一 rAF 批处理，多个浮层同时打开时不重复绑定。
 * 锚点路径上的每个祖先都订阅 scroll（capture），因此 Shadow DOM 内的滚动容器
 * 也能触发重定位；返回的清理函数幂等，会一并解绑这些监听。
 */
export function observePosition(options: ObservePositionOptions): () => void {
    if (typeof window === 'undefined') return () => undefined;

    const onScroll = scheduleSubscriptions;
    const scrollTargets = collectScrollAncestors(options.anchor);
    for (const target of scrollTargets) {
        target.addEventListener('scroll', onScroll, { capture: true, passive: true });
    }

    const subscription: PositionSubscription = { ...options, stopped: false, scrollTargets, onScroll };
    subscriptions.add(subscription);
    bindGlobalListeners();
    resizeObserver?.observe(options.anchor);
    resizeObserver?.observe(options.floating);

    return () => {
        if (subscription.stopped) return;
        subscription.stopped = true;
        subscriptions.delete(subscription);
        for (const target of subscription.scrollTargets) {
            target.removeEventListener('scroll', onScroll, true);
        }
        resizeObserver?.unobserve(options.anchor);
        resizeObserver?.unobserve(options.floating);
        if (subscriptions.size === 0) unbindGlobalListeners();
    };
}
