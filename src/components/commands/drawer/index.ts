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
import {
    generateId,
    injectStyle,
    createElement,
    createLinearIcon,
    addClosingAnimation,
    observeTheme,
    ANIMATION_DURATION,
} from '../utils';
import { registerOverlay, type OverlayHandle } from '../../../shared/floating/overlay-stack';
import { oneOf } from '../../../shared/enum';
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
    overlay?: OverlayHandle;
}

const drawerList: DrawerInfo[] = [];
/** 正在关闭的抽屉：同一 id 复用同一个 Promise，保证 destroy() 等到动画结束 */
const closingTasks = new Map<number, Promise<void>>();

function ensureStylesInjected(): void {
    injectStyle(STYLE_ID, styles);
}

function closeDrawerById(id: number): Promise<void> {
    // 并发关闭同一个 Drawer：复用进行中的关闭任务，避免重复回调 / 提前返回
    const running = closingTasks.get(id);
    if (running) return running;

    const task = (async () => {
        const index = drawerList.findIndex(d => d.id === id);
        if (index === -1) return;

        const drawerInfo = drawerList[index];

        // 任何关闭路径（遮罩/按钮/Esc/close()/destroy()）都只通知一次；
        // 回调异常不能中断后续的 deactivate / 动画 / dispose
        try {
            drawerInfo.options.onClose?.();
        } catch (error) {
            console.error('[Solely Drawer] onClose callback error:', error);
        }

        // 关闭动画开始：出栈并停止 Esc / Tab 陷阱（焦点与锁在动画结束后释放）
        drawerInfo.overlay?.deactivate();

        const mask = drawerInfo.element.querySelector('.solely-drawer-mask') as HTMLElement;
        const drawer = drawerInfo.element.querySelector('.solely-drawer') as HTMLElement;

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

        // 动画结束：还原焦点、释放 scroll lock 与 inert
        drawerInfo.overlay?.dispose();
    })();

    closingTasks.set(id, task);
    // 用 then 的双回调清理，避免 finally 派生的 rejected Promise 变成 unhandled rejection
    void task.then(
        () => closingTasks.delete(id),
        () => closingTasks.delete(id),
    );
    return task;
}

