/**
 * Solely Card 组件
 * 卡片容器组件，支持标题、封面、操作区等多种布局
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import { fallbackBrokenImage } from '../utils/helpers';
import type { CardProps, CardRefs, CardSize } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

@CustomElement({
    tagName: 'solely-card',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'title', type: 'string', default: '' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'bordered', type: 'boolean', default: false },
        { name: 'loading', type: 'boolean', default: false },
        { name: 'hoverable', type: 'boolean', default: false },
        { name: 'cover', type: 'string', default: '' },
        { name: 'coverAlt', type: 'string', default: '' },
        { name: 'actions', type: 'array', default: [] },
        { name: 'extra', type: 'string', default: '' },
    ],
})
class SolelyCard extends BaseElement<CardProps, CardRefs> {
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): CardSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

    /** 封面图加载失败时回退到内置占位图，避免破图 */
    handleCoverError(event: Event): void {
        fallbackBrokenImage(event);
    }

    /** 监听 light DOM 变化，动态插入/移除 extra、actions 插槽后重新渲染 */
    private slotObserver?: MutationObserver;

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
     * 组件挂载后
     */
    mounted(): void {
        this.refresh();
        this.slotObserver = new MutationObserver(() => {
            this.refresh();
        });
        this.slotObserver.observe(this, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['slot'],
        });
    }

    /**
     * 组件卸载时释放观察器
     */
    unmounted(): void {
        this.slotObserver?.disconnect();
        this.slotObserver = undefined;
    }

    /**
     * 检查是否存在指定名称的插槽
     */
    hasNamedSlot(name: string): boolean {
        return this.querySelector(`[slot="${name}"]`) !== null;
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
     * 操作项键盘事件（Enter / Space 等价于点击）
     */
    handleActionKeydown(index: number, event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleActionClick(index, event);
        }
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
