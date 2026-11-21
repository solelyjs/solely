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
 * instance.destroy(); // 销毁（立即移除）
 * ```
 */

import type {
    PopconfirmOptions,
    PopconfirmInstance,
    PopconfirmResult,
    PopconfirmPlacement,
    PopconfirmConfig,
} from './types';
import { generateId, injectStyle, createElement, observeTheme, safeAsyncCallback, ANIMATION_DURATION } from '../utils';
import { computePosition, observePosition } from '../../../shared/floating/position';
import { registerOverlay, type OverlayHandle } from '../../../shared/floating/overlay-stack';
import type { Placement } from '../../../shared/floating/types';
import { oneOf, PLACEMENTS } from '../../../shared/enum';
import { createStatusIcon } from '../../../shared/icons';
import styles from './style.css?inline';

const STYLE_ID = 'solely-popconfirm-styles';

const globalConfig: PopconfirmConfig = {
    okText: '确定',
    cancelText: '取消',
    okType: 'primary',
    showCancel: true,
    placement: 'top',
};

interface PopconfirmEntry {
    id: number;
    target: HTMLElement;
    element: HTMLElement;
    cleanup: () => void;
    overlay: OverlayHandle;
    stopObserve: () => void;
    /** 关闭时还原触发元素的 aria-haspopup / aria-expanded */
    restoreTriggerAria: () => void;
}

let currentPopconfirm: PopconfirmEntry | null = null;

const boundTargets = new WeakSet<HTMLElement>();

/** 关闭动画进行中的浮层、定时器与基座句柄，供 destroy() 同步取消 */
const closingPopconfirms = new Map<
    HTMLElement,
    { timer: ReturnType<typeof setTimeout>; overlay: OverlayHandle; stopObserve: () => void }
>();

function ensureStylesInjected(): void {
    injectStyle(STYLE_ID, styles);
}

/** 立即移除当前 Popconfirm（无动画） */
function destroyCurrentSync(): void {
    if (!currentPopconfirm) return;
    const { element, cleanup, overlay, stopObserve, restoreTriggerAria } = currentPopconfirm;
    currentPopconfirm = null;
    restoreTriggerAria();
    cleanup();
    stopObserve();
    element.remove();
    // 出栈 + 释放：由基座按“焦点是否仍在浮层内”判断是否还原
    overlay.deactivate();
    overlay.dispose();
}

/** 带动画关闭当前 Popconfirm（fire-and-forget） */
function closeCurrentAnimated(): void {
    if (!currentPopconfirm) return;
    const { element, cleanup, overlay, stopObserve, restoreTriggerAria } = currentPopconfirm;
    const popconfirm = element.querySelector('.solely-popconfirm') as HTMLElement;
    currentPopconfirm = null;
    // 关闭开始即复位触发元素的展开态
    restoreTriggerAria();
    // 关闭开始：出栈，停止 Esc / 外部观察；焦点在动画结束后由基座还原
    overlay.deactivate();
    stopObserve();
    // 动画期间即解除事件监听，避免重复触发
    cleanup();
    if (popconfirm) {
        popconfirm.classList.add('is-closing');
    }
    const timer = setTimeout(() => {
        closingPopconfirms.delete(element);
        element.remove();
        overlay.dispose();
    }, ANIMATION_DURATION.FAST);
    closingPopconfirms.set(element, { timer, overlay, stopObserve });
}

function appendContent(parent: HTMLElement, content: string | HTMLElement | undefined, shouldClone: boolean): void {
    if (content === undefined) return;
    if (typeof content === 'string') {
        parent.textContent = content;
    } else if (content instanceof HTMLElement) {
        parent.appendChild(shouldClone ? content.cloneNode(true) : content);
    }
}

/** 异步确认 reject 时用于气泡内失败文案 */
function resolveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return `操作失败：${error.message}`;
    if (typeof error === 'string' && error) return `操作失败：${error}`;
    return '操作失败，请重试';
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

    const placement: Placement = oneOf(options.placement ?? globalConfig.placement, PLACEMENTS, 'top');
    const okType = oneOf(options.okType ?? globalConfig.okType, ['primary', 'danger', 'default'], 'primary');
    const showCancel = options.showCancel ?? globalConfig.showCancel;
    const shouldClone = options.cloneElement ?? true;
    const titleId = `solely-popconfirm-title-${id}`;
    const descriptionId = `solely-popconfirm-description-${id}`;

    const overlay = createElement('div', { className: 'solely-popconfirm-overlay' });

    // 主题适配（使用共享观察者）
    const cleanupTheme = observeTheme(() => overlay);

    const popconfirmClassName = [`solely-popconfirm solely-popconfirm--${placement}`, options.className]
        .filter(Boolean)
        .join(' ');

    const hasTitle = options.title !== undefined && options.title !== '';
    const hasDescription = options.description !== undefined && options.description !== '';

    // 保证对话框始终有可访问名称：标题 > 描述 > 兜底文案
    const ariaAttrs: Record<string, string> = {};
    if (hasTitle) {
        ariaAttrs['aria-labelledby'] = titleId;
        if (hasDescription) {
            ariaAttrs['aria-describedby'] = descriptionId;
        }
    } else if (hasDescription) {
        ariaAttrs['aria-labelledby'] = descriptionId;
    } else {
        ariaAttrs['aria-label'] = '确认操作';
    }

    const popconfirm = createElement('div', {
        className: popconfirmClassName,
        attrs: {
            role: 'dialog',
            tabindex: '-1',
            ...ariaAttrs,
        },
        styles: options.style as Partial<CSSStyleDeclaration>,
    });

    const content = createElement('div', { className: 'solely-popconfirm__content' });

    // 根据 showIcon 决定是否显示图标，默认为 true
    // icon="" 明确表示不要图标；showIcon=false 优先级最高
    const showIcon = options.showIcon !== false;
    const iconSource = options.icon ?? (() => createStatusIcon('warning'));
    if (showIcon && iconSource !== '') {
        const icon = createElement('span', { className: 'solely-popconfirm__icon' });
        if (typeof iconSource === 'string') {
            icon.textContent = iconSource;
        } else if (typeof iconSource === 'function') {
            icon.appendChild(iconSource());
        } else if (iconSource instanceof Element) {
            icon.appendChild(iconSource.cloneNode(true));
        }
        content.appendChild(icon);
    }

    const textWrapper = createElement('div', { className: 'solely-popconfirm__text' });

    const title = createElement('div', {
        className: 'solely-popconfirm__title',
        attrs: { id: titleId },
    });
    appendContent(title, options.title, shouldClone);
    textWrapper.appendChild(title);

    if (options.description) {
        const description = createElement('div', {
            className: 'solely-popconfirm__description',
            attrs: { id: descriptionId },
        });
        appendContent(description, options.description, shouldClone);
        textWrapper.appendChild(description);
    }

    // 异步确认失败时展示于气泡内，保持浮层打开
    const errorEl = createElement('div', {
        className: 'solely-popconfirm__error',
        attrs: { role: 'alert' },
    });
    errorEl.hidden = true;
    textWrapper.appendChild(errorEl);

    content.appendChild(textWrapper);

    const buttons = createElement('div', { className: 'solely-popconfirm__buttons' });

    let pending = false;
    let okBtn: HTMLButtonElement | null = null;
    let cancelBtn: HTMLButtonElement | null = null;

    /** pending 期间禁用交互，避免连点重复触发 */
    const setPending = (value: boolean): void => {
        pending = value;
        if (okBtn) {
            okBtn.disabled = value;
            okBtn.setAttribute('aria-busy', value ? 'true' : 'false');
            okBtn.classList.toggle('is-loading', value);
        }
        if (cancelBtn) {
            cancelBtn.disabled = value;
        }
    };

    const clearError = (): void => {
        errorEl.hidden = true;
        errorEl.textContent = '';
        popconfirm.classList.remove('solely-popconfirm--error');
    };

    /** reject 时保持打开并暴露失败态 */
    const showError = (message: string): void => {
        errorEl.textContent = message;
        errorEl.hidden = false;
        popconfirm.classList.add('solely-popconfirm--error');
    };

    const handleConfirm = (): void => {
        if (pending) return;

        let result: unknown;
        try {
            result = options.onConfirm?.();
        } catch (error) {
            // 同步异常沿用旧行为：记录错误并完成关闭
            console.error('[Solely Commands] Async callback error:', error);
            closeCurrentAnimated();
            return;
        }

        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
            clearError();
            setPending(true);
            (result as PromiseLike<unknown>).then(
                () => {
                    setPending(false);
                    // 期间若已切换到别的气泡，不能再关闭当前实例
                    if (currentPopconfirm?.element === overlay) closeCurrentAnimated();
                },
                (error: unknown) => {
                    setPending(false);
                    showError(resolveErrorMessage(error));
                },
            );
            return;
        }

        // 同步回调：保持旧行为，立即带动画关闭
        closeCurrentAnimated();
    };

    const handleCancel = (): void => {
        if (pending) return;
        closeCurrentAnimated();
        void safeAsyncCallback(() => options.onCancel?.());
    };

    if (showCancel) {
        cancelBtn = createElement('button', {
            className: 'solely-popconfirm__btn solely-popconfirm__btn--cancel',
            attrs: { type: 'button' },
        });
        appendContent(cancelBtn, options.cancelText ?? globalConfig.cancelText, shouldClone);
        cancelBtn.onclick = handleCancel;
        buttons.appendChild(cancelBtn);
    }

    const okBtnClassName = [
        'solely-popconfirm__btn solely-popconfirm__btn--ok',
        okType === 'danger' ? 'solely-popconfirm__btn--danger' : '',
        okType === 'default' ? 'solely-popconfirm__btn--default' : '',
    ]
        .filter(Boolean)
        .join(' ');

    okBtn = createElement('button', {
        className: okBtnClassName,
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

    // 使用浮层基座的纯函数定位（fixed：不受祖先 overflow 裁剪）
    const positionFloating = () => {
        const targetRect = target.getBoundingClientRect();
        const floatingRect = popconfirm.getBoundingClientRect();
        const result = computePosition(
            targetRect,
            {
                // 入场动画带 transform: scale(...)，getBoundingClientRect() 会返回缩放后的尺寸；
                // 定位必须用布局尺寸，否则首次 flip/shift 按偏小的尺寸钳制，滚动后才修正。
                width: popconfirm.offsetWidth || floatingRect.width,
                height: popconfirm.offsetHeight || floatingRect.height,
            },
            {
                placement,
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

        // 翻转后同步方位类，保证箭头贴边方向正确
        popconfirm.className = ['solely-popconfirm', `solely-popconfirm--${result.placement}`, options.className]
            .filter(Boolean)
            .join(' ');

        popconfirm.style.position = 'fixed';
        popconfirm.style.top = `${result.top}px`;
        popconfirm.style.left = `${result.left}px`;
        popconfirm.style.bottom = 'auto';
        popconfirm.style.right = 'auto';

        // 清空内联方位（'' 而非 'auto'）：'auto' 会覆盖 CSS 方位类里的 top / left 定位，
        // 导致 flip 到 bottom / right 时箭头消失或错位。交叉轴坐标仍由 computePosition 提供。
        arrow.style.top = '';
        arrow.style.left = '';
        if (result.arrow.x !== undefined) arrow.style.left = `${result.arrow.x}px`;
        if (result.arrow.y !== undefined) arrow.style.top = `${result.arrow.y}px`;
    };

    positionFloating();

    // 事件处理器
    const handleOverlayClick = (e: MouseEvent) => {
        if (e.target === overlay) {
            handleCancel();
        }
    };

    overlay.addEventListener('click', handleOverlayClick);

    const cleanup = () => {
        overlay.removeEventListener('click', handleOverlayClick);
        cleanupTheme();
    };

    // 注册浮层：z-index / Esc / 焦点进入与还原统一由基座管理
    const overlayHandle = registerOverlay({
        kind: 'popover',
        container: overlay,
        trigger: target,
        escClosable: true,
        trapFocus: false,
        lockScroll: false,
        inertBackground: false,
        autoFocus: true,
        initialFocus: popconfirm,
        returnFocus: true,
        onEscape: handleCancel,
    });
    overlayHandle.activate();

    // 锚点/浮层尺寸变化时复用基座的重定位订阅
    const stopObserve = observePosition({
        anchor: target,
        floating: popconfirm,
        update: positionFloating,
        onAnchorLost: () => {
            if (currentPopconfirm?.element === overlay) destroyCurrentSync();
        },
    });

    // 触发元素语义：声明为弹层并同步展开态，关闭时精确还原
    const previousHaspopup = target.getAttribute('aria-haspopup');
    const previousExpanded = target.getAttribute('aria-expanded');
    target.setAttribute('aria-haspopup', 'dialog');
    target.setAttribute('aria-expanded', 'true');
    const restoreTriggerAria = () => {
        if (previousHaspopup === null) target.removeAttribute('aria-haspopup');
        else target.setAttribute('aria-haspopup', previousHaspopup);
        if (previousExpanded === null) target.removeAttribute('aria-expanded');
        else target.setAttribute('aria-expanded', previousExpanded);
    };

    currentPopconfirm = {
        id,
        target,
        element: overlay,
        cleanup,
        overlay: overlayHandle,
        stopObserve,
        restoreTriggerAria,
    };

    const close = () => {
        if (!currentPopconfirm || currentPopconfirm.element !== overlay) return;
        closeCurrentAnimated();
    };

    const destroy = () => {
        if (currentPopconfirm && currentPopconfirm.element === overlay) {
            destroyCurrentSync();
            return;
        }
        // 关闭动画仍在进行：同步取消定时器并立即移除
        const pending = closingPopconfirms.get(overlay);
        if (pending) {
            clearTimeout(pending.timer);
            closingPopconfirms.delete(overlay);
            pending.stopObserve();
            overlay.remove();
            pending.overlay.dispose();
        }
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

        if (currentPopconfirm) {
            // 同一目标：再次激活等价切换关闭；不同目标：关闭旧的并直接打开新的
            // （键盘 Enter/Space 不会先触发 mousedown，不能依赖外部点击关闭逻辑）
            const sameTarget = currentPopconfirm.target === target;
            destroyCurrentSync();
            instance = null;
            if (!sameTarget) instance = show(target, options as PopconfirmOptions);
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
