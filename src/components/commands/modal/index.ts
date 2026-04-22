/**
 * Solely Modal 命令式组件
 * 模态对话框，支持多种类型和自定义配置
 * 使用公共样式系统，遵循 BEM 命名规范和 CSS 变量体系
 *
 * 使用方式：
 * ```typescript
 * import { Modal } from 'solely/components/commands';
 *
 * // 确认对话框
 * Modal.confirm({
 *   title: '确认删除？',
 *   content: '删除后无法恢复',
 *   onOk: () => deleteItem()
 * });
 *
 * // 信息提示
 * Modal.info({ title: '提示', content: '操作成功' });
 *
 * // 成功提示
 * Modal.success({ title: '成功', content: '保存完成' });
 *
 * // 错误提示
 * Modal.error({ title: '错误', content: '操作失败' });
 *
 * // 警告提示
 * Modal.warning({ title: '警告', content: '请谨慎操作' });
 * ```
 */

import type { ModalOptions, ModalInstance, ModalConfig, ModalType, ModalButton } from './types';
import {
    generateId,
    injectStyle,
    createElement,
    addClosingAnimation,
    safeAsyncCallback,
    ANIMATION_DURATION,
} from '../utils';
import styles from './style.css?inline';

const STYLE_ID = 'solely-modal-styles';

const globalConfig: ModalConfig = {
    width: 520,
    mask: true,
    maskClosable: false,
    okText: '确定',
    cancelText: '取消',
};

interface ModalInfo {
    id: number;
    element: HTMLElement;
    instance: ModalInstance | null;
    cleanup?: () => void;
}

const modalList: ModalInfo[] = [];
const closingIds = new Set<number>();
let themeObserver: MutationObserver | null = null;

const ICON_MAP: Record<ModalType, string> = {
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
    error: '✕',
    confirm: '?',
};

function ensureStylesInjected(): void {
    injectStyle(STYLE_ID, styles);
}

