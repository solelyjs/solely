import type { MessageOptions, MessageInstance, MessageConfig, MessageType } from './types';
import { generateId, injectStyle, createElement, addClosingAnimation, ANIMATION_DURATION } from '../utils'; // 路径按实际调整
import styles from './style.css?inline';

const STYLE_ID = 'solely-message-styles';

const globalConfig: MessageConfig = {
    duration: 3000,
    maxCount: 5,
    gap: 8,
    top: 24,
};

let messageContainer: HTMLElement | null = null;
let themeObserver: MutationObserver | null = null;
let containerCleanupTimer: number | undefined;
const closingIds = new Set<number>();

interface MessageInfo {
    id: number;
    element: HTMLElement;
    timer?: number;
    onClose?: () => void;
}

const messageList: MessageInfo[] = [];

// 创建 Loading 旋转图标（纯 CSS）
function createLoadingSpinner(): HTMLElement {
    return createElement('span', { className: 'message__loading-spinner' });
}

const ICON_MAP: Record<MessageType, string | HTMLElement> = {
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
    error: '✕',
    loading: createLoadingSpinner(),
};

// ---------- 样式与主题 ----------
function ensureStylesInjected(): void {
    injectStyle(STYLE_ID, styles);
}

function observeTheme(container: HTMLElement): void {
    if (themeObserver) themeObserver.disconnect();
    themeObserver = new MutationObserver(() => {
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme) {
            container.setAttribute('data-theme', theme);
        } else {
            container.removeAttribute('data-theme');
        }
    });
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    });
}

function getContainer(): HTMLElement {
    if (!messageContainer) {
        messageContainer = createElement('div', {
            className: 'message-container',
            styles: { top: `${globalConfig.top}px` },
        });
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme) messageContainer.setAttribute('data-theme', theme);
        document.body.appendChild(messageContainer);
        ensureStylesInjected();
        observeTheme(messageContainer);
    }
    return messageContainer;
}

function scheduleContainerCleanup(): void {
    if (containerCleanupTimer) {
        clearTimeout(containerCleanupTimer);
    }
    containerCleanupTimer = window.setTimeout(() => {
        if (messageList.length === 0 && messageContainer) {
            if (themeObserver) {
                themeObserver.disconnect();
                themeObserver = null;
            }
            messageContainer.remove();
            messageContainer = null;
        }
        containerCleanupTimer = undefined;
    }, 300);
}

// ---------- 创建元素 ----------
function createIconElement(icon: string | HTMLElement, type: MessageType): HTMLElement {
    const iconEl = createElement('span', {
        className: `message__icon message__icon--${type}`,
    });

    if (typeof icon === 'string') {
        iconEl.textContent = icon;
    } else {
        iconEl.appendChild(icon.cloneNode(true) as HTMLElement);
    }

    return iconEl;
}

function createMessageElement(options: MessageOptions, id: number): HTMLElement {
    const type = options.type || 'info';
    const showIcon = options.showIcon !== false;

    const element = createElement('div', {
        className: `message message--${type}${options.className ? ` ${options.className}` : ''}`,
        styles: options.style,
    });

    element.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
    element.setAttribute('aria-live', type === 'error' || type === 'warning' ? 'assertive' : 'polite');

    if (showIcon) {
        const icon = options.icon ? createIconElement(options.icon, type) : createIconElement(ICON_MAP[type], type);
        element.appendChild(icon);
    }

    const content = createElement('span', { className: 'message__content' });

    const textEl = createElement('span', {
        className: 'message__text',
    });

    // 支持字符串和 DOM 元素作为内容
    if (typeof options.content === 'string') {
        textEl.textContent = options.content;
    } else if (options.content instanceof HTMLElement) {
        textEl.appendChild(options.content.cloneNode(true));
    }

    content.appendChild(textEl);

    if (options.description) {
        const descEl = createElement('span', {
            className: 'message__description',
        });

        // 支持字符串和 DOM 元素作为描述
        if (typeof options.description === 'string') {
            descEl.textContent = options.description;
        } else if (options.description instanceof HTMLElement) {
            descEl.appendChild(options.description.cloneNode(true));
        }

        content.appendChild(descEl);
    }

    element.appendChild(content);

    if (options.closable) {
        const close = createElement('button', {
            className: 'message__close',
            textContent: '×',
            attrs: { type: 'button', 'aria-label': '关闭' },
        });
        close.onclick = () => closeMessage(id);
        element.appendChild(close);
    }

    return element;
}

// ---------- 关闭消息 ----------
async function closeMessage(id: number): Promise<void> {
    if (closingIds.has(id)) return;
    closingIds.add(id);

    try {
        const index = messageList.findIndex(m => m.id === id);
        if (index === -1) return;

        const message = messageList[index];

        if (message.timer) {
            clearTimeout(message.timer);
            message.timer = undefined;
        }

        await addClosingAnimation(message.element, ANIMATION_DURATION.NORMAL);

        message.element.remove();

        const currentIndex = messageList.findIndex(m => m.id === id);
        if (currentIndex !== -1) {
            messageList.splice(currentIndex, 1);
        }

        try {
            message.onClose?.();
        } catch (err) {
            console.error('[Solely Message] onClose callback error:', err);
        }

        scheduleContainerCleanup();
    } finally {
        closingIds.delete(id);
    }
}

