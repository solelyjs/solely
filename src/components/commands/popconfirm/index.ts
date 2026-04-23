/**
 * Solely Popconfirm 命令式组件
 * 气泡确认框，用于轻量级确认操作
 * 使用公共样式系统，遵循 BEM 命名规范和 CSS 变量体系
 *
 * 使用方式：
 * ```typescript
 * import { Popconfirm } from 'solely/components/commands';
 *
 * Popconfirm.show(target, {
 *   title: '确定删除吗？',
 *   onConfirm: () => {
 *     console.log('确认删除');
 *   },
 *   onCancel: () => {
 *     console.log('取消删除');
 *   },
 * });
 * ```
 */

import type { PopconfirmOptions, PopconfirmInstance, PopconfirmPlacement, PopconfirmConfig } from './types';
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

const STYLE_ID = 'solely-popconfirm-styles';

const globalConfig: PopconfirmConfig = {
    okText: '确定',
    cancelText: '取消',
    okType: 'primary',
    showCancel: true,
    placement: 'top',
};

let currentPopconfirm: {
    id: number;
    target: HTMLElement;
    element: HTMLElement;
    destroy: () => void;
} | null = null;

let themeObserver: MutationObserver | null = null;

const boundTargets = new WeakSet<HTMLElement>();

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
            if (currentPopconfirm) {
                const theme = document.documentElement.getAttribute('data-theme');
                if (theme) {
                    currentPopconfirm.element.setAttribute('data-theme', theme);
                } else {
                    currentPopconfirm.element.removeAttribute('data-theme');
                }
            }
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
    }

    return () => {
        if (themeObserver && !currentPopconfirm) {
            themeObserver.disconnect();
            themeObserver = null;
        }
    };
}

async function destroyCurrent(): Promise<void> {
    if (!currentPopconfirm) return;

    const { element } = currentPopconfirm;
    const popconfirm = element.querySelector('.popconfirm') as HTMLElement;

    if (popconfirm) {
        popconfirm.classList.add('is-closing');
    }

    await addClosingAnimation(element, ANIMATION_DURATION.FAST);
    element.remove();

    currentPopconfirm = null;
}

