/**
 * Solely Popconfirm 命令式组件
 * 气泡确认框，用于轻量级确认操作
 * 使用公共样式系统，遵循 BEM 命名规范和 CSS 变量体系
 *
 * 使用方式：
 * ```typescript
 * import { Popconfirm } from 'solely/components/commands';
 *
 * const instance = Popconfirm.show(target, {
 *   title: '确定删除吗？',
 *   onConfirm: () => console.log('确认'),
 *   onCancel: () => console.log('取消'),
 * });
 * instance.close();   // 关闭（带动画）
 * instance.destroy(); // 销毁（立即）
 * ```
 */

import type {
    PopconfirmOptions,
    PopconfirmInstance,
    PopconfirmResult,
    PopconfirmPlacement,
    PopconfirmConfig,
} from './types';
import {
    generateId,
    injectStyle,
    createElement,
    calculatePosition,
    addClosingAnimation,
    observeTheme,
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
    cleanup: () => void;
} | null = null;

const boundTargets = new WeakSet<HTMLElement>();

function ensureStylesInjected(): void {
    injectStyle(STYLE_ID, styles);
}

/** 立即移除当前 Popconfirm（无动画） */
function destroyCurrentSync(): void {
    if (!currentPopconfirm) return;
    currentPopconfirm.cleanup();
    currentPopconfirm.element.remove();
    currentPopconfirm = null;
}

/** 带动画关闭当前 Popconfirm（fire-and-forget） */
function closeCurrentAnimated(): void {
    if (!currentPopconfirm) return;
    const { element, cleanup } = currentPopconfirm;
    const popconfirm = element.querySelector('.solely-popconfirm') as HTMLElement;
    if (popconfirm) {
        popconfirm.classList.add('is-closing');
    }
    currentPopconfirm = null;
    addClosingAnimation(element, ANIMATION_DURATION.FAST).then(() => {
        cleanup();
        element.remove();
    });
}

function appendContent(parent: HTMLElement, content: string | HTMLElement | undefined, shouldClone: boolean): void {
    if (content === undefined) return;
    if (typeof content === 'string') {
        parent.textContent = content;
    } else if (content instanceof HTMLElement) {
        parent.appendChild(shouldClone ? content.cloneNode(true) : content);
    }
}

/**
 * 将 PopconfirmInstance 包装为 thenable，兼容历史版本中 show 返回 Promise 的用法。
 * - 同步使用：`const inst = Popconfirm.show(...); inst.close();`
 * - await：`const inst = await Popconfirm.show(...)`
 * - .then()：`Popconfirm.show(...).then(inst => ...)`
 */
function toResult(instance: PopconfirmInstance): PopconfirmResult {
    return {
        ...instance,
        then<T>(resolve: (instance: PopconfirmInstance) => T | PromiseLike<T>): PromiseLike<T> {
            return Promise.resolve(resolve(instance));
        },
    };
}

