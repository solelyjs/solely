/**
 * Solely Tabs 组件
 * 标签页组件，用于内容的分组展示
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import { oneOf } from '../../../shared/enum';
import type { TabsProps, TabItem, TabsCloseEventDetail, TabsAddEventDetail, TabsSize } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';
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
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'items', type: 'string', default: '[]' },
        { name: 'closable', type: 'boolean', default: false },
        { name: 'addable', type: 'boolean', default: false },
        { name: 'centered', type: 'boolean', default: false },
        { name: 'lazy', type: 'boolean', default: false },
        { name: 'label', type: 'string', default: '' },
    ],
})
class SolelyTabs extends BaseElement<TabsProps & { visitedKeys: string[] }> {
    /**
     * 暴露 activeKey 属性，使外部可通过 event.target.activeKey 访问
     */
    get activeKey(): string {
        return this.$data.activeKey;
    }

    set activeKey(value: string) {
        const changed = this.$data.activeKey !== value;
        this.$data.activeKey = value;
        // 懒渲染登记必须在早退前完成：attribute 同步路径不会派发 change，但同样要渲染面板
        this.markVisited(value);
        // 框架初始化/attribute 同步/属性升级期间不派发业务事件
        if (this.isSyncingProps || !changed) return;
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true,
                detail: { activeKey: value },
            }),
        );
    }

    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): TabsSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

    /**
     * 记录已挂载过的面板（配合 lazy 使用）
     */
    private markVisited(key: string): void {
        if (!key) return;
        const visited = this.$data.visitedKeys || [];
        if (visited.includes(key)) return;
        this.$data.visitedKeys = [...visited, key];
    }

    /**
     * 该面板是否应渲染插槽（非 lazy 模式恒为 true）
     */
    isPaneRendered(key: string): boolean {
        if (!this.$data.lazy) return true;
        return (this.$data.visitedKeys || []).includes(key);
    }

    /**
     * 获取 tabs class 对象
     */
    getTabsClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        classes[`tabs--${this.getType()}`] = true;
        // 位置（顶部为默认值，不额外输出类名）
        const position = this.getPosition();
        if (position !== 'top') {
            classes[`tabs--pos-${position}`] = true;
        }
        if (this.$data.centered) {
            classes['tabs--centered'] = true;
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

    /** 标签类型（非法值回退 line） */
    getType(): 'line' | 'card' {
        return oneOf(this.$data.type, ['line', 'card'], 'line');
    }

    /** 标签位置（非法值回退 top） */
    getPosition(): 'top' | 'right' | 'bottom' | 'left' {
        return oneOf(this.$data.position, ['top', 'right', 'bottom', 'left'], 'top');
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
        // 初始化懒渲染记录：保留 attribute 同步阶段已登记的面板，避免覆盖后空白
        const visited = this.$data.visitedKeys || [];
        const activeKey = this.$data.activeKey;
        this.$data.visitedKeys = activeKey && !visited.includes(activeKey) ? [...visited, activeKey] : visited;
        this.refresh();

        // 如果没有设置 activeKey，默认选中第一个
        const parsedItems = this.getParsedItems();
        if (!this.$data.activeKey && Array.isArray(parsedItems) && parsedItems.length > 0) {
            const firstItem = parsedItems[0];
            if (firstItem && firstItem.key) {
                this.$data.activeKey = firstItem.key;
                this.markVisited(firstItem.key);
            }
        }
    }

    /**
     * 获取解析后的标签项
     */
    getParsedItems(): TabItem[] {
        const value = this.$data.items;
        if (Array.isArray(value)) {
            return value;
        }
        if (typeof value === 'string' && value) {
            return safeJsonParse(value, []);
        }
        return [];
    }

    /**
     * 标签点击事件
     *
     * 事件契约：与属性赋值路径保持一致，统一走 activeKey setter，
     * 仅当值真正变化时派发 CustomEvent('change')，detail 为 `{ activeKey }`。
     */
    handleTabClick(item: TabItem): void {
        if (item.disabled) return;

        this.activeKey = item.key;
    }

    /**
     * 标签键盘导航（WAI-ARIA tabs 模式）
     *
     * - ArrowRight / ArrowDown：下一个可用标签
     * - ArrowLeft / ArrowUp：上一个可用标签
     * - Home / End：第一个 / 最后一个可用标签
     * - Enter / Space：激活当前标签
     * - Delete / Backspace：关闭当前标签（关闭按钮不进入 Tab 序列时的键盘等价）
     */
    handleTabKeydown(event: KeyboardEvent, item: TabItem): void {
        const key = event.key;
        if ((key === 'Delete' || key === 'Backspace') && this.$data.closable && this.getParsedItems().length > 1) {
            event.preventDefault();
            this.handleClose(item, event);
            return;
        }
        const items = this.getParsedItems().filter(i => !i.disabled);
        if (items.length === 0) return;

        const currentIndex = items.findIndex(i => i.key === item.key);
        if (currentIndex < 0) return;

        let nextIndex: number;
        switch (key) {
            case 'ArrowRight':
            case 'ArrowDown':
                nextIndex = (currentIndex + 1) % items.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                nextIndex = (currentIndex - 1 + items.length) % items.length;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = items.length - 1;
                break;
            case 'Enter':
            case ' ':
            case 'Spacebar':
                event.preventDefault();
                this.handleTabClick(item);
                return;
            default:
                return;
        }

        event.preventDefault();
        const next = items[nextIndex];
        if (!next) return;

        this.handleTabClick(next);
        this.focusTab(next.key);
    }

    /**
     * 把焦点移到指定标签（roving tabindex 的焦点跟随）
     */
    private focusTab(key: string): void {
        const tabs = Array.from(this.shadowRoot?.querySelectorAll('.tabs__tab') || []) as HTMLElement[];
        const target = tabs.find(tab => tab.dataset.key === key);
        target?.focus();
    }

    /**
     * 关闭按钮键盘触发（Enter / Space）
     */
    handleCloseKeydown(event: KeyboardEvent, item: TabItem): void {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        event.preventDefault();
        this.handleClose(item, event);
    }

    /**
     * 新增按钮键盘触发（Enter / Space）
     */
    handleAddKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
        event.preventDefault();
        this.handleAdd();
    }

    /**
     * 关闭标签
     */
    handleClose(item: TabItem, event: Event): void {
        event.stopPropagation();

        // 从列表中移除该标签
        const parsedItems = this.getParsedItems();
        const index = parsedItems.findIndex((i: TabItem) => i.key === item.key);
        if (index > -1) {
            parsedItems.splice(index, 1);

            // 更新 items 属性
            this.$data.items = JSON.stringify(parsedItems);

            // 如果关闭的是当前激活的标签，切换到相邻标签（与点击/属性赋值共用 setter）
            if (this.$data.activeKey === item.key && parsedItems.length > 0) {
                const newIndex = Math.min(index, parsedItems.length - 1);
                const nextItem = parsedItems[newIndex];
                if (nextItem && nextItem.key) {
                    this.activeKey = nextItem.key;
                }
            }
        }

        // 派发原生 close 事件
        this.dispatchEvent(
            new CustomEvent('close', {
                bubbles: true,
                composed: true,
                detail: {
                    key: item.key,
                    label: item.label,
                } as TabsCloseEventDetail,
            }),
        );
    }

    /**
     * 新增标签
     */
    handleAdd(): void {
        // 生成新标签的 key 和 label
        const parsedItems = this.getParsedItems();
        const newIndex = parsedItems.length + 1;
        const newItem: TabItem = {
            key: `new-${Date.now()}`,
            label: `新标签 ${newIndex}`,
        };

        // 添加到列表
        parsedItems.push(newItem);

        // 更新 items 属性
        this.$data.items = JSON.stringify(parsedItems);

        // 自动切换到新标签（与点击/属性赋值共用 setter）
        this.activeKey = newItem.key;

        // 派发原生 add 事件
        this.dispatchEvent(
            new CustomEvent('add', {
                bubbles: true,
                composed: true,
                detail: {
                    key: newItem.key,
                    label: newItem.label,
                } as TabsAddEventDetail,
            }),
        );
    }

    /**
     * 设置当前激活的标签
     */
    public setActiveKey(key: string): void {
        this.$data.activeKey = key;
        this.markVisited(key);
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
        this.markVisited(this.$data.activeKey);
        this.refresh();
    }
}

export default SolelyTabs;
export { SolelyTabs };
