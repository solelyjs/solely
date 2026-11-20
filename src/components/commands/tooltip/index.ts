/**
 * Solely Tooltip 命令式组件
 * 文字提示气泡框
 * 使用公共样式系统，遵循 BEM 命名规范和 CSS 变量体系
 *
 * 使用方式：
 * ```typescript
 * import { Tooltip } from 'solely/components/commands';
 *
 * // 绑定到元素（手动控制显隐）
 * const tooltip = Tooltip.bind(element, {
 *   content: '这是提示内容',
 *   placement: 'top'
 * });
 * tooltip.show();
 * tooltip.hide();
 * tooltip.destroy();
 *
 * // 一次性显示（自动隐藏）
 * Tooltip.showOnce(element, { content: '提示' });
 * ```
 */

import type { TooltipOptions, TooltipInstance, TooltipConfig } from './types';
import { generateId, injectStyle, createElement, observeTheme } from '../utils';
import { computePosition, observePosition } from '../../../shared/floating/position';
import { registerOverlay, type OverlayHandle } from '../../../shared/floating/overlay-stack';
import type { Placement } from '../../../shared/floating/types';
import { linkAria, type AriaLinkHandle } from '../../../shared/aria';
import { oneOf, PLACEMENTS } from '../../../shared/enum';
import styles from './style.css?inline';

const STYLE_ID = 'solely-tooltip-styles';

const globalConfig: TooltipConfig = {
    placement: 'top',
    trigger: 'hover',
    duration: 3000,
    singleton: true,
};

interface TooltipInfo {
    id: number;
    tooltipId: string;
    element: HTMLElement;
    target: HTMLElement;
    placement: Placement;
    className: string;
    /** 跨树 IDREF 链接句柄；释放时精确还原 target 原有 aria-describedby */
    ariaLink: AriaLinkHandle | null;
    cleanupTheme: () => void;
    overlay: OverlayHandle;
    stopObserve: () => void;
    /** 被外部（singleton 驱逐 / hideAll / destroy）释放时复位 bind 实例状态 */
    reset?: () => void;
}

const tooltipList: TooltipInfo[] = [];
// 已绑定的目标元素 -> 实例。重复 bind 同一元素时复用已有实例。
// 使用 WeakMap，避免长期持有已移除元素的引用。
const boundInstances = new WeakMap<HTMLElement, TooltipInstance>();

function ensureStylesInjected(): void {
    injectStyle(STYLE_ID, styles);
}

/** 使用基座纯函数定位：fixed 坐标系，不受祖先 overflow 裁剪 */
function positionTooltip(info: TooltipInfo): void {
    const rect = info.target.getBoundingClientRect();
    const floatingRect = info.element.getBoundingClientRect();
    const result = computePosition(
        rect,
        {
            // 入场动画带 transform: scale(...)，getBoundingClientRect() 会返回缩放后的尺寸；
            // 定位必须用布局尺寸，否则首次 flip/shift 按偏小的尺寸钳制，滚动后才修正。
            width: info.element.offsetWidth || floatingRect.width,
            height: info.element.offsetHeight || floatingRect.height,
        },
        {
            placement: info.placement,
            // fixed 可用区域不含滚动条；jsdom 的 clientWidth 为 0，回退到 innerWidth
            viewport: {
                width: document.documentElement.clientWidth || window.innerWidth,
                height: document.documentElement.clientHeight || window.innerHeight,
            },
            offset: 8,
            boundaryPadding: 8,
            flip: true,
            shift: true,
            strategy: 'fixed',
        },
    );

    info.element.className = ['solely-tooltip', `solely-tooltip--${result.placement}`, info.className]
        .filter(Boolean)
        .join(' ');

    info.element.style.position = 'fixed';
    info.element.style.top = `${result.top}px`;
    info.element.style.left = `${result.left}px`;
    info.element.style.bottom = 'auto';
    info.element.style.right = 'auto';

    const arrow = info.element.querySelector('.solely-tooltip__arrow') as HTMLElement | null;
    if (arrow) {
        // 同 popconfirm：用空串清空内联方位，避免 'auto' 覆盖 CSS 方位类的 top / left 定位
        arrow.style.top = '';
        arrow.style.left = '';
        if (result.arrow.x !== undefined) arrow.style.left = `${result.arrow.x}px`;
        if (result.arrow.y !== undefined) arrow.style.top = `${result.arrow.y}px`;
    }
}