function show(target: HTMLElement, options: PopconfirmOptions): PopconfirmResult {
    // 单例模式：如果当前显示的是同一个目标，则关闭
    if (currentPopconfirm && currentPopconfirm.target === target) {
        destroyCurrentSync();
        return toResult({ close: () => {}, destroy: () => {} });
    }

    // 关闭已存在的 Popconfirm（同步，无动画）
    destroyCurrentSync();

    const id = generateId();
    ensureStylesInjected();

    const placement = (options.placement ?? globalConfig.placement) as Placement;
    const okType = options.okType ?? globalConfig.okType;
    const showCancel = options.showCancel ?? globalConfig.showCancel;
    const shouldClone = options.cloneElement ?? true;

    const overlay = createElement('div', { className: 'solely-popconfirm-overlay' });

    // 主题适配（使用共享观察者）
    const cleanupTheme = observeTheme(() => overlay);

    const popconfirm = createElement('div', {
        className: `solely-popconfirm solely-popconfirm--${placement}${options.className ? ` ${options.className}` : ''}`,
        styles: options.style as Partial<CSSStyleDeclaration>,
    });

    const content = createElement('div', { className: 'solely-popconfirm__content' });

    // 根据 showIcon 决定是否显示图标，默认为 true
    const showIcon = options.showIcon !== false;
    if (showIcon) {
        const icon = createElement('span', {
            className: 'solely-popconfirm__icon',
            textContent: '⚠',
        });
        content.appendChild(icon);
    }

    const textWrapper = createElement('div', { className: 'solely-popconfirm__text' });

    const title = createElement('div', { className: 'solely-popconfirm__title' });
    appendContent(title, options.title, shouldClone);
    textWrapper.appendChild(title);

    if (options.description) {
        const description = createElement('div', { className: 'solely-popconfirm__description' });
        appendContent(description, options.description, shouldClone);
        textWrapper.appendChild(description);
    }

    content.appendChild(textWrapper);

    const buttons = createElement('div', { className: 'solely-popconfirm__buttons' });

    const handleConfirm = () => {
        closeCurrentAnimated();
        options.onConfirm?.();
    };

    const handleCancel = () => {
        closeCurrentAnimated();
        options.onCancel?.();
    };

    if (showCancel) {
        const cancelBtn = createElement('button', {
            className: 'solely-popconfirm__btn solely-popconfirm__btn--cancel',
            attrs: { type: 'button' },
        });
        appendContent(cancelBtn, options.cancelText ?? globalConfig.cancelText, shouldClone);
        cancelBtn.onclick = handleCancel;
        buttons.appendChild(cancelBtn);
    }

    const okBtn = createElement('button', {
        className: `solely-popconfirm__btn solely-popconfirm__btn--ok${okType === 'danger' ? ' solely-popconfirm__btn--danger' : ''}`,
        attrs: { type: 'button' },
    });
    appendContent(okBtn, options.okText ?? globalConfig.okText, shouldClone);
    okBtn.onclick = handleConfirm;
    buttons.appendChild(okBtn);

    const arrow = createElement('div', { className: 'solely-popconfirm__arrow' });

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

    const cleanup = () => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.removeEventListener('click', handleOverlayClick);
        cleanupTheme();
    };

    currentPopconfirm = { id, target, element: overlay, cleanup };

    const close = () => {
        if (!currentPopconfirm || currentPopconfirm.element !== overlay) return;
        cleanup();
        closeCurrentAnimated();
    };

    const destroy = () => {
        if (!currentPopconfirm || currentPopconfirm.element !== overlay) return;
        cleanup();
        closeCurrentAnimated();
    };

    return toResult({ close, destroy });
}

function bind(
    target: HTMLElement,
    options: Omit<PopconfirmOptions, 'placement'> & { placement?: PopconfirmPlacement },
): PopconfirmInstance {
    // 避免重复绑定到同一元素
    if (boundTargets.has(target)) {
        return { close: () => {}, destroy: () => {} };
    }

    boundTargets.add(target);

    let instance: PopconfirmInstance | null = null;

    const handleClick = (e: MouseEvent) => {
        e.stopPropagation();

        // 如果当前有 Popconfirm，则关闭；否则打开新的
        if (currentPopconfirm) {
            destroyCurrentSync();
            instance = null;
        } else {
            instance = show(target, options as PopconfirmOptions);
        }
    };

    // 点击外部关闭的逻辑
    const handleOutsideClick = (e: MouseEvent) => {
        if (!currentPopconfirm) return;

        const targetElement = e.target as Node;
        const popconfirmElement = currentPopconfirm.element;

        // 如果点击的是 Popconfirm 内部，不关闭
        if (popconfirmElement.contains(targetElement)) return;

        // 如果点击的是绑定元素，不关闭（由 handleClick 处理）
        if (target.contains(targetElement)) return;

        // 否则关闭 Popconfirm
        destroyCurrentSync();
        instance = null;
    };

    target.addEventListener('click', handleClick);
    document.addEventListener('mousedown', handleOutsideClick);

    return {
        close: () => {
            instance?.close();
            instance = null;
        },
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
    destroy: () => {
        closeCurrentAnimated();
    },
};

export default Popconfirm;
