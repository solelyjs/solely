/**
 * Solely Tabs 组件
 * 标签页组件，用于内容的分组展示
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { TabsProps, TabItem } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';
import { safeJsonParse } from '../utils/helpers';

@CustomElement({
    tagName: 'solely-tabs',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'activeKey', type: 'string', default: '' },
        { name: 'type', type: 'string', default: 'line' },
        { name: 'position', type: 'string', default: 'top' },
        { name: 'size', type: 'string', default: 'default' },
        { name: 'items', type: 'string', default: '[]' },
        { name: 'closable', type: 'boolean', default: false },
        { name: 'addable', type: 'boolean', default: false },
    ],
})
class SolelyTabs extends BaseElement<TabsProps & { parsedItems: TabItem[] }> {
    /**
     * 暴露 activeKey 属性，使外部可通过 event.target.activeKey 访问
     */
    get activeKey(): string {
        return this.$data.activeKey;
    }

    set activeKey(value: string) {
        this.$data.activeKey = value;
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 获取 tabs class 对象
     */
    getTabsClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.type) {
            classes[`tabs--${this.$data.type}`] = true;
        }
        // 尺寸映射
        if (this.$data.size === 'small') {
            classes['tabs--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['tabs--lg'] = true;
        } else {
            classes['tabs--md'] = true;
        }
        return classes;
    }

    /**
     * 获取 tab class 对象
     */
    getTabClasses(item: TabItem): Record<string, boolean> {
        return {
            'tabs__tab--active': item.key === this.$data.activeKey,
            'tabs__tab--disabled': !!item.disabled,
        };
    }

    /**
     * 获取 pane class 对象
     */
    getPaneClasses(item: TabItem): Record<string, boolean> {
        return {
            'tabs__pane--active': item.key === this.$data.activeKey,
        };
    }

    mounted(): void {
        this.parseItems();

        // 如果没有设置 activeKey，默认选中第一个
        if (!this.$data.activeKey && Array.isArray(this.$data.parsedItems) && this.$data.parsedItems.length > 0) {
            const firstItem = this.$data.parsedItems[0];
            if (firstItem && firstItem.key) {
                this.$data.activeKey = firstItem.key;
            }
        }
    }

    /**
     * 解析标签项
     */
    parseItems(): void {
        this.$data.parsedItems = safeJsonParse(this.$data.items, []);
    }

    /**
     * 标签点击事件
     */
    handleTabClick(item: TabItem): void {
        if (item.disabled) return;

        this.$data.activeKey = item.key;

        // 派发原生 change 事件
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 关闭标签
     */
    handleClose(item: TabItem, event: MouseEvent): void {
        event.stopPropagation();

        // 从列表中移除该标签
        const index = this.$data.parsedItems.findIndex((i: TabItem) => i.key === item.key);
        if (index > -1) {
            this.$data.parsedItems.splice(index, 1);

            // 如果关闭的是当前激活的标签，切换到相邻标签
            if (
                this.$data.activeKey === item.key &&
                Array.isArray(this.$data.parsedItems) &&
                this.$data.parsedItems.length > 0
            ) {
                const newIndex = Math.min(index, this.$data.parsedItems.length - 1);
                const nextItem = this.$data.parsedItems[newIndex];
                if (nextItem && nextItem.key) {
                    this.$data.activeKey = nextItem.key;
                }
            }

            // 更新 items 属性
            this.$data.items = JSON.stringify(this.$data.parsedItems);
        }

        // 派发原生 close 事件
        this.dispatchEvent(
            new CustomEvent('close', {
                bubbles: true,
                composed: true,
                detail: {
                    key: item.key,
                    label: item.label,
                },
            }),
        );
    }

    /**
     * 新增标签
     */
    handleAdd(): void {
        // 生成新标签的 key 和 label
        const newIndex = this.$data.parsedItems.length + 1;
        const newItem: TabItem = {
            key: `new-${Date.now()}`,
            label: `新标签 ${newIndex}`,
        };

        // 添加到列表
        this.$data.parsedItems.push(newItem);

        // 自动切换到新标签
        this.$data.activeKey = newItem.key;

        // 更新 items 属性
        this.$data.items = JSON.stringify(this.$data.parsedItems);

        // 派发原生 add 事件
        this.dispatchEvent(
            new CustomEvent('add', {
                bubbles: true,
                composed: true,
                detail: {
                    key: newItem.key,
                    label: newItem.label,
                },
            }),
        );
    }

    /**
     * 设置当前激活的标签
     */
    public setActiveKey(key: string): void {
        this.$data.activeKey = key;
    }

    /**
     * 获取当前激活的标签
     */
    public getActiveKey(): string {
        return this.$data.activeKey;
    }

    /**
     * 设置标签项
     */
    public setItems(items: TabItem[]): void {
        this.$data.items = JSON.stringify(items);
        this.parseItems();
    }
}

export default SolelyTabs;
export { SolelyTabs };
