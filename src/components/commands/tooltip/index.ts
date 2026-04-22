/**
 * Solely Tooltip 命令式组件
 * 文字提示气泡框
 * 使用公共样式系统，遵循 BEM 命名规范和 CSS 变量体系
 *
 * 使用方式：
 * ```typescript
 * import { Tooltip } from 'solely/components/commands';
 *
 * // 绑定到元素
 * const tooltip = Tooltip.bind(element, {
 *   content: '这是提示内容',
 *   placement: 'top'
 * });
 *
 * // 手动控制
 * tooltip.show();
 * tooltip.hide();
 * tooltip.destroy();
 * ```
 */

import type { TooltipOptions, TooltipInstance, TooltipConfig } from './types';
import {
    generateId,
    injectStyle,
    createElement,
    calculatePosition,
    addClosingAnimation,
    ANIMATION_DURATION,
} from '../utils';
import type { Placement } from '../utils';
import styles from './style.css?inline';

const STYLE_ID = 'solely-tooltip-styles';

const globalConfig: TooltipConfig = {
    placement: 'top',
    trigger: 'hover',
    duration: 3000,
};

interface TooltipInfo {
    id: number;
    element: HTMLElement;
    target: HTMLElement;
    destroy: () => void;
}

const tooltipList: TooltipInfo[] = [];
const boundTargets = new WeakSet<HTMLElement>();
let themeObserver: MutationObserver | null = null;

function ensureStylesInjected(): void {
    injectStyle(STYLE_ID, styles);
}

function observeTheme(element: HTMLElement): () => void {
    const updateTheme = () => {
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme) {
            element.setAttribute('data-theme', theme);
        } else {
            element.removeAttribute('data-theme');
        }
    };

    updateTheme();

    if (!themeObserver) {
        themeObserver = new MutationObserver(() => {
            tooltipList.forEach(t => {
                const theme = document.documentElement.getAttribute('data-theme');
                if (theme) {
                    t.element.setAttribute('data-theme', theme);
                } else {
                    t.element.removeAttribute('data-theme');
                }
            });
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
    }

    return () => {
        if (themeObserver && tooltipList.length === 0) {
            themeObserver.disconnect();
            themeObserver = null;
        }
    };
}

async function hideTooltipById(id: number, callback?: () => void): Promise<void> {
    const index = tooltipList.findIndex(t => t.id === id);
    if (index === -1) return;

    const tooltipInfo = tooltipList[index];
    const tooltip = tooltipInfo.element.querySelector('.tooltip') as HTMLElement;

    if (tooltip) {
        tooltip.classList.add('is-closing');
    }

    await addClosingAnimation(tooltipInfo.element, ANIMATION_DURATION.FAST);
    tooltipInfo.element.remove();
    tooltipList.splice(index, 1);
    callback?.();
}

async function hideAllTooltips(callback?: () => void): Promise<void> {
    if (tooltipList.length === 0) {
        callback?.();
        return;
    }

    await Promise.all(
        tooltipList.map(async tooltipInfo => {
            const tooltip = tooltipInfo.element.querySelector('.tooltip') as HTMLElement;
            if (tooltip) {
                tooltip.classList.add('is-closing');
            }
            await addClosingAnimation(tooltipInfo.element, ANIMATION_DURATION.FAST);
            tooltipInfo.element.remove();
        }),
    );

    tooltipList.length = 0;
    callback?.();
}

function showTooltip(target: HTMLElement, options: TooltipOptions): number {
    const id = generateId();

    ensureStylesInjected();

    const placement = (options.placement ?? globalConfig.placement) as Placement;

    // 创建 overlay 容器
    const overlay = createElement('div', { className: 'tooltip-overlay' });

    // 主题适配
    const cleanupTheme = observeTheme(overlay);

    const tooltip = createElement('div', {
        className: `tooltip tooltip--${placement}${options.className ? ` ${options.className}` : ''}`,
        styles: {
            ...(options.style as Partial<CSSStyleDeclaration>),
            ...(options.color ? { backgroundColor: options.color } : {}),
        },
    });

    const contentEl = createElement('div', {
        className: 'tooltip__content',
        textContent: options.content || '',
    });
    tooltip.appendChild(contentEl);

    // 创建箭头
    const arrow = createElement('div', { className: 'tooltip__arrow' });
    if (options.color) {
        arrow.style.backgroundColor = options.color;
    }
    tooltip.appendChild(arrow);

    overlay.appendChild(tooltip);
    document.body.appendChild(overlay);

    // 计算位置（在元素添加到 DOM 后计算，以获取实际尺寸）
    const position = calculatePosition(target, tooltip, placement);

    tooltip.style.top = `${position.top}px`;
    tooltip.style.left = `${position.left}px`;

    // 设置箭头位置
    if (position.arrowLeft !== undefined) {
        arrow.style.left = `${position.arrowLeft}px`;
    }
    if (position.arrowTop !== undefined) {
        arrow.style.top = `${position.arrowTop}px`;
    }

    const destroy = () => {
        cleanupTheme();
        hideTooltipById(id);
    };

    tooltipList.push({ id, element: overlay, target, destroy });

    options.onVisibleChange?.(true);

    return id;
}

function bind(target: HTMLElement, options: TooltipOptions): TooltipInstance {
    // 避免重复绑定到同一元素
    if (boundTargets.has(target)) {
        return { show: () => {}, hide: () => {}, destroy: () => {} };
    }

    boundTargets.add(target);

    const trigger = options.trigger ?? globalConfig.trigger;
    // 支持 visible 属性进行手动控制
    let visible = options.visible ?? options.defaultVisible ?? false;
    let currentTooltipId: number | null = null;

    const show = () => {
        if (visible) return;
        visible = true;
        currentTooltipId = showTooltip(target, options);
    };

    const hide = () => {
        if (!visible || currentTooltipId === null) return;
        visible = false;
        const id = currentTooltipId;
        currentTooltipId = null;
        hideTooltipById(id, () => {
            options.onVisibleChange?.(false);
        });
    };

    const destroy = () => {
        hide();
        boundTargets.delete(target);

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
        // manual 触发方式不需要移除事件监听
    };

    // 点击触发处理
    const handleClick = (e: MouseEvent) => {
        e.stopPropagation();
        if (visible) {
            hide();
        } else {
            show();
        }
    };

    // 点击外部关闭
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
        currentTooltipId = showTooltip(target, options);
    }

    return {
        show,
        hide,
        destroy,
    };
}

function showOnce(target: HTMLElement, options: TooltipOptions & { duration?: number }): void {
    const id = showTooltip(target, options);

    const duration = options.duration ?? globalConfig.duration;
    if (duration > 0) {
        setTimeout(() => {
            hideTooltipById(id);
        }, duration);
    }
}

function config(options: Partial<TooltipConfig>): void {
    Object.assign(globalConfig, options);
}

export const Tooltip = {
    bind,
    show: showOnce,
    hide: hideAllTooltips,
    config,
};

export default Tooltip;
