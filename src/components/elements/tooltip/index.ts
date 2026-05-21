/**
 * Solely Tooltip 组件（声明式）
 * 文字提示气泡框组件
 * 使用公共样式系统，遵循 BEM 命名规范和 CSS 变量体系
 * 纯 CSS 定位，无需 JavaScript 计算
 *
 * 使用方式：
 * ```html
 * <solely-tooltip content="这是提示内容" placement="top" trigger="hover">
 *     <button>悬停显示提示</button>
 * </solely-tooltip>
 * ```
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { TooltipProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-tooltip',
    template,
    styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'content', type: 'string', default: '' },
        { name: 'placement', type: 'string', default: 'top' },
        { name: 'trigger', type: 'string', default: 'hover' },
        { name: 'visible', type: 'boolean', default: false },
        { name: 'color', type: 'string', default: '' },
        { name: 'maxWidth', type: 'number', default: 250 },
    ],
})
class SolelyTooltip extends BaseElement<TooltipProps> {
    private _clickOutsideHandler?: (event: MouseEvent) => void;

    /**
     * 获取 tooltip class 对象
     */
    getTooltipClasses(): Record<string, boolean> {
        return {
            [`tooltip--${this.$data.placement}`]: true,
            'is-visible': this.$data.visible,
        };
    }

    /**
     * 显示 tooltip
     */
    public show(): void {
        if (this.$data.visible) return;
        this.$data.visible = true;
    }

    /**
     * 隐藏 tooltip
     */
    public hide(): void {
        if (!this.$data.visible) return;
        this.$data.visible = false;
    }

    /**
     * 鼠标移入处理
     */
    handleMouseEnter(event: Event): void {
        if (this.$data.trigger !== 'hover') return;
        event.stopPropagation();
        this.show();
    }

    /**
     * 鼠标移出处理
     */
    handleMouseLeave(event: Event): void {
        if (this.$data.trigger !== 'hover') return;
        event.stopPropagation();
        this.hide();
    }

    /**
     * 聚焦处理
     */
    handleFocus(event: Event): void {
        if (this.$data.trigger !== 'focus') return;
        event.stopPropagation();
        this.show();
    }

    /**
     * 失焦处理
     */
    handleBlur(event: Event): void {
        if (this.$data.trigger !== 'focus') return;
        event.stopPropagation();
        this.hide();
    }

    /**
     * 绑定事件到 slot 内容元素
     */
    private bindSlotEvents(): void {
        if (this.$data.trigger !== 'focus') return;

        const slot = this.shadowRoot?.querySelector('slot');
        if (!slot) return;

        const assignedElements = slot.assignedElements();
        assignedElements.forEach(el => {
            const focusable = el.querySelector('input, textarea, select, button, a, [tabindex]') || el;
            if (focusable) {
                focusable.addEventListener('focus', this.handleFocus.bind(this));
                focusable.addEventListener('blur', this.handleBlur.bind(this));
            }
        });
    }

    /**
     * 点击处理
     */
    handleClick(event: Event): void {
        if (this.$data.trigger !== 'click') return;
        event.stopPropagation();

        if (this.$data.visible) {
            this.hide();
            this.unbindClickOutside();
        } else {
            this.show();
            this.bindClickOutside();
        }
    }

    /**
     * 绑定点击外部关闭
     */
    private bindClickOutside(): void {
        if (this._clickOutsideHandler) return;

        this._clickOutsideHandler = (e: MouseEvent) => {
            const path = e.composedPath();
            if (!path.includes(this)) {
                this.hide();
                this.unbindClickOutside();
            }
        };

        document.addEventListener('click', this._clickOutsideHandler);
    }

    /**
     * 解绑点击外部关闭
     */
    private unbindClickOutside(): void {
        if (this._clickOutsideHandler) {
            document.removeEventListener('click', this._clickOutsideHandler);
            this._clickOutsideHandler = undefined;
        }
    }

    /**
     * 组件挂载后初始化
     */
    mounted(): void {
        this.refresh();
        this.bindSlotEvents();
    }

    /**
     * 组件销毁时清理
     */
    unmounted(): void {
        this.unbindClickOutside();
    }
}

export default SolelyTooltip;
export { SolelyTooltip };
