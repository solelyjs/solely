/**
 * Solely Tag 组件
 * 标签组件，用于标记和分类
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import type { TagProps, TagSize } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

@CustomElement({
    tagName: 'solely-tag',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'default' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'content', type: 'string', default: '' },
        { name: 'closable', type: 'boolean', default: false },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'round', type: 'boolean', default: false },
        { name: 'color', type: 'string', default: '' },
    ],
})
class SolelyTag extends BaseElement<TagProps> {
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): TagSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

    /**
     * 获取 tag class 对象
     */
    getTagClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.type) {
            classes[`tag--${this.$data.type}`] = true;
        }
        // 尺寸映射
        if (this.$data.size === 'small') {
            classes['tag--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['tag--lg'] = true;
        }
        classes['is-disabled'] = !!this.$data.disabled;
        classes['tag--round'] = !!this.$data.round;
        return classes;
    }

    /**
     * 组件挂载后
     */
    mounted(): void {
        this.refresh();
    }

    /**
     * 关闭事件处理
     */
    handleClose(event: Event): void {
        event.stopPropagation();

        if (this.$data.disabled) return;

        // close 事件为可取消事件：业务方调用 preventDefault() 可阻止标签被移除
        const allowed = this.dispatchEvent(
            new CustomEvent('close', {
                bubbles: true,
                composed: true,
                cancelable: true,
                detail: {
                    content: this.$data.content,
                },
            }),
        );

        if (!allowed) return;

        // 从 DOM 中移除
        this.remove();
    }

    /**
     * 关闭按钮键盘事件（Enter / Space 等价于点击）
     */
    handleCloseKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleClose(event);
        }
    }

    /**
     * 设置标签内容
     */
    public setContent(content: string): void {
        this.$data.content = content;
    }

    /**
     * 设置标签类型
     */
    public setType(type: TagProps['type']): void {
        this.$data.type = type;
    }
}

export default SolelyTag;
export { SolelyTag };