async function show(target: HTMLElement, options: PopconfirmOptions): Promise<PopconfirmInstance> {
    // 单例模式：如果当前显示的是同一个目标，则关闭；否则关闭旧的再打开新的
    if (currentPopconfirm && currentPopconfirm.target === target) {
        await destroyCurrent();
        return { destroy: () => {} };
    }

    // 关闭已存在的 Popconfirm
    await destroyCurrent();

    const id = generateId();

    ensureStylesInjected();

    const placement = (options.placement ?? globalConfig.placement) as Placement;
    const okType = options.okType ?? globalConfig.okType;
    const showCancel = options.showCancel ?? globalConfig.showCancel;

    const overlay = createElement('div', { className: 'popconfirm-overlay' });

    // 主题适配
    const cleanupTheme = observeTheme(overlay);

    const popconfirm = createElement('div', {
        className: `popconfirm popconfirm--${placement}${options.className ? ` ${options.className}` : ''}`,
        styles: options.style as Partial<CSSStyleDeclaration>,
    });

    const content = createElement('div', { className: 'popconfirm__content' });

    // 根据 showIcon 决定是否显示图标，默认为 true
    const showIcon = options.showIcon !== false;
    if (showIcon) {
        const icon = createElement('span', {
            className: 'popconfirm__icon',
            textContent: '⚠',
        });
        content.appendChild(icon);
    }

    const textWrapper = createElement('div', { className: 'popconfirm__text' });

    const title = createElement('div', {
        className: 'popconfirm__title',
    });

    // 支持字符串和 DOM 元素作为标题
    if (typeof options.title === 'string') {
        title.textContent = options.title;
    } else if (options.title instanceof HTMLElement) {
        title.appendChild(options.title.cloneNode(true));
    }

    textWrapper.appendChild(title);

    if (options.description) {
        const description = createElement('div', {
            className: 'popconfirm__description',
        });

        // 支持字符串和 DOM 元素作为描述
        if (typeof options.description === 'string') {
            description.textContent = options.description;
        } else if (options.description instanceof HTMLElement) {
            description.appendChild(options.description.cloneNode(true));
        }

        textWrapper.appendChild(description);
    }

    content.appendChild(textWrapper);

    const buttons = createElement('div', { className: 'popconfirm__buttons' });

    const handleConfirm = async () => {
        await destroyCurrent();
        options.onConfirm?.();
    };

    const handleCancel = async () => {
        await destroyCurrent();
        options.onCancel?.();
    };

    if (showCancel) {
        const cancelBtn = createElement('button', {
            className: 'popconfirm__btn popconfirm__btn--cancel',
            attrs: { type: 'button' },
        });

        // 支持字符串和 DOM 元素作为取消按钮文字
        const cancelText = options.cancelText ?? globalConfig.cancelText;
        if (typeof cancelText === 'string') {
            cancelBtn.textContent = cancelText;
        } else if (cancelText instanceof HTMLElement) {
            cancelBtn.appendChild(cancelText.cloneNode(true));
        }

        cancelBtn.onclick = handleCancel;
        buttons.appendChild(cancelBtn);
    }

    const okBtn = createElement('button', {
        className: `popconfirm__btn popconfirm__btn--ok${okType === 'danger' ? ' popconfirm__btn--danger' : ''}`,
        attrs: { type: 'button' },
    });

    // 支持字符串和 DOM 元素作为确认按钮文字
    const okText = options.okText ?? globalConfig.okText;
    if (typeof okText === 'string') {
        okBtn.textContent = okText;
    } else if (okText instanceof HTMLElement) {
        okBtn.appendChild(okText.cloneNode(true));
    }

    okBtn.onclick = handleConfirm;
    buttons.appendChild(okBtn);

    const arrow = createElement('div', { className: 'popconfirm__arrow' });

    popconfirm.appendChild(arrow);
    popconfirm.appendChild(content);
    popconfirm.appendChild(buttons);
    overlay.appendChild(popconfirm);
    document.body.appendChild(overlay);

    // 计算位置（在元素添加到 DOM 后计算，以获取实际尺寸）
    const position = calculatePosition(target, popconfirm, placement);

    popconfirm.style.top = `${position.top}px`;
    popconfirm.style.left = `${position.left}px`;

    if (position.arrowLeft !== undefined) {
        arrow.style.left = `${position.arrowLeft}px`;
    }
    if (position.arrowTop !== undefined) {
        arrow.style.top = `${position.arrowTop}px`;
    }

    // 事件处理器
    const handleOverlayClick = (e: MouseEvent) => {
        if (e.target === overlay) {
            handleCancel();
        }
    };

    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleCancel();
            document.removeEventListener('keydown', handleKeydown);
        }
    };

    overlay.addEventListener('click', handleOverlayClick);
    document.addEventListener('keydown', handleKeydown);

    const destroyFn = () => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.removeEventListener('click', handleOverlayClick);
        cleanupTheme();
        destroyCurrent();
    };

    currentPopconfirm = { id, target, element: overlay, destroy: destroyFn };

    return { destroy: destroyFn };
}

function bind(
    target: HTMLElement,
    options: Omit<PopconfirmOptions, 'placement'> & { placement?: PopconfirmPlacement },
): PopconfirmInstance {
    // 避免重复绑定到同一元素
    if (boundTargets.has(target)) {
        return { destroy: () => {} };
    }

    boundTargets.add(target);

    let instance: PopconfirmInstance | null = null;

    const handleClick = async (e: MouseEvent) => {
        e.stopPropagation();

        // 如果当前有 Popconfirm，则关闭；否则打开新的
        if (currentPopconfirm) {
            await destroyCurrent();
            instance = null;
        } else {
            instance = await show(target, options as PopconfirmOptions);
        }
    };

    // 点击外部关闭的逻辑
    const handleOutsideClick = async (e: MouseEvent) => {
        // 如果当前没有 Popconfirm，直接返回
        if (!currentPopconfirm) return;

        const targetElement = e.target as Node;
        const popconfirmElement = currentPopconfirm.element;

        // 如果点击的是 Popconfirm 内部，不关闭
        if (popconfirmElement.contains(targetElement)) return;

        // 如果点击的是绑定元素，不关闭（由 handleClick 处理）
        if (target.contains(targetElement)) return;

        // 否则关闭 Popconfirm
        await destroyCurrent();
        instance = null;
    };

    target.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleOutsideClick);

    return {
        destroy: () => {
            boundTargets.delete(target);
            target.removeEventListener('click', handleClick);
            document.removeEventListener('mousedown', handleOutsideClick);
            instance?.destroy();
            instance = null;
        },
    };
}

function config(options: Partial<PopconfirmConfig>): void {
    Object.assign(globalConfig, options);
}

export const Popconfirm = {
    show,
    bind,
    config,
    destroy: destroyCurrent,
};

export default Popconfirm;
