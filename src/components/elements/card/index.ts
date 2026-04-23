/**
 * Solely Card 组件
 * 卡片容器组件，支持标题、封面、操作区等多种布局
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { CardProps, CardRefs } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-card',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'title', type: 'string', default: '' },
        { name: 'size', type: 'string', default: 'default' },
        { name: 'bordered', type: 'boolean', default: false },
        { name: 'loading', type: 'boolean', default: false },
        { name: 'hoverable', type: 'boolean', default: false },
        { name: 'cover', type: 'string', default: '' },
        { name: 'actions', type: 'array', default: [] },
        { name: 'extra', type: 'string', default: '' },
    ],
})
class SolelyCard extends BaseElement<CardProps, CardRefs> {
    /**
     * 获取 card class 对象
     */
    getCardClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {
            'card--bordered': !!this.$data.bordered,
            'card--hoverable': !!this.$data.hoverable,
        };
        // 尺寸映射
        if (this.$data.size === 'small') {
            classes['card--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['card--lg'] = true;
        }
        classes['is-loading'] = !!this.$data.loading;
        return classes;
    }

    /**
     * 设置加载状态
     */
    public setLoading(loading: boolean): void {
        this.$data.loading = loading;
    }

    /**
     * 设置标题
     */
    public setTitle(title: string): void {
        this.$data.title = title;
    }

    /**
     * 获取操作项列表
     */
    getActionItems(): string[] {
        const actions = this.$data.actions;
        if (Array.isArray(actions)) {
            return actions.filter(item => typeof item === 'string');
        }
        return [];
    }

    /**
     * 处理操作项点击
     */
    handleActionClick(index: number, _event: Event): void {
        const items = this.getActionItems();
        if (index < 0 || index >= items.length) {
            return;
        }
        const action = items[index];
        this.emit('action', {
            index,
            action,
        });
    }
}

export default SolelyCard;
export { SolelyCard };
