/**
 * Solely BackTop 组件
 * 回到顶部组件，用于页面长距离滚动后返回顶部
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
    scrollHandler?: () => void;
    resizeHandler?: () => void;
    container: HTMLElement | null = null;
    private mountTimeout?: number;
    private initialized = false;

    /**
     * 更新显示状态
     */
    updateVisibleClass(): void {
        if (this.$data.visible) {
            this.classList.add('backtop--visible');
        } else {
            this.classList.remove('backtop--visible');
        }
    }

    /**
     * 获取滚动容器
     */
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

    mounted(): void {
        this.mountTimeout = setTimeout(() => {
            this.initializeContainer();
        }, 100) as unknown as number;
    }

    unmounted(): void {
        // 清除定时器
        if (this.mountTimeout) {
            clearTimeout(this.mountTimeout);
            this.mountTimeout = undefined;
        }
        // 清理事件监听器
        this.cleanupEventListeners();
    }

    /**
     * 初始化容器
     */
    private initializeContainer(): void {
        if (this.initialized) return;
        this.initialized = true;

        this.container = this.getContainer();

        if (!this.container) {
            this.warn(true, '未找到可滚动的父容器');
            return;
        }

        // 监听容器滚动（节流优化，16ms 约等于 60fps）
        this.scrollHandler = throttle(() => {
            this.handleScroll();
        }, 16);
        this.container.addEventListener('scroll', this.scrollHandler);

        // 监听窗口变化（用于更新位置）
        this.resizeHandler = () => {
            requestAnimationFrame(() => {
                this.updatePosition();
            });
        };
        window.addEventListener('resize', this.resizeHandler);

        // 监听窗口滚动（用于更新位置，节流优化）
        window.addEventListener(
            'scroll',
            throttle(() => {
                if (this.resizeHandler) {
                    this.resizeHandler();
                }
            }, 16),
            { passive: true },
        );

        // 初始检查
        this.handleScroll();
        this.updatePosition();
    }

    /**
     * 清理事件监听器
     */
    private cleanupEventListeners(): void {
        if (this.scrollHandler && this.container) {
            this.container.removeEventListener('scroll', this.scrollHandler);
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            window.removeEventListener('scroll', this.resizeHandler);
        }
    }

    /**
     * 更新按钮位置
     */
    updatePosition(): void {
        if (!this.container) return;

        const rect = this.container.getBoundingClientRect();

        // 计算按钮位置：容器右下角，距离右边缘20px，距离下边缘20px
        const right = window.innerWidth - rect.right + 20;
        const bottom = window.innerHeight - rect.bottom + 20;

        // 设置按钮位置
        this.style.position = 'fixed';
        this.style.right = `${right}px`;
        this.style.bottom = `${bottom}px`;
    }

    /**
     * 滚动事件处理
     */
    handleScroll(): void {
        if (!this.container) return;

        const scrollTop = this.container.scrollTop;
        const newVisible = scrollTop >= this.$data.visibilityHeight;

        if (this.$data.visible !== newVisible) {
            this.$data.visible = newVisible;
            this.updateVisibleClass();
        }
    }

    /**
     * 点击回到顶部
     */
    handleClick(): void {
        if (!this.container) return;

        const duration = this.$data.duration || 450;
        const startTime = Date.now();
        const startTop = this.container.scrollTop;

        const scroll = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // easeInOutCubic
            const easeProgress =
                progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            const currentTop = startTop * (1 - easeProgress);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.container!.scrollTop = currentTop;

            if (progress < 1) {
                requestAnimationFrame(scroll);
            } else {
                // 派发原生 click 事件
                this.dispatchEvent(
                    new Event('click', {
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