function applyDescribedBy(info: TooltipInfo): void {
    // 复用基座：同树直接引用 tooltip id，跨 shadow 边界时在 target 树内生成代理，
    // 保证 aria-describedby 的 IDREF 在引用方作用域内可解析。
    info.ariaLink = linkAria(info.target, 'aria-describedby', info.element, {
        id: info.tooltipId,
        role: 'tooltip',
    });
}

function restoreDescribedBy(info: TooltipInfo): void {
    info.ariaLink?.release();
    info.ariaLink = null;
}

function disposeTooltip(info: TooltipInfo): void {
    info.stopObserve();
    info.overlay.deactivate();
    info.overlay.dispose();
    restoreDescribedBy(info);
    info.element.remove();
    info.cleanupTheme();
    // 外部释放：同步复位所属 bind 实例，否则其 visible 永久为 true、无法再次显示
    info.reset?.();
}

async function hideTooltipById(id: number, callback?: () => void): Promise<void> {
    const index = tooltipList.findIndex(t => t.id === id);
    if (index === -1) return;

    const [info] = tooltipList.splice(index, 1);
    disposeTooltip(info);
    callback?.();
}

function hideAllTooltipsSync(): void {
    if (tooltipList.length === 0) return;

    const all = tooltipList.splice(0, tooltipList.length);
    all.forEach(disposeTooltip);
}

async function hideAllTooltips(callback?: () => void): Promise<void> {
    hideAllTooltipsSync();
    callback?.();
}

function showTooltip(target: HTMLElement, options: TooltipOptions, reset?: () => void): number {
    const id = generateId();
    ensureStylesInjected();

    const placement: Placement = oneOf(options.placement ?? globalConfig.placement, PLACEMENTS, 'top');
    const shouldClone = options.cloneElement ?? true;

    const existingIndex = tooltipList.findIndex(t => t.target === target);
    if (existingIndex !== -1) {
        const [existing] = tooltipList.splice(existingIndex, 1);
        // 同一实例的重建不应把调用方的 visible 复位
        existing.reset = undefined;
        disposeTooltip(existing);
    }

    if (globalConfig.singleton && tooltipList.length > 0) {
        hideAllTooltipsSync();
    }

    // 前缀区分声明式 tooltip，避免两套计数器生成重复 id
    const tooltipId = `solely-tooltip-cmd-${id}`;
    const tooltip = createElement('div', {
        className: `solely-tooltip solely-tooltip--${placement}${options.className ? ` ${options.className}` : ''}`,
        attrs: { role: 'tooltip', id: tooltipId, 'aria-hidden': 'false' },
        styles: {
            ...(options.style as Partial<CSSStyleDeclaration>),
            ...(options.color ? { backgroundColor: options.color } : {}),
        },
    });

    // 使用共享主题观察者
    const cleanupTheme = observeTheme(() => tooltip);

    const contentEl = createElement('div', { className: 'solely-tooltip__content' });

    if (options.content) {
        if (typeof options.content === 'string') {
            contentEl.textContent = options.content;
        } else if (options.content instanceof HTMLElement) {
            contentEl.appendChild(shouldClone ? options.content.cloneNode(true) : options.content);
        }
    }

    tooltip.appendChild(contentEl);

    const arrow = createElement('div', { className: 'solely-tooltip__arrow' });
    if (options.color) {
        arrow.style.backgroundColor = options.color;
    }
    tooltip.appendChild(arrow);

    document.body.appendChild(tooltip);

    // 注册浮层：借用基座的 z-index 分配；焦点/滚动锁不参与，Esc 可关闭
    const overlay = registerOverlay({
        kind: 'tooltip',
        container: tooltip,
        trigger: target,
        // tooltip 可被 Esc 关闭，但不消费事件：继续传给下层可关闭浮层
        escClosable: 'passthrough',
        trapFocus: false,
        lockScroll: false,
        inertBackground: false,
        autoFocus: false,
        returnFocus: false,
        onEscape: () => {
            // bind 实例由 dispose 的 reset 回调复位；直接 API 调用则在此通知
            const hasBindReset = !!tooltipList.find(item => item.id === id)?.reset;
            void hideTooltipById(id, () => {
                if (!hasBindReset) options.onVisibleChange?.(false);
            });
        },
    });
    overlay.activate();

    const info: TooltipInfo = {
        id,
        tooltipId,
        element: tooltip,
        target,
        placement,
        className: options.className ?? '',
        ariaLink: null,
        cleanupTheme,
        overlay,
        stopObserve: () => undefined,
        reset,
    };

    applyDescribedBy(info);

    // 锚点/浮层变化时由基座统一批处理重定位（替代自研 scroll parent 监听）
    info.stopObserve = observePosition({
        anchor: target,
        floating: tooltip,
        update: () => positionTooltip(info),
        onAnchorLost: () => {
            void hideTooltipById(id);
        },
    });

    positionTooltip(info);
    requestAnimationFrame(() => {
        if (tooltip.isConnected) positionTooltip(info);
    });

    tooltipList.push(info);

    options.onVisibleChange?.(true);

    return id;
}

