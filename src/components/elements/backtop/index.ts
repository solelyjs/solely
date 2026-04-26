/**
 * Solely BackTop 组件
 * 回到顶部，相对滚动容器定位，自动处理祖先滚动
 */
import { BaseElement, CustomElement } from '../../../runtime/component';
import type { BackTopProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';
import { throttle } from '../utils/helpers';

@CustomElement({
    tagName: 'solely-backtop',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'visibilityHeight', type: 'number', default: 400 },
        { name: 'duration', type: 'number', default: 450 },
    ],
})
class SolelyBackTop extends BaseElement<BackTopProps & { visible: boolean }> {
    // 事件处理引用（可选，方便清空时设为 undefined）
    private onScrollThrottled?: () => void;
    private onResizeThrottled?: () => void;
    private scrollAncestors: HTMLElement[] = [];

    container: HTMLElement | null = null;
    private mountTimeout?: number;
    private initialized = false;
    private animating = false;
    private isDocumentContainer = false;

    updateVisibleClass(): void {
        if (this.$data.visible) {
            this.classList.add('backtop--visible');
        } else {
            this.classList.remove('backtop--visible');
        }
    }

    /** 向上查找第一个纵向可滚动容器（不包括祖先） */
    getContainer(): HTMLElement | null {
        let parent = this.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                return parent as HTMLElement;
            }
            parent = parent.parentElement;
        }
        return null;
    }

    /** 查找所有可滚动的祖先元素（用于监听） */
    getScrollAncestors(startFrom: HTMLElement): HTMLElement[] {
        const ancestors: HTMLElement[] = [];
        let parent = startFrom.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                ancestors.push(parent);
            }
            parent = parent.parentElement;
        }
        return ancestors;
    }

    mounted(): void {
        this.$data.visible = false;
        this.mountTimeout = setTimeout(() => {
            this.initializeContainer();
        }, 100) as unknown as number;
    }

    unmounted(): void {
        this.initialized = false;
        this.animating = false;
        if (this.mountTimeout) {
            clearTimeout(this.mountTimeout);
            this.mountTimeout = undefined;
        }
        this.cleanupEventListeners();
    }

    private initializeContainer(): void {
        if (this.initialized) return;
        this.initialized = true;

        this.container = this.getContainer();
        if (!this.container) {
            this.container = document.documentElement;
            this.isDocumentContainer = true;
        } else {
            this.isDocumentContainer = false;
        }

        // 获取所有可滚动祖先（用于监听滚动导致的位移）
        if (!this.isDocumentContainer) {
            this.scrollAncestors = this.getScrollAncestors(this.container);
        } else {
            this.scrollAncestors = [];
        }

        // 统一的滚动处理：处理显隐 + 位置更新（非文档容器时）
        this.onScrollThrottled = throttle(() => {
            this.handleScroll();
            if (!this.isDocumentContainer) {
                this.schedulePositionUpdate();
            }
        }, 16);

        // 绑定滚动事件
        if (this.isDocumentContainer) {
            window.addEventListener('scroll', this.onScrollThrottled, { passive: true });
        } else {
            // 容器自身滚动
            this.container.addEventListener('scroll', this.onScrollThrottled);
            // 窗口滚动也可能影响容器位置
            window.addEventListener('scroll', this.onScrollThrottled, { passive: true });
            // 所有可滚动祖先的滚动都会导致容器位移
            const handler = this.onScrollThrottled;
            this.scrollAncestors.forEach(ancestor => {
                if (handler) {
                    ancestor.addEventListener('scroll', handler, { passive: true });
                }
            });
        }

        // 窗口大小变化
        this.onResizeThrottled = throttle(() => {
            if (!this.isDocumentContainer) {
                this.schedulePositionUpdate();
            }
        }, 16);
        window.addEventListener('resize', this.onResizeThrottled);

        // 初始执行
        this.handleScroll();
        this.updatePosition();
    }

    private cleanupEventListeners(): void {
        if (this.onScrollThrottled) {
            if (this.isDocumentContainer) {
                window.removeEventListener('scroll', this.onScrollThrottled);
            } else {
                if (this.container) {
                    this.container.removeEventListener('scroll', this.onScrollThrottled);
                }
                window.removeEventListener('scroll', this.onScrollThrottled);
                const handler = this.onScrollThrottled;
                this.scrollAncestors.forEach(ancestor => {
                    if (handler) {
                        ancestor.removeEventListener('scroll', handler);
                    }
                });
            }
            this.onScrollThrottled = undefined;
        }
        if (this.onResizeThrottled) {
            window.removeEventListener('resize', this.onResizeThrottled);
            this.onResizeThrottled = undefined;
        }
    }

    private schedulePositionUpdate(): void {
        requestAnimationFrame(() => this.updatePosition());
    }

    /** 根据容器在视口中的位置更新 fixed 坐标 */
    updatePosition(): void {
        if (!this.container) return;

        if (this.isDocumentContainer) {
            this.style.right = '';
            this.style.bottom = '';
            return;
        }

        const rect = this.container.getBoundingClientRect();
        const offset = 20;
        this.style.position = 'fixed';
        this.style.right = `${window.innerWidth - rect.right + offset}px`;
        this.style.bottom = `${window.innerHeight - rect.bottom + offset}px`;
    }

    handleScroll(): void {
        if (!this.container) return;
        const scrollTop = this.getScrollTop();
        const newVisible = scrollTop >= this.$data.visibilityHeight;
        if (this.$data.visible !== newVisible) {
            this.$data.visible = newVisible;
            this.updateVisibleClass();
        }
    }

    private getScrollTop(): number {
        if (this.isDocumentContainer) {
            return window.scrollY || document.documentElement.scrollTop;
        }
        return this.container?.scrollTop ?? 0;
    }

    private setScrollTop(value: number): void {
        if (this.isDocumentContainer) {
            window.scrollTo({ top: value, behavior: 'instant' as ScrollBehavior });
            document.documentElement.scrollTop = value;
        } else if (this.container) {
            this.container.scrollTop = value;
        }
    }

    handleClick(): void {
        if (this.animating || !this.container) return;
        this.animating = true;

        const duration = this.$data.duration || 450;
        const startTime = Date.now();
        const startTop = this.getScrollTop();

        const scroll = () => {
            if (!this.animating) return;
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress =
                progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            const currentTop = startTop * (1 - easeProgress);
            this.setScrollTop(currentTop);

            if (progress < 1) {
                requestAnimationFrame(scroll);
            } else {
                this.animating = false;
                this.dispatchEvent(
                    new CustomEvent('backtop-finish', {
                        bubbles: true,
                        composed: true,
                    }),
                );
            }
        };

        requestAnimationFrame(scroll);
    }
}

export default SolelyBackTop;
export { SolelyBackTop };
