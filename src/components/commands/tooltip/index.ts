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
import { generateId, injectStyle, createElement } from '../utils';
import type { Placement } from '../utils';
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
    element: HTMLElement;
    target: HTMLElement;
    placement: Placement;
    scrollParents: HTMLElement[];
}

const tooltipList: TooltipInfo[] = [];
const boundTargets = new WeakSet<HTMLElement>();
let themeObserver: MutationObserver | null = null;

function ensureStylesInjected(): void {
    injectStyle(STYLE_ID, styles);
}

function getScrollParents(element: HTMLElement): HTMLElement[] {
    const parents: HTMLElement[] = [];
    let el: Element | null = element.parentElement;

    while (el && el !== document.body) {
        const style = getComputedStyle(el);
        if (
            style.overflow === 'auto' ||
            style.overflow === 'scroll' ||
            style.overflowY === 'auto' ||
            style.overflowY === 'scroll'
        ) {
            parents.push(el as HTMLElement);
        }
        el = el.parentElement;
    }

    return parents;
}

function calcPosition(target: HTMLElement, popupElement: HTMLElement, placement: Placement, gap: number = 8) {
    const rect = target.getBoundingClientRect();
    const w = popupElement.offsetWidth || 250;
    const h = popupElement.offsetHeight || 100;
    const pad = 8;

    let top = 0;
    let left = 0;
    let arrowLeft: number | undefined;
    let arrowTop: number | undefined;

    switch (placement) {
        case 'top':
            top = rect.top - h - gap;
            left = rect.left + (rect.width - w) / 2;
            arrowLeft = w / 2 - 4;
            break;
        case 'topLeft':
            top = rect.top - h - gap;
            left = rect.left;
            arrowLeft = 16;
            break;
        case 'topRight':
            top = rect.top - h - gap;
            left = rect.right - w;
            arrowLeft = w - 24;
            break;
        case 'bottom':
            top = rect.bottom + gap;
            left = rect.left + (rect.width - w) / 2;
            arrowLeft = w / 2 - 4;
            break;
        case 'bottomLeft':
            top = rect.bottom + gap;
            left = rect.left;
            arrowLeft = 16;
            break;
        case 'bottomRight':
            top = rect.bottom + gap;
            left = rect.right - w;
            arrowLeft = w - 24;
            break;
        case 'left':
            top = rect.top + (rect.height - h) / 2;
            left = rect.left - w - gap;
            arrowTop = h / 2 - 4;
            break;
        case 'leftTop':
            top = rect.top;
            left = rect.left - w - gap;
            arrowTop = 16;
            break;
        case 'leftBottom':
            top = rect.bottom - h;
            left = rect.left - w - gap;
            arrowTop = h - 24;
            break;
        case 'right':
            top = rect.top + (rect.height - h) / 2;
            left = rect.right + gap;
            arrowTop = h / 2 - 4;
            break;
        case 'rightTop':
            top = rect.top;
            left = rect.right + gap;
            arrowTop = 16;
            break;
        case 'rightBottom':
            top = rect.bottom - h;
            left = rect.right + gap;
            arrowTop = h - 24;
            break;
    }

    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));

    return { top, left, arrowLeft, arrowTop };
}

function repositionAllTooltips(): void {
    tooltipList.forEach(info => {
        const el = info.element;
        if (!el || !info.target) return;
        const arrow = el.querySelector('.solely-tooltip__arrow') as HTMLElement;
        const pos = calcPosition(info.target, el, info.placement);
        el.style.top = `${pos.top}px`;
        el.style.left = `${pos.left}px`;
        if (arrow) {
            if (pos.arrowLeft !== undefined) {
                arrow.style.left = `${pos.arrowLeft}px`;
                arrow.style.top = '';
            }
            if (pos.arrowTop !== undefined) {
                arrow.style.top = `${pos.arrowTop}px`;
                arrow.style.left = '';
            }
        }
    });
}

let repositionRAF: number | null = null;
let scrollListenersActive = false;

function scheduleReposition(): void {
    if (repositionRAF) return;
    repositionRAF = requestAnimationFrame(() => {
        repositionRAF = null;
        repositionAllTooltips();
    });
}