function bind(target: HTMLElement, options: TooltipOptions): TooltipInstance {
    // 同一目标重复绑定：复用已有实例，避免返回静默失效的空实例
    const existingInstance = boundInstances.get(target);
    if (existingInstance) {
        return existingInstance;
    }

    // 非法 trigger 不会绑定任何事件（气泡永远不出现），回退到默认 hover
    const trigger = oneOf(options.trigger ?? globalConfig.trigger, ['hover', 'click', 'focus', 'manual'], 'hover');
    let visible = options.visible ?? options.defaultVisible ?? false;
    let currentTooltipId: number | null = null;

    const hide = () => {
        if (!visible || currentTooltipId === null) return;
        const id = currentTooltipId;
        // 先复位状态：disposeTooltip 的 reset 回调会据此跳过重复通知
        visible = false;
        currentTooltipId = null;
        void hideTooltipById(id);
        options.onVisibleChange?.(false);
    };

    const show = () => {
        if (visible) return;
        visible = true;
        // 外部释放（singleton 驱逐 / hideAll / destroy）时由基座回调复位本实例
        const reset = () => {
            if (!visible) return;
            visible = false;
            currentTooltipId = null;
            options.onVisibleChange?.(false);
        };
        currentTooltipId = showTooltip(target, options, reset);
    };

    const destroy = () => {
        hide();
        boundInstances.delete(target);

        if (trigger === 'hover') {
            target.removeEventListener('mouseenter', show);
            target.removeEventListener('mouseleave', hide);
        } else if (trigger === 'click') {
            target.removeEventListener('click', handleClick);
            document.removeEventListener('click', handleOutsideClick);
        } else if (trigger === 'focus') {
            target.removeEventListener('focus', show);
            target.removeEventListener('blur', hide);
        }
    };

    const handleClick = (e: MouseEvent) => {
        e.stopPropagation();
        if (visible) {
            hide();
        } else {
            show();
        }
    };

    const handleOutsideClick = (e: MouseEvent) => {
        if (!visible) return;
        if (!target.contains(e.target as Node)) {
            hide();
        }
    };

    if (trigger === 'hover') {
        target.addEventListener('mouseenter', show);
        target.addEventListener('mouseleave', hide);
    } else if (trigger === 'click') {
        target.addEventListener('click', handleClick);
        document.addEventListener('click', handleOutsideClick);
    } else if (trigger === 'focus') {
        target.addEventListener('focus', show);
        target.addEventListener('blur', hide);
    }

    if (visible) {
        currentTooltipId = showTooltip(target, options, () => hide());
    }

    const instance: TooltipInstance = { show, hide, destroy };
    boundInstances.set(target, instance);

    return instance;
}

/**
 * 一次性显示 Tooltip（自动隐藏）
 * 如需手动控制显隐，请使用 bind() 方法
 */
function showOnce(target: HTMLElement, options: TooltipOptions & { duration?: number }): void {
    const id = showTooltip(target, options);
    const duration = options.duration ?? globalConfig.duration;
    if (duration > 0) {
        setTimeout(() => hideTooltipById(id), duration);
    }
}

function config(options: Partial<TooltipConfig>): void {
    Object.assign(globalConfig, options);
}

export const Tooltip = {
    /** 绑定到目标元素，返回可手动控制的实例 */
    bind,
    /** 一次性显示（自动隐藏）。如需手动控制请用 bind() */
    showOnce,
    /** @deprecated show 的别名，仅为向后兼容保留，请使用 showOnce */
    show: showOnce,
    /** 隐藏所有 Tooltip */
    hide: hideAllTooltips,
    /** 销毁所有 Tooltip */
    destroy: hideAllTooltipsSync,
    /** 配置全局默认值 */
    config,
};

export default Tooltip;