function observeTheme(wrap: HTMLElement): () => void {
    const updateTheme = () => {
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme) {
            wrap.setAttribute('data-theme', theme);
        } else {
            wrap.removeAttribute('data-theme');
        }
    };

    updateTheme();

    if (!themeObserver) {
        themeObserver = new MutationObserver(() => {
            modalList.forEach(m => {
                const theme = document.documentElement.getAttribute('data-theme');
                if (theme) {
                    m.element.setAttribute('data-theme', theme);
                } else {
                    m.element.removeAttribute('data-theme');
                }
            });
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
    }

    return () => {
        if (themeObserver && modalList.length === 0) {
            themeObserver.disconnect();
            themeObserver = null;
        }
    };
}

async function closeModalById(id: number): Promise<void> {
    // 防止并发关闭同一个 Modal
    if (closingIds.has(id)) return;
    closingIds.add(id);

    try {
        const index = modalList.findIndex(m => m.id === id);
        if (index === -1) return;

        const modalInfo = modalList[index];
        const mask = modalInfo.element.querySelector('.modal-mask') as HTMLElement;
        const modal = modalInfo.element.querySelector('.modal') as HTMLElement;

        if (mask) mask.classList.add('is-closing');
        if (modal) modal.classList.add('is-closing');

        await addClosingAnimation(modalInfo.element, ANIMATION_DURATION.NORMAL);

        // 清理事件监听器
        modalInfo.cleanup?.();

        // 重新查找索引（动画期间可能发生变化）
        const currentIndex = modalList.findIndex(m => m.id === id);
        if (currentIndex !== -1) {
            modalList[currentIndex].element.remove();
            modalList.splice(currentIndex, 1);
        }
    } finally {
        closingIds.delete(id);
    }
}

async function closeTopModal(): Promise<void> {
    if (modalList.length === 0) return;
    const topModal = modalList[modalList.length - 1];
    await closeModalById(topModal.id);
}

function createButton(text: string, type: string, onClick: () => void | Promise<void>): HTMLButtonElement {
    const button = createElement('button', {
        className: `modal__btn modal__btn--${type === 'default' ? 'default' : type}`,
        textContent: text,
        attrs: { type: 'button' },
    }) as HTMLButtonElement;

    button.onclick = () => safeAsyncCallback(onClick);

    return button;
}

function open(options: ModalOptions): ModalInstance {
    const id = generateId();

    ensureStylesInjected();

    const type = options.type || 'info';
    const width = options.width ?? globalConfig.width;
    const showCancel = options.showCancel ?? type === 'confirm';
    const maskClosable = options.maskClosable ?? globalConfig.maskClosable;

    const wrap = createElement('div', {
        className: 'modal-wrap',
        attrs: { tabIndex: '-1' },
    });

    // 主题适配
    const cleanupTheme = observeTheme(wrap);

    // 存储需要清理的事件处理函数
    const handlersToCleanup: Array<{ element: HTMLElement; type: string; handler: EventListener }> = [];

    if (options.mask !== false) {
        const mask = createElement('div', { className: 'modal-mask' });
        if (maskClosable) {
            const handleMaskClick = () => {
                closeModalById(id);
                options.onCancel?.();
            };
            mask.onclick = handleMaskClick;
            handlersToCleanup.push({ element: mask, type: 'click', handler: handleMaskClick });
        }
        wrap.appendChild(mask);
    }

    const modal = createElement('div', {
        className: `modal${options.className ? ` ${options.className}` : ''}`,
        styles: {
            ...(options.style as Partial<CSSStyleDeclaration>),
            width: typeof width === 'number' ? `${width}px` : width,
        },
    });

    const header = createElement('div', { className: 'modal__header' });

    const title = createElement('h3', {
        className: 'modal__title',
        textContent: options.title || '',
    });
    header.appendChild(title);

    if (options.closable !== false) {
        const close = createElement('button', {
            className: 'modal__close',
            textContent: '×',
            attrs: { type: 'button', 'aria-label': '关闭' },
        });
        const handleCloseClick = () => {
            closeModalById(id);
            options.onClose?.();
        };
        close.onclick = handleCloseClick;
        handlersToCleanup.push({ element: close, type: 'click', handler: handleCloseClick });
        header.appendChild(close);
    }

    modal.appendChild(header);

    const body = createElement('div', { className: 'modal__body' });

    const contentWrapper = createElement('div', { className: 'modal__content-wrapper' });

    const icon = createElement('span', {
        className: `modal__icon modal__icon--${type}`,
        textContent: ICON_MAP[type],
    });
    contentWrapper.appendChild(icon);

    const content = createElement('div', {
        textContent: options.content || '',
    });
    contentWrapper.appendChild(content);

    body.appendChild(contentWrapper);
    modal.appendChild(body);

    const footer = createElement('div', { className: 'modal__footer' });

    if (options.buttons && options.buttons.length > 0) {
        options.buttons.forEach((buttonConfig: ModalButton) => {
            const btn = createButton(buttonConfig.text, buttonConfig.type || 'default', async () => {
                await safeAsyncCallback(() => buttonConfig.onClick());
            });
            if (buttonConfig.style) {
                Object.assign(btn.style, buttonConfig.style);
            }
            footer.appendChild(btn);
        });
    } else {
        if (showCancel) {
            const cancelBtn = createButton(options.cancelText || globalConfig.cancelText, 'default', () => {
                closeModalById(id);
                options.onCancel?.();
            });
            footer.appendChild(cancelBtn);
        }

        const okBtn = createButton(options.okText || globalConfig.okText, options.okType || 'primary', async () => {
            if (options.onOk) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const result = await safeAsyncCallback(() => options.onOk!());
                // 只有当回调不返回 false 时才关闭对话框
                if ((result as unknown as false | undefined) === false) {
                    return; // 不关闭对话框
                }
            }
            closeModalById(id);
        });
        footer.appendChild(okBtn);
    }

    modal.appendChild(footer);
    wrap.appendChild(modal);

    document.body.appendChild(wrap);

    // 创建清理函数
    const cleanup = () => {
        handlersToCleanup.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        cleanupTheme();
    };

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    modalList.push({ id, element: wrap, instance: null!, cleanup });

    const instance: ModalInstance = {
        close: () => {
            closeModalById(id);
            options.onClose?.();
        },
        update: (newOptions: Partial<ModalOptions>) => {
            // 更新标题
            if (newOptions.title !== undefined) {
                const titleEl = wrap.querySelector('.modal__title') as HTMLElement;
                if (titleEl) titleEl.textContent = newOptions.title;
            }

            // 更新内容
            if (newOptions.content !== undefined) {
                const contentEl = wrap.querySelector('.modal__content') as HTMLElement;
                if (contentEl) contentEl.textContent = newOptions.content;
            }

            // 更新宽度
            if (newOptions.width !== undefined) {
                const modalEl = wrap.querySelector('.modal') as HTMLElement;
                if (modalEl) {
                    modalEl.style.width =
                        typeof newOptions.width === 'number' ? `${newOptions.width}px` : newOptions.width;
                }
            }

            // 更新类名
            if (newOptions.className !== undefined) {
                const modalEl = wrap.querySelector('.modal') as HTMLElement;
                if (modalEl) {
                    // 保留基础类名 'modal'，替换其余类名
                    modalEl.className = `modal ${newOptions.className}`.trim();
                }
            }

            // 更新样式
            if (newOptions.style !== undefined) {
                const modalEl = wrap.querySelector('.modal') as HTMLElement;
                if (modalEl) {
                    Object.assign(modalEl.style, newOptions.style);
                }
            }
        },
    };

    const modalInfo = modalList.find(m => m.id === id);
    if (modalInfo) {
        modalInfo.instance = instance;
    }

    return instance;
}

function confirm(options: Omit<ModalOptions, 'type'>): ModalInstance {
    return open({ ...options, type: 'confirm', showCancel: true });
}

function info(options: Omit<ModalOptions, 'type'>): ModalInstance {
    return open({ ...options, type: 'info' });
}

function success(options: Omit<ModalOptions, 'type'>): ModalInstance {
    return open({ ...options, type: 'success' });
}

function error(options: Omit<ModalOptions, 'type'>): ModalInstance {
    return open({ ...options, type: 'error' });
}

function warning(options: Omit<ModalOptions, 'type'>): ModalInstance {
    return open({ ...options, type: 'warning' });
}

function config(options: Partial<ModalConfig>): void {
    Object.assign(globalConfig, options);
}

async function destroy(): Promise<void> {
    while (modalList.length > 0) {
        await closeTopModal();
    }
}

export const Modal = {
    open,
    confirm,
    info,
    success,
    error,
    warning,
    config,
    destroy,
};

export default Modal;