function open(options: DrawerOptions): DrawerInstance {
    const id = generateId();

    ensureStylesInjected();

    // 非法 placement 会拼出无 CSS 的类名，抽屉定位完全失效
    const placement = oneOf(options.placement, ['left', 'right', 'top', 'bottom'], 'right');
    const width = options.width ?? globalConfig.width;
    const height = options.height ?? globalConfig.height;
    const mask = options.mask ?? globalConfig.mask;
    const maskClosable = options.maskClosable ?? globalConfig.maskClosable;
    const closable = options.closable ?? globalConfig.closable;

    const wrap = createElement('div', {
        className: 'solely-drawer-wrap',
        attrs: { tabIndex: '-1' },
    });

    // 主题适配（使用共享观察者）
    const cleanupTheme = observeTheme(() => wrap);

    const shouldClone = options.cloneElement ?? true;

    // 存储需要清理的事件处理函数
    const handlersToCleanup: Array<{ element: HTMLElement; type: string; handler: EventListener }> = [];

    if (mask !== false) {
        const maskEl = createElement('div', { className: 'solely-drawer-mask' });
        if (maskClosable) {
            const handleMaskClick = () => {
                closeDrawerById(id);
            };
            maskEl.addEventListener('click', handleMaskClick);
            handlersToCleanup.push({ element: maskEl, type: 'click', handler: handleMaskClick as EventListener });
        }
        wrap.appendChild(maskEl);
    }

    const titleId = `solely-drawer-title-${id}`;
    const hasTitle =
        typeof options.title === 'string' ? (options.title || '').trim() !== '' : options.title instanceof HTMLElement;

    const drawer = createElement('div', {
        className: `solely-drawer solely-drawer--${placement}${options.className ? ` ${options.className}` : ''}`,
        attrs: {
            role: 'dialog',
            'aria-modal': 'true',
            tabIndex: '-1',
            ...(hasTitle ? { 'aria-labelledby': titleId } : { 'aria-label': '抽屉' }),
        },
        styles: options.style as Partial<CSSStyleDeclaration>,
    });

    if (placement === 'left' || placement === 'right') {
        drawer.style.width = typeof width === 'number' ? `${width}px` : width;
    } else {
        drawer.style.height = typeof height === 'number' ? `${height}px` : height;
    }

    if (options.title || closable !== false) {
        const header = createElement('div', { className: 'solely-drawer__header' });

        if (options.title) {
            const title = createElement('h3', {
                className: 'solely-drawer__title',
                attrs: { id: titleId },
            });

            // 支持字符串和 DOM 元素作为标题
            if (typeof options.title === 'string') {
                title.textContent = options.title;
            } else if (options.title instanceof HTMLElement) {
                title.appendChild(shouldClone ? options.title.cloneNode(true) : options.title);
            }

            header.appendChild(title);
        }

        if (closable !== false) {
            const close = createElement('button', {
                className: 'solely-drawer__close',
                attrs: { type: 'button', 'aria-label': '关闭' },
            });
            close.appendChild(createLinearIcon('close'));
            const handleCloseClick = () => {
                closeDrawerById(id);
            };
            close.addEventListener('click', handleCloseClick);
            handlersToCleanup.push({ element: close, type: 'click', handler: handleCloseClick as EventListener });
            header.appendChild(close);
        }

        drawer.appendChild(header);
    }

    const body = createElement('div', {
        className: 'solely-drawer__body',
        styles: options.bodyStyle as Partial<CSSStyleDeclaration>,
    });

    // 支持字符串和 DOM 元素作为内容
    if (typeof options.content === 'string') {
        body.textContent = options.content || '';
    } else if (options.content instanceof HTMLElement) {
        body.appendChild(shouldClone ? options.content.cloneNode(true) : options.content);
    }

    drawer.appendChild(body);
    wrap.appendChild(drawer);

    document.body.appendChild(wrap);

    // 注册浮层：z-index / Esc / 焦点陷阱 / scroll lock / 背景 inert 统一由基座接管
    const overlay = registerOverlay({
        kind: 'drawer',
        // wrap 是遮罩+抽屉的浮层根节点，嵌套浮层时基座据此排除其它层
        container: wrap,
        trigger: null,
        escClosable: true,
        trapFocus: true,
        lockScroll: true,
        inertBackground: true,
        autoFocus: true,
        initialFocus: drawer,
        onEscape: () => {
            closeDrawerById(id);
        },
    });
    overlay.activate();

    // 创建清理函数
    const cleanup = () => {
        handlersToCleanup.forEach(({ element, type, handler }) => {
            element.removeEventListener(type, handler);
        });
        cleanupTheme();
    };

    drawerList.push({ id, element: wrap, options, cleanup, overlay });

    // 记录当前方向，供 update() 更新修饰类与尺寸
    let currentPlacement = placement;

    return {
        close: () => {
            closeDrawerById(id);
        },
        update: (newOptions: Partial<DrawerOptions>) => {
            const updateShouldClone = newOptions.cloneElement ?? shouldClone;
            // 更新标题
            if (newOptions.title !== undefined) {
                const titleEl = wrap.querySelector('.solely-drawer__title') as HTMLElement;
                if (titleEl) {
                    // 清空现有内容
                    titleEl.innerHTML = '';

                    // 支持字符串和 DOM 元素
                    if (typeof newOptions.title === 'string') {
                        titleEl.textContent = newOptions.title;
                    } else if (newOptions.title instanceof HTMLElement) {
                        titleEl.appendChild(updateShouldClone ? newOptions.title.cloneNode(true) : newOptions.title);
                    }
                } else if (newOptions.title) {
                    // 如果之前没有标题，需要创建 header
                    const header = createElement('div', { className: 'solely-drawer__header' });
                    const title = createElement('h3', {
                        className: 'solely-drawer__title',
                    });

                    // 支持字符串和 DOM 元素
                    if (typeof newOptions.title === 'string') {
                        title.textContent = newOptions.title;
                    } else if (newOptions.title instanceof HTMLElement) {
                        title.appendChild(updateShouldClone ? newOptions.title.cloneNode(true) : newOptions.title);
                    }

                    header.appendChild(title);
                    const drawer = wrap.querySelector('.solely-drawer') as HTMLElement;
                    drawer?.insertBefore(header, drawer.firstChild);
                }
            }

            // 更新内容
            if (newOptions.content !== undefined) {
                const bodyEl = wrap.querySelector('.solely-drawer__body') as HTMLElement;
                if (bodyEl) {
                    // 清空现有内容
                    bodyEl.innerHTML = '';

                    // 支持字符串和 DOM 元素
                    if (typeof newOptions.content === 'string') {
                        bodyEl.textContent = newOptions.content;
                    } else if (newOptions.content instanceof HTMLElement) {
                        bodyEl.appendChild(updateShouldClone ? newOptions.content.cloneNode(true) : newOptions.content);
                    }
                }
            }

            // 更新方向/尺寸
            const drawerEl = wrap.querySelector('.solely-drawer') as HTMLElement;
            if (drawerEl) {
                // 方向变化时同步切换 BEM 修饰类
                if (newOptions.placement !== undefined && newOptions.placement !== currentPlacement) {
                    currentPlacement = newOptions.placement;
                    drawerEl.classList.remove(
                        'solely-drawer--left',
                        'solely-drawer--right',
                        'solely-drawer--top',
                        'solely-drawer--bottom',
                    );
                    drawerEl.classList.add(`solely-drawer--${currentPlacement}`);
                    // 清理旧方向遗留的行内尺寸，避免切换方向后尺寸失效
                    drawerEl.style.width = '';
                    drawerEl.style.height = '';
                }

                if (newOptions.width !== undefined && (currentPlacement === 'left' || currentPlacement === 'right')) {
                    drawerEl.style.width =
                        typeof newOptions.width === 'number' ? `${newOptions.width}px` : newOptions.width;
                }
                if (newOptions.height !== undefined && (currentPlacement === 'top' || currentPlacement === 'bottom')) {
                    drawerEl.style.height =
                        typeof newOptions.height === 'number' ? `${newOptions.height}px` : newOptions.height;
                }
            }

            // 更新类名（保留当前方向修饰类）
            if (newOptions.className !== undefined) {
                if (drawerEl) {
                    const classNames = ['solely-drawer', `solely-drawer--${currentPlacement}`, newOptions.className];
                    drawerEl.className = classNames.filter(Boolean).join(' ');
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
                const bodyEl = wrap.querySelector('.solely-drawer__body') as HTMLElement;
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