function bindScrollListeners(): void {
    if (scrollListenersActive || tooltipList.length === 0) return;
    scrollListenersActive = true;
    window.addEventListener('resize', scheduleReposition);
}

function unbindScrollListeners(): void {
    if (!scrollListenersActive) return;
    scrollListenersActive = false;
    window.removeEventListener('resize', scheduleReposition);
    if (repositionRAF) {
        cancelAnimationFrame(repositionRAF);
        repositionRAF = null;
    }
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
            const theme = document.documentElement.getAttribute('data-theme');
            tooltipList.forEach(t => {
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

    const info = tooltipList[index];

    info.element.classList.add('is-closing');
    info.element.remove();

    info.scrollParents.forEach(p => p.removeEventListener('scroll', scheduleReposition));
    tooltipList.splice(index, 1);

    if (tooltipList.length === 0) unbindScrollListeners();
    callback?.();
}

async function hideAllTooltips(callback?: () => void): Promise<void> {
    hideAllTooltipsSync();
    callback?.();
}

function hideAllTooltipsSync(): void {
    if (tooltipList.length === 0) return;

    const allScrollParents = new Set<HTMLElement>();
    tooltipList.forEach(info => {
        info.scrollParents.forEach(p => allScrollParents.add(p));
        info.element.classList.add('is-closing');
        info.element.remove();
    });

    allScrollParents.forEach(p => p.removeEventListener('scroll', scheduleReposition));
    tooltipList.length = 0;
    unbindScrollListeners();
}

function showTooltip(target: HTMLElement, options: TooltipOptions): number {
    const id = generateId();
    ensureStylesInjected();

    const placement = (options.placement ?? globalConfig.placement) as Placement;

    const existingIndex = tooltipList.findIndex(t => t.target === target);
    if (existingIndex !== -1) {
        const existing = tooltipList[existingIndex];
        existing.element.remove();
        existing.scrollParents.forEach(p => p.removeEventListener('scroll', scheduleReposition));
        tooltipList.splice(existingIndex, 1);
    }

    if (globalConfig.singleton && tooltipList.length > 0) {
        hideAllTooltipsSync();
    }

    const tooltip = createElement('div', {
        className: `solely-tooltip solely-tooltip--${placement}${options.className ? ` ${options.className}` : ''}`,
        styles: {
            ...(options.style as Partial<CSSStyleDeclaration>),
            ...(options.color ? { backgroundColor: options.color } : {}),
        },
    });

    observeTheme(tooltip);

    const contentEl = createElement('div', { className: 'solely-tooltip__content' });

    if (options.content) {
        if (typeof options.content === 'string') {
            contentEl.textContent = options.content;
        } else if (options.content instanceof HTMLElement) {
            contentEl.appendChild(options.content.cloneNode(true));
        }
    }

    tooltip.appendChild(contentEl);

    const arrow = createElement('div', { className: 'solely-tooltip__arrow' });
    if (options.color) {
        arrow.style.backgroundColor = options.color;
    }
    tooltip.appendChild(arrow);

    document.body.appendChild(tooltip);

    requestAnimationFrame(() => {
        const pos = calcPosition(target, tooltip, placement);

        tooltip.style.top = `${pos.top}px`;
        tooltip.style.left = `${pos.left}px`;

        if (pos.arrowLeft !== undefined) {
            arrow.style.left = `${pos.arrowLeft}px`;
        }
        if (pos.arrowTop !== undefined) {
            arrow.style.top = `${pos.arrowTop}px`;
        }
    });

    const scrollParents = getScrollParents(target);
    scrollParents.forEach(p => p.addEventListener('scroll', scheduleReposition));

    bindScrollListeners();

    tooltipList.push({ id, element: tooltip, target, placement, scrollParents });

    options.onVisibleChange?.(true);

    return id;
}

function bind(target: HTMLElement, options: TooltipOptions): TooltipInstance {
    if (boundTargets.has(target)) {
        return { show: () => {}, hide: () => {}, destroy: () => {} };
    }

    boundTargets.add(target);

    const trigger = options.trigger ?? globalConfig.trigger;
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
        currentTooltipId = showTooltip(target, options);
    }

    return { show, hide, destroy };
}

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
    bind,
    show: showOnce,
    hide: hideAllTooltips,
    config,
};

export default Tooltip;
