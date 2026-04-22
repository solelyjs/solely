/**
 * Solely Breadcrumb 组件
 * 面包屑组件，用于显示当前页面在系统层级结构中的位置
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { BreadcrumbProps, BreadcrumbItem } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-breadcrumb',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'items', type: 'array', default: [] },
        { name: 'separator', type: 'string', default: '/' },
    ],
})
class SolelyBreadcrumb extends BaseElement<BreadcrumbProps> {
    /** 当前点击的项 */
    clickedItem: BreadcrumbItem | null = null;

    /**
     * 点击事件处理
     */
    handleClick(item: BreadcrumbItem, event: MouseEvent): void {
        if (item.href) {
            // 如果有 href，让默认行为发生
            return;
        }

        event.preventDefault();

        // 记录点击的项
        this.clickedItem = item;

        // 触发自定义事件
        this.dispatchEvent(
            new Event('click', {
                bubbles: true,
                composed: true,
            }),
        );
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
