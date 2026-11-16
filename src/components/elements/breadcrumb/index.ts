/**
 * Solely Breadcrumb 组件
 * 面包屑组件，用于显示当前页面在系统层级结构中的位置
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { BreadcrumbProps, BreadcrumbItem } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

@CustomElement({
    tagName: 'solely-breadcrumb',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'items', type: 'array', default: [] },
        { name: 'separator', type: 'string', default: '/' },
        { name: 'label', type: 'string', default: '' },
    ],
})
class SolelyBreadcrumb extends BaseElement<BreadcrumbProps> {
    /** 当前点击的项 */
    clickedItem: BreadcrumbItem | null = null;

    /**
     * 点击事件处理
     *
     * 事件契约：
     * - 新增 CustomEvent('item-click')，detail 为 `{ item }`；所有可点击项都会派发，
     *   包括带 href 的导航项（导航行为本身不受影响）。
     * - 旧的自定义 'click' 已改名为 CustomEvent('legacy-click')（detail 同为 `{ item }`），
     *   只保留一个 0.x 版本；原 'click' 仅保留原生事件，避免一次点击触发两次同名业务逻辑。
     */
    handleClick(item: BreadcrumbItem, event: Event): void {
        this.clickedItem = item;

        this.dispatchEvent(
            new CustomEvent('item-click', {
                bubbles: true,
                composed: true,
                detail: { item },
            }),
        );

        // 兼容旧监听：改名后不再与原生 click 同名，后续大版本移除
        this.dispatchEvent(
            new CustomEvent('legacy-click', {
                bubbles: true,
                composed: true,
                detail: { item },
            }),
        );

        if (item.href) {
            // 如果有 href，让默认导航行为发生
            return;
        }

        event.preventDefault();
    }

    /**
     * 无 href 的中间项键盘触发（Enter），与鼠标点击共用同一事件路径
     */
    handleItemKeydown(item: BreadcrumbItem, event: KeyboardEvent): void {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        this.handleClick(item, event);
    }

    get items(): BreadcrumbItem[] {
        return this.$data.items;
    }

    set items(items: BreadcrumbItem[]) {
        this.$data.items = items;
    }
}

export default SolelyBreadcrumb;
export { SolelyBreadcrumb };
