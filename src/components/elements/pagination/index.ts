/**
 * Solely Pagination 组件
 * 分页组件，用于数据分页展示
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { PaginationProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-pagination',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'current', type: 'number', default: 1 },
        { name: 'total', type: 'number', default: 0 },
        { name: 'pageSize', type: 'number', default: 10 },
        { name: 'size', type: 'string', default: 'default' },
        { name: 'simple', type: 'boolean', default: false },
        { name: 'showQuickJumper', type: 'boolean', default: false },
        { name: 'showSizeChanger', type: 'boolean', default: false },
        { name: 'pageSizeOptions', type: 'string', default: '[10, 20, 50, 100]' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'showTotal', type: 'boolean', default: false },
    ],
})
class SolelyPagination extends BaseElement<
    PaginationProps & {
        visiblePages: (number | string)[];
        parsedPageSizeOptions: number[];
    }
> {
    /**
     * 暴露 current 属性，使外部可通过 event.target.current 访问
     */
    get current(): number {
        return this.$data.current;
    }

    set current(value: number) {
        this.$data.current = value;
        this.calculateVisiblePages();
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 暴露 pageSize 属性
     */
    get pageSize(): number {
        return this.$data.pageSize;
    }

    set pageSize(value: number) {
        this.$data.pageSize = value;
        this.calculateVisiblePages();
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 获取 pagination class 对象
     */
    getPaginationClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        // 尺寸映射
        if (this.$data.size === 'small') {
            classes['pagination--sm'] = true;
        } else if (this.$data.size === 'large') {
            classes['pagination--lg'] = true;
        } else {
            classes['pagination--md'] = true;
        }
        classes['is-disabled'] = !!this.$data.disabled;
        return classes;
    }

    /**
     * 获取 prev class 对象
     */
    getPrevClasses(): Record<string, boolean> {
        return {
            'pagination__item--disabled': (this.$data.current || 1) <= 1,
        };
    }

    /**
     * 获取 next class 对象
     */
    getNextClasses(): Record<string, boolean> {
        return {
            'pagination__item--disabled': (this.$data.current || 1) >= this.totalPages,
        };
    }

    /**
     * 获取 item class 对象
     */
    getItemClasses(page: number | string): Record<string, boolean> {
        return {
            'pagination__item--active': page === this.$data.current,
        };
    }

    mounted(): void {
        this.$data.jumperValue = '';
        this.parsePageSizeOptions();
        this.calculateVisiblePages();
    }

    /**
     * 解析每页条数选项
     */
    parsePageSizeOptions(): void {
        try {
            this.$data.parsedPageSizeOptions = JSON.parse(this.$data.pageSizeOptions || '[10, 20, 50, 100]');
        } catch {
            this.$data.parsedPageSizeOptions = [10, 20, 50, 100];
        }
    }

    /**
     * 计算总页数
     */
    get totalPages(): number {
        return Math.ceil((this.$data.total || 0) / (this.$data.pageSize || 10));
    }

    /**
     * 计算可见页码
     */
    calculateVisiblePages(): void {
        const current = this.$data.current || 1;
        const total = this.totalPages;
        const pages: (number | string)[] = [];

        if (total <= 7) {
            for (let i = 1; i <= total; i++) {
                pages.push(i);
            }
        } else {
            if (current <= 3) {
                pages.push(1, 2, 3, 4, 5, '...', total);
            } else if (current >= total - 2) {
                pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
            } else {
                pages.push(1, '...', current - 1, current, current + 1, '...', total);
            }
        }

        this.$data.visiblePages = pages;
    }

    /**
     * 页码点击
     */
    handlePageClick(page: number): void {
        if (this.$data.disabled || page === this.$data.current) return;

        this.$data.current = page;
        this.calculateVisiblePages();

        // 派发原生 change 事件
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true,
                detail: {
                    current: page,
                    pageSize: this.$data.pageSize,
                },
            }),
        );
    }

    /**
     * 上一页
     */
    handlePrev(): void {
        if (this.$data.disabled || this.$data.current <= 1) return;

        this.handlePageClick(this.$data.current - 1);
    }

    /**
     * 下一页
     */
    handleNext(): void {
        if (this.$data.disabled || this.$data.current >= this.totalPages) return;

        this.handlePageClick(this.$data.current + 1);
    }

    /**
     * 每页条数改变
     */
    handleSizeChange(event: Event): void {
        if (this.$data.disabled) return;

        const select = event.target as HTMLSelectElement;
        const newPageSize = parseInt(select.value, 10);

        this.$data.pageSize = newPageSize;
        this.$data.current = 1;
        this.calculateVisiblePages();

        // 派发原生 showSizeChange 事件
        this.dispatchEvent(
            new CustomEvent('showSizeChange', {
                bubbles: true,
                composed: true,
                detail: {
                    current: 1,
                    pageSize: newPageSize,
                },
            }),
        );
    }

    /**
     * 快速跳转
     */
    handleJumperKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter') return;

        const input = event.target as HTMLInputElement;
        const page = parseInt(input.value, 10);

        if (page >= 1 && page <= this.totalPages) {
            this.handlePageClick(page);
        }

        this.$data.jumperValue = '';
    }

    /**
     * 快速跳转步进
     */
    handleJumperStep(step: number): void {
        if (this.$data.disabled) return;

        const newPage = this.$data.current + step;
        if (newPage >= 1 && newPage <= this.totalPages) {
            this.handlePageClick(newPage);
            this.$data.jumperValue = String(newPage);
        }
    }

    /**
     * 设置当前页
     */
    public setCurrent(current: number): void {
        this.$data.current = current;
        this.calculateVisiblePages();
    }

    /**
     * 获取当前页
     */
    public getCurrent(): number {
        return this.$data.current;
    }
}

export default SolelyPagination;
export { SolelyPagination };
