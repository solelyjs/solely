/**
 * Solely Button 组件
 * 基础按钮组件，支持多种类型、尺寸和状态
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { ButtonProps, ButtonRefs } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-button',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'default' },
        { name: 'size', type: 'string', default: '' },
        { name: 'shape', type: 'string', default: '' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'loading', type: 'boolean', default: false },
        { name: 'ghost', type: 'boolean', default: false },
        { name: 'danger', type: 'boolean', default: false },
        { name: 'block', type: 'boolean', default: false },
        { name: 'iconOnly', type: 'boolean', default: false },
        { name: 'content', type: 'string', default: '' },
        { name: 'icon', type: 'string', default: '' },
        { name: 'iconRight', type: 'string', default: '' },
        { name: 'loadingIcon', type: 'string', default: '' },
        { name: 'href', type: 'string', default: '' },
        { name: 'target', type: 'string', default: '' },
    ],
})
class SolelyButton extends BaseElement<ButtonProps, ButtonRefs> {
    /**
     * 获取按钮 class 对象
     */
    getButtonClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        // 默认按钮类型（没有指定 type 或 type 为 default）
        if (!this.$data.type || this.$data.type === 'default') {
            classes['btn--default'] = true;
        } else {
            classes[`btn--${this.$data.type}`] = true;
        }
        // 尺寸
        if (this.$data.size === 'small') {
            classes['btn--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['btn--lg'] = true;
        }
        if (this.$data.shape) {
            classes[`btn--${this.$data.shape}`] = true;
        }
        classes['is-disabled'] = !!this.$data.disabled;
        classes['is-loading'] = !!this.$data.loading;
        classes['btn--ghost'] = !!this.$data.ghost;
        classes['btn--danger'] = !!this.$data.danger;
        classes['btn--icon-only'] = !!this.$data.iconOnly;
        classes['btn--block'] = !!this.$data.block;
        return classes;
    }

    /**
     * 获取按钮标签类型
     */
    getTagName(): string {
        if (this.$data.href) {
            return 'a';
        }
        return 'button';
    }

    /**
     * 获取链接属性
     */
    getLinkAttrs(): Record<string, string> {
        const attrs: Record<string, string> = {};
        if (this.$data.href) {
            attrs['href'] = this.$data.href;
            if (this.$data.target) {
                attrs['target'] = this.$data.target;
            }
        }
        return attrs;
    }

    /**
     * 获取加载图标
     * 如果设置了 loadingIcon 属性则使用自定义图标，否则使用默认 CSS 动画
     */
    getLoadingIcon(): string {
        return this.$data.loadingIcon || '';
    }

    /**
     * 点击事件处理
     * 当按钮处于加载或禁用状态时不触发
     */
    handleClick(event: MouseEvent): void {
        if (this.$data.loading || this.$data.disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
    }

    /**
     * 设置按钮为加载状态
     */
    public setLoading(loading: boolean): void {
        this.$data.loading = loading;
    }

    /**
     * 设置按钮为禁用状态
     */
    public setDisabled(disabled: boolean): void {
        this.$data.disabled = disabled;
    }

    /**
     * 聚焦按钮
     */
    public focus(): void {
        this.$refs.buttonRef?.focus();
    }

    /**
     * 失焦按钮
     */
    public blur(): void {
        this.$refs.buttonRef?.blur();
    }

    /**
     * 检查是否有默认 slot 内容（排除具名插槽）
     */
    hasDefaultSlotContent(): boolean {
        // 获取所有直接子节点
        const children = Array.from(this.childNodes);
        // 过滤掉具名插槽的元素（带有 slot 属性的元素）
        const defaultContent = children.filter(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                return !(node as Element).hasAttribute('slot');
            }
            // 文本节点也算内容（排除纯空白）
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent?.trim() !== '';
            }
            return false;
        });
        return defaultContent.length > 0;
    }

    /**
     * 检查是否有图标插槽内容
     */
    hasIconSlot(): boolean {
        return this.querySelector('[slot="icon"]') !== null;
    }

    /**
     * 检查是否有右侧图标插槽内容
     */
    hasIconRightSlot(): boolean {
        return this.querySelector('[slot="icon-right"]') !== null;
    }
}

export default SolelyButton;
export { SolelyButton };
