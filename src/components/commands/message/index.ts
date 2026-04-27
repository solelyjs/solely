import type { MessageOptions, MessageInstance, MessageConfig, MessageType, MessagePlacement } from './types';
import { generateId, injectStyle, createElement, addClosingAnimation, ANIMATION_DURATION } from '../utils'; // 路径按实际调整
import styles from './style.css?inline';

const STYLE_ID = 'solely-message-styles';

const globalConfig: MessageConfig = {
    duration: 3000,
    maxCount: 5,
    gap: 8,
    top: 24,
    bottom: 24,
    left: 24,
    right: 24,
    placement: 'top',
};

let themeObserver: MutationObserver | null = null;
let containerCleanupTimer: number | undefined;
const closingIds = new Set<number>();

interface MessageInfo {
    id: number;
    element: HTMLElement;
    timer?: number;
    onClose?: () => void;
    placement: MessagePlacement;
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

const containers: Map<string, HTMLElement> = new Map();

function getContainer(placement: MessagePlacement = globalConfig.placement): HTMLElement {
    const containerKey = placement;
    if (containers.has(containerKey)) {
        return containers.get(containerKey)!;
    }

    const container = createElement('div', {
        className: 'message-container',
    });

    // 根据位置设置样式
    const styles: Partial<CSSStyleDeclaration> = {
        position: 'fixed',
        display: 'flex',
        flexDirection: 'column',
        gap: `${globalConfig.gap}px`,
        pointerEvents: 'none',
        zIndex: 'var(--solely-z-index-toast)',
    };

    switch (placement) {
        // 顶部位置
        case 'top':
            styles.top = `${globalConfig.top}px`;
            styles.left = '50%';
            styles.transform = 'translateX(-50%)';
            break;
        case 'topLeft':
            styles.top = `${globalConfig.top}px`;
            styles.left = `${globalConfig.left}px`;
            styles.alignItems = 'flex-start';
            break;
        case 'topRight':
            styles.top = `${globalConfig.top}px`;
            styles.right = `${globalConfig.right}px`;
            styles.alignItems = 'flex-end';
            break;
        // 底部位置
        case 'bottom':
            styles.bottom = `${globalConfig.bottom}px`;
            styles.left = '50%';
            styles.transform = 'translateX(-50%)';
            break;
        case 'bottomLeft':
            styles.bottom = `${globalConfig.bottom}px`;
            styles.left = `${globalConfig.left}px`;
            styles.alignItems = 'flex-start';
            break;
        case 'bottomRight':
            styles.bottom = `${globalConfig.bottom}px`;
            styles.right = `${globalConfig.right}px`;
            styles.alignItems = 'flex-end';
            break;
        // 左侧居中
        case 'left':
            styles.top = '50%';
            styles.left = `${globalConfig.left}px`;
            styles.transform = 'translateY(-50%)';
            styles.alignItems = 'flex-start';
            break;
        // 右侧居中
        case 'right':
            styles.top = '50%';
            styles.right = `${globalConfig.right}px`;
            styles.transform = 'translateY(-50%)';
            styles.alignItems = 'flex-end';
            break;
    }

    Object.assign(container.style, styles);

    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) container.setAttribute('data-theme', theme);
    document.body.appendChild(container);
    ensureStylesInjected();
    observeTheme(container);

    containers.set(containerKey, container);
    return container;
}

function scheduleContainerCleanup(): void {
    if (containerCleanupTimer) {
        clearTimeout(containerCleanupTimer);
    }
    containerCleanupTimer = window.setTimeout(() => {
        if (messageList.length === 0) {
            containers.forEach((container, placement) => {
                if (container.childElementCount === 0) {
                    container.remove();
                    containers.delete(placement);
                }
            });
            if (containers.size === 0 && themeObserver) {
                themeObserver.disconnect();
                themeObserver = null;
            }
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
    const placement = options.placement || globalConfig.placement;
    const container = getContainer(placement);

    // 只检查对应位置的消息数量
    const messagesAtPlacement = messageList.filter(m => m.placement === placement);
    if (messagesAtPlacement.length >= globalConfig.maxCount) {
        const oldestMessage = messagesAtPlacement[0];
        if (oldestMessage) {
            closeMessage(oldestMessage.id);
        }
    }

    const element = createMessageElement(options, id);
    container.appendChild(element);

    const messageInfo: MessageInfo = {
        id,
        element,
        onClose: options.onClose,
        placement,
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

    // 更新现有容器的样式
    containers.forEach((container, placement) => {
        // 顶部位置
        if (options.top !== undefined) {
            if (['top', 'topLeft', 'topRight'].includes(placement)) {
                container.style.top = `${options.top}px`;
            }
        }
        // 底部位置
        if (options.bottom !== undefined) {
            if (['bottom', 'bottomLeft', 'bottomRight'].includes(placement)) {
                container.style.bottom = `${options.bottom}px`;
            }
        }
        // 左侧位置
        if (options.left !== undefined) {
            if (['topLeft', 'bottomLeft', 'left'].includes(placement)) {
                container.style.left = `${options.left}px`;
            }
        }
        // 右侧位置
        if (options.right !== undefined) {
            if (['topRight', 'bottomRight', 'right'].includes(placement)) {
                container.style.right = `${options.right}px`;
            }
        }
        if (options.gap !== undefined) {
            container.style.gap = `${options.gap}px`;
        }
    });
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
