/**
 * Solely Commands 组件共享工具函数
 * 提供公共的样式注入、DOM 操作、位置计算等功能
 */

export const ANIMATION_DURATION = {
    FAST: 200,
    NORMAL: 300,
    SLOW: 500,
};

export const Z_INDEX = {
    TOOLTIP: 1070,
    POPOVER: 1060,
    MODAL: 1050,
    TOAST: 1100,
};

let idCounter = 0;

/**
 * 生成唯一 ID（带安全取模，防止无限增长）
 */
export function generateId(): number {
    idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
    return idCounter;
}

export function injectStyle(id: string, content: string): void {
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = content;
    document.head.appendChild(style);
}

export function removeStyle(id: string): void {
    const style = document.getElementById(id);
    if (style) style.remove();
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: {
        className?: string;
        textContent?: string;
        styles?: Partial<CSSStyleDeclaration>;
        attrs?: Record<string, string>;
    },
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);

    if (options?.className) {
        element.className = options.className;
    }

    if (options?.textContent !== undefined) {
        element.textContent = options.textContent;
    }

    if (options?.styles) {
        Object.assign(element.style, options.styles);
    }

    if (options?.attrs) {
        Object.entries(options.attrs).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
    }

    return element;
}

export interface PositionResult {
    top: number;
    left: number;
    arrowLeft?: number;
    arrowTop?: number;
}

export type Placement =
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'topLeft'
    | 'topRight'
    | 'bottomLeft'
    | 'bottomRight'
    | 'leftTop'
    | 'leftBottom'
    | 'rightTop'
    | 'rightBottom';

export function calculatePosition(
    target: HTMLElement,
    popupElement?: HTMLElement,
    placement: Placement = 'top',
    gap: number = 8,
): PositionResult {
    const targetRect = target.getBoundingClientRect();
    const popupWidth = popupElement?.offsetWidth ?? 250;
    const popupHeight = popupElement?.offsetHeight ?? 100;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    let top = 0;
    let left = 0;
    let arrowLeft: number | undefined;
    let arrowTop: number | undefined;

    switch (placement) {
        case 'top':
            top = targetRect.top + scrollTop - popupHeight - gap;
            left = targetRect.left + scrollLeft + (targetRect.width - popupWidth) / 2;
            arrowLeft = popupWidth / 2 - 4;
            break;
        case 'topLeft':
            top = targetRect.top + scrollTop - popupHeight - gap;
            left = targetRect.left + scrollLeft;
            arrowLeft = 16;
            break;
        case 'topRight':
            top = targetRect.top + scrollTop - popupHeight - gap;
            left = targetRect.right + scrollLeft - popupWidth;
            arrowLeft = popupWidth - 24;
            break;
        case 'bottom':
            top = targetRect.bottom + scrollTop + gap;
            left = targetRect.left + scrollLeft + (targetRect.width - popupWidth) / 2;
            arrowLeft = popupWidth / 2 - 4;
            break;
        case 'bottomLeft':
            top = targetRect.bottom + scrollTop + gap;
            left = targetRect.left + scrollLeft;
            arrowLeft = 16;
            break;
        case 'bottomRight':
            top = targetRect.bottom + scrollTop + gap;
            left = targetRect.right + scrollLeft - popupWidth;
            arrowLeft = popupWidth - 24;
            break;
        case 'left':
            top = targetRect.top + scrollTop + (targetRect.height - popupHeight) / 2;
            left = targetRect.left + scrollLeft - popupWidth - gap;
            arrowTop = popupHeight / 2 - 4;
            break;
        case 'leftTop':
            top = targetRect.top + scrollTop;
            left = targetRect.left + scrollLeft - popupWidth - gap;
            arrowTop = 16;
            break;
        case 'leftBottom':
            top = targetRect.bottom + scrollTop - popupHeight;
            left = targetRect.left + scrollLeft - popupWidth - gap;
            arrowTop = popupHeight - 24;
            break;
        case 'right':
            top = targetRect.top + scrollTop + (targetRect.height - popupHeight) / 2;
            left = targetRect.right + scrollLeft + gap;
            arrowTop = popupHeight / 2 - 4;
            break;
        case 'rightTop':
            top = targetRect.top + scrollTop;
            left = targetRect.right + scrollLeft + gap;
            arrowTop = 16;
            break;
        case 'rightBottom':
            top = targetRect.bottom + scrollTop - popupHeight;
            left = targetRect.right + scrollLeft + gap;
            arrowTop = popupHeight - 24;
            break;
    }

    const padding = 8;
    top = Math.max(padding, Math.min(top, window.innerHeight + scrollTop - popupHeight - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth + scrollLeft - popupWidth - padding));

    return { top, left, arrowLeft, arrowTop };
}

export async function safeAsyncCallback<T>(
    callback: () => T | Promise<T>,
    fallback?: () => void,
): Promise<T | undefined> {
    try {
        return await callback();
    } catch (error) {
        console.error('[Solely Commands] Async callback error:', error);
        fallback?.();
        return undefined;
    }
}

/**
 * 添加关闭动画（使用 .is-closing 类）
 */
export function addClosingAnimation(element: HTMLElement, duration: number = ANIMATION_DURATION.NORMAL): Promise<void> {
    return new Promise(resolve => {
        element.classList.add('is-closing');
        setTimeout(() => resolve(), duration);
    });
}

// ---------- 共享主题观察者 ----------
// 所有命令式组件共用同一个 MutationObserver，避免重复创建

let sharedThemeObserver: MutationObserver | null = null;
const themeChangeCallbacks = new Set<() => void>();

function ensureThemeObserver(): void {
    if (sharedThemeObserver) return;
    sharedThemeObserver = new MutationObserver(() => {
        themeChangeCallbacks.forEach(cb => cb());
    });
    sharedThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    });
}

function maybeDisconnectThemeObserver(): void {
    if (themeChangeCallbacks.size === 0 && sharedThemeObserver) {
        sharedThemeObserver.disconnect();
        sharedThemeObserver = null;
    }
}

/**
 * 观察主题变化并同步到指定元素
 * @param getElements 返回需要同步主题的元素（单个、数组或 null）
 * @returns 清理函数（取消观察）
 */
export function observeTheme(getElements: () => HTMLElement | HTMLElement[] | null): () => void {
    const syncTheme = () => {
        const elements = getElements();
        if (!elements) return;
        const elArray = Array.isArray(elements) ? elements : [elements];
        const theme = document.documentElement.getAttribute('data-theme');
        elArray.forEach(el => {
            if (theme) {
                el.setAttribute('data-theme', theme);
            } else {
                el.removeAttribute('data-theme');
            }
        });
    };

    // 初始同步
    syncTheme();

    // 注册回调
    themeChangeCallbacks.add(syncTheme);
    ensureThemeObserver();

    // 返回清理函数
    return () => {
        themeChangeCallbacks.delete(syncTheme);
        maybeDisconnectThemeObserver();
    };
}
