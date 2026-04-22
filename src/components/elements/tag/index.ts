/**
 * Solely Tag 组件
 * 标签组件，用于标记和分类
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { TagProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

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
     * 关闭事件处理
     */
    handleClose(event: MouseEvent): void {
        event.stopPropagation();

        if (this.$data.disabled) return;

        this.emit('close', {
            content: this.$data.content,
        });

        // 从 DOM 中移除
        this.remove();
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
