/**
 * Solely Drawer 命令式组件
 * 抽屉组件，从屏幕边缘滑出的浮层面板
 * 使用公共样式系统，遵循 BEM 命名规范和 CSS 变量体系
 *
 * 使用方式：
 * ```typescript
 * import { Drawer } from 'solely/components/commands';
 *
 * Drawer.open({
 *   title: '标题',
 *   content: '内容',
 *   placement: 'right',
 *   onClose: () => console.log('关闭')
 * });
 * ```
 */

import type { DrawerOptions, DrawerInstance, DrawerConfig } from './types';
import { generateId, injectStyle, createElement, addClosingAnimation, ANIMATION_DURATION } from '../utils';
import styles from './style.css?inline';

const STYLE_ID = 'solely-drawer-styles';

const globalConfig: DrawerConfig = {
    width: 378,
    height: 378,
    mask: true,
    maskClosable: true,
    closable: true,
};

interface DrawerInfo {
    id: number;
    element: HTMLElement;
    options: DrawerOptions;
    cleanup?: () => void;
}

const drawerList: DrawerInfo[] = [];
const closingIds = new Set<number>();
let themeObserver: MutationObserver | null = null;

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
            drawerList.forEach(d => {
                const theme = document.documentElement.getAttribute('data-theme');
                if (theme) {
                    d.element.setAttribute('data-theme', theme);
                } else {
                    d.element.removeAttribute('data-theme');
                }
            });
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
    }

    return () => {
        if (themeObserver && drawerList.length === 0) {
            themeObserver.disconnect();
            themeObserver = null;
        }
    };
}

async function closeDrawerById(id: number): Promise<void> {
    // 防止并发关闭同一个 Drawer
    if (closingIds.has(id)) return;
    closingIds.add(id);

    try {
        const index = drawerList.findIndex(d => d.id === id);
        if (index === -1) return;

        const drawerInfo = drawerList[index];
        const mask = drawerInfo.element.querySelector('.drawer-mask') as HTMLElement;
        const drawer = drawerInfo.element.querySelector('.drawer') as HTMLElement;

        if (mask) mask.classList.add('is-closing');
        if (drawer) drawer.classList.add('is-closing');

        await addClosingAnimation(drawerInfo.element, ANIMATION_DURATION.NORMAL);

        // 清理事件监听器
        drawerInfo.cleanup?.();

        // 重新查找索引（动画期间可能发生变化）
        const currentIndex = drawerList.findIndex(d => d.id === id);
        if (currentIndex !== -1) {
            drawerList[currentIndex].element.remove();
            drawerList.splice(currentIndex, 1);
        }

        // 所有 Drawer 关闭后移除背景滚动锁定类
        if (drawerList.length === 0) {
            document.body.classList.remove('solely-drawer-open');
        }
    } finally {
        closingIds.delete(id);
    }
}