// ---------- 公开 API ----------
function open(options: MessageOptions): MessageInstance {
    const id = generateId();
    const container = getContainer();

    if (messageList.length >= globalConfig.maxCount) {
        closeMessage(messageList[0].id);
    }

    const element = createMessageElement(options, id);
    container.appendChild(element);

    const messageInfo: MessageInfo = {
        id,
        element,
        onClose: options.onClose,
    };

    const duration = options.duration ?? globalConfig.duration;
    if (duration > 0) {
        messageInfo.timer = window.setTimeout(() => {
            closeMessage(id);
        }, duration);
    }

    messageList.push(messageInfo);

    return {
        close: () => closeMessage(id),
        update: (newContent: string | HTMLElement | Partial<Pick<MessageOptions, 'content' | 'description'>>) => {
            if (typeof newContent === 'string' || newContent instanceof HTMLElement) {
                const textEl = element.querySelector('.message__text') as HTMLElement;
                if (textEl) {
                    // 清空现有内容
                    textEl.innerHTML = '';

                    // 支持字符串和 DOM 元素
                    if (typeof newContent === 'string') {
                        textEl.textContent = newContent;
                    } else if (newContent instanceof HTMLElement) {
                        textEl.appendChild(newContent.cloneNode(true));
                    }
                }
                return;
            }
            if (newContent.content !== undefined) {
                const textEl = element.querySelector('.message__text') as HTMLElement;
                if (textEl) {
                    // 清空现有内容
                    textEl.innerHTML = '';

                    // 支持字符串和 DOM 元素
                    if (typeof newContent.content === 'string') {
                        textEl.textContent = newContent.content;
                    } else if (newContent.content instanceof HTMLElement) {
                        textEl.appendChild(newContent.content.cloneNode(true));
                    }
                }
            }
            if (newContent.description !== undefined) {
                let descEl = element.querySelector('.message__description') as HTMLElement;
                if (!descEl && newContent.description) {
                    descEl = createElement('span', {
                        className: 'message__description',
                    });

                    // 支持字符串和 DOM 元素
                    if (typeof newContent.description === 'string') {
                        descEl.textContent = newContent.description;
                    } else if (newContent.description instanceof HTMLElement) {
                        descEl.appendChild(newContent.description.cloneNode(true));
                    }

                    const contentWrapper = element.querySelector('.message__content');
                    contentWrapper?.appendChild(descEl);
                } else if (descEl) {
                    if (newContent.description) {
                        // 清空现有内容
                        descEl.innerHTML = '';

                        // 支持字符串和 DOM 元素
                        if (typeof newContent.description === 'string') {
                            descEl.textContent = newContent.description;
                        } else if (newContent.description instanceof HTMLElement) {
                            descEl.appendChild(newContent.description.cloneNode(true));
                        }
                    } else {
                        descEl.remove();
                    }
                }
            }
        },
    };
}

function info(
    content: string | HTMLElement,
    options?: number | Partial<Omit<MessageOptions, 'content' | 'type'>>,
): MessageInstance {
    const opts = typeof options === 'number' ? { duration: options } : options;
    return open({ content, type: 'info', ...opts });
}

function success(
    content: string | HTMLElement,
    options?: number | Partial<Omit<MessageOptions, 'content' | 'type'>>,
): MessageInstance {
    const opts = typeof options === 'number' ? { duration: options } : options;
    return open({ content, type: 'success', ...opts });
}

function warning(
    content: string | HTMLElement,
    options?: number | Partial<Omit<MessageOptions, 'content' | 'type'>>,
): MessageInstance {
    const opts = typeof options === 'number' ? { duration: options } : options;
    return open({ content, type: 'warning', ...opts });
}

function error(
    content: string | HTMLElement,
    options?: number | Partial<Omit<MessageOptions, 'content' | 'type'>>,
): MessageInstance {
    const opts = typeof options === 'number' ? { duration: options } : options;
    return open({ content, type: 'error', ...opts });
}

function loading(
    content: string | HTMLElement,
    options?: number | Partial<Omit<MessageOptions, 'content' | 'type'>>,
): MessageInstance {
    if (options === undefined) {
        return open({ content, type: 'loading', duration: 0, closable: true });
    }
    if (typeof options === 'number') {
        return open({ content, type: 'loading', duration: options, closable: true });
    }
    return open({
        content,
        type: 'loading',
        duration: 0,
        closable: true,
        ...options,
    });
}

function config(options: Partial<MessageConfig>): void {
    Object.assign(globalConfig, options);
    if (options.top !== undefined && messageContainer) {
        messageContainer.style.top = `${options.top}px`;
    }
}

async function destroy(): Promise<void> {
    if (containerCleanupTimer) {
        clearTimeout(containerCleanupTimer);
        containerCleanupTimer = undefined;
    }
    const messages = [...messageList];
    await Promise.all(messages.map(m => closeMessage(m.id)));
}

export const Message = {
    open,
    info,
    success,
    warning,
    error,
    loading,
    config,
    destroy,
};

export default Message;