function open(options: DrawerOptions): DrawerInstance {
    const id = generateId();

    ensureStylesInjected();

    const placement = options.placement || 'right';
    const width = options.width ?? globalConfig.width;
    const height = options.height ?? globalConfig.height;
    const mask = options.mask ?? globalConfig.mask;
    const maskClosable = options.maskClosable ?? globalConfig.maskClosable;
    const closable = options.closable ?? globalConfig.closable;

    const wrap = createElement('div', { className: 'drawer-wrap' });

    // 主题适配
    const cleanupTheme = observeTheme(wrap);

    // 存储需要清理的事件处理函数
    const handlersToCleanup: Array<{ element: HTMLElement; type: string; handler: EventListener }> = [];

    if (mask !== false) {
        const maskEl = createElement('div', { className: 'drawer-mask' });
        if (maskClosable) {
            const handleMaskClick = () => {
                closeDrawerById(id);
                options.onClose?.();
            };
            maskEl.addEventListener('click', handleMaskClick);
            handlersToCleanup.push({ element: maskEl, type: 'click', handler: handleMaskClick as EventListener });
        }
        wrap.appendChild(maskEl);
    }

    const drawer = createElement('div', {
        className: `drawer drawer--${placement}${options.className ? ` ${options.className}` : ''}`,
        styles: options.style as Partial<CSSStyleDeclaration>,
    });

    if (placement === 'left' || placement === 'right') {
        drawer.style.width = typeof width === 'number' ? `${width}px` : width;
    } else {
        drawer.style.height = typeof height === 'number' ? `${height}px` : height;
    }

    if (options.title || closable !== false) {
        const header = createElement('div', { className: 'drawer__header' });

        if (options.title) {
            const title = createElement('h3', {
                className: 'drawer__title',
            });

            // 支持字符串和 DOM 元素作为标题
            if (typeof options.title === 'string') {
                title.textContent = options.title;
            } else if (options.title instanceof HTMLElement) {
                title.appendChild(options.title.cloneNode(true));
            }

            header.appendChild(title);
        }

        if (closable !== false) {
            const close = createElement('button', {
                className: 'drawer__close',
                textContent: '×',
                attrs: { type: 'button', 'aria-label': '关闭' },
            });
            const handleCloseClick = () => {
                closeDrawerById(id);
                options.onClose?.();
            };
            close.addEventListener('click', handleCloseClick);
            handlersToCleanup.push({ element: close, type: 'click', handler: handleCloseClick as EventListener });
            header.appendChild(close);
        }

        drawer.appendChild(header);
    }

    const body = createElement('div', {
        className: 'drawer__body',
        styles: options.bodyStyle as Partial<CSSStyleDeclaration>,
    });

    // 支持字符串和 DOM 元素作为内容
    if (typeof options.content === 'string') {
        body.textContent = options.content || '';
    } else if (options.content instanceof HTMLElement) {
        body.appendChild(options.content.cloneNode(true));
    }

    drawer.appendChild(body);
    wrap.appendChild(drawer);

    document.body.appendChild(wrap);

    // 添加背景滚动锁定类
    document.body.classList.add('solely-drawer-open');

    // 创建清理函数
    const cleanup = () => {
        handlersToCleanup.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        cleanupTheme();
    };

    drawerList.push({ id, element: wrap, options, cleanup });

    return {
        close: () => {
            closeDrawerById(id);
            options.onClose?.();
        },
        update: (newOptions: Partial<DrawerOptions>) => {
            // 更新标题
            if (newOptions.title !== undefined) {
                const titleEl = wrap.querySelector('.drawer__title') as HTMLElement;
                if (titleEl) {
                    // 清空现有内容
                    titleEl.innerHTML = '';

                    // 支持字符串和 DOM 元素
                    if (typeof newOptions.title === 'string') {
                        titleEl.textContent = newOptions.title;
                    } else if (newOptions.title instanceof HTMLElement) {
                        titleEl.appendChild(newOptions.title.cloneNode(true));
                    }
                } else if (newOptions.title) {
                    // 如果之前没有标题，需要创建 header
                    const header = createElement('div', { className: 'drawer__header' });
                    const title = createElement('h3', {
                        className: 'drawer__title',
                    });

                    // 支持字符串和 DOM 元素
                    if (typeof newOptions.title === 'string') {
                        title.textContent = newOptions.title;
                    } else if (newOptions.title instanceof HTMLElement) {
                        title.appendChild(newOptions.title.cloneNode(true));
                    }

                    header.appendChild(title);
                    const drawer = wrap.querySelector('.drawer') as HTMLElement;
                    drawer?.insertBefore(header, drawer.firstChild);
                }
            }

            // 更新内容
            if (newOptions.content !== undefined) {
                const bodyEl = wrap.querySelector('.drawer__body') as HTMLElement;
                if (bodyEl) {
                    // 清空现有内容
                    bodyEl.innerHTML = '';

                    // 支持字符串和 DOM 元素
                    if (typeof newOptions.content === 'string') {
                        bodyEl.textContent = newOptions.content;
                    } else if (newOptions.content instanceof HTMLElement) {
                        bodyEl.appendChild(newOptions.content.cloneNode(true));
                    }
                }
            }

            // 更新宽度/高度
            const drawerEl = wrap.querySelector('.drawer') as HTMLElement;
            if (drawerEl) {
                const currentPlacement = newOptions.placement || options.placement || 'right';
                if (newOptions.width !== undefined && (currentPlacement === 'left' || currentPlacement === 'right')) {
                    drawerEl.style.width =
                        typeof newOptions.width === 'number' ? `${newOptions.width}px` : newOptions.width;
                }
                if (newOptions.height !== undefined && (currentPlacement === 'top' || currentPlacement === 'bottom')) {
                    drawerEl.style.height =
                        typeof newOptions.height === 'number' ? `${newOptions.height}px` : newOptions.height;
                }
            }

            // 更新类名
            if (newOptions.className !== undefined) {
                if (drawerEl) {
                    const currentPlacement = options.placement || 'right';
                    drawerEl.className = `drawer drawer--${currentPlacement} ${newOptions.className}`.trim();
                }
            }

            // 更新样式
            if (newOptions.style !== undefined) {
                if (drawerEl) {
                    Object.assign(drawerEl.style, newOptions.style);
                }
            }

            // 更新 body 样式
            if (newOptions.bodyStyle !== undefined) {
                const bodyEl = wrap.querySelector('.drawer__body') as HTMLElement;
                if (bodyEl) {
                    Object.assign(bodyEl.style, newOptions.bodyStyle);
                }
            }
        },
    };
}

function config(options: Partial<DrawerConfig>): void {
    Object.assign(globalConfig, options);
}

async function destroy(): Promise<void> {
    // 从最后一个开始依次关闭所有抽屉
    const drawersToClose = [...drawerList].reverse();
    for (const drawer of drawersToClose) {
        await closeDrawerById(drawer.id);
    }
}

export const Drawer = {
    open,
    config,
    destroy,
};

export default Drawer;
