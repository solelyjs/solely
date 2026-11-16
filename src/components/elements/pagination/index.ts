/**
 * Solely Pagination 组件
 * 分页组件，用于数据分页展示
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import type { PaginationProps, PaginationSize } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';
import { safeJsonParse } from '../utils/helpers';

@CustomElement({
    tagName: 'solely-pagination',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'current', type: 'number', default: 1 },
        { name: 'total', type: 'number', default: 0 },
        { name: 'pageSize', type: 'number', default: 10 },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'simple', type: 'boolean', default: false },
        { name: 'showQuickJumper', type: 'boolean', default: false },
        { name: 'showSizeChanger', type: 'boolean', default: false },
        { name: 'pageSizeOptions', type: 'string', default: '[10, 20, 50, 100]' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'showTotal', type: 'boolean', default: false },
    ],
})
class SolelyPagination extends BaseElement<PaginationProps> {
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): PaginationSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

    /** 归一化为整数，非法输入回退到 fallback */
    #toInt(value: unknown, fallback: number): number {
        const next = Number(value);
        return Number.isFinite(next) ? Math.floor(next) : fallback;
    }

    /** 页码上限：total 为 0 时仍允许 current 停留在 1 */
    #pageLimit(total: number, pageSize: number): number {
        return Math.max(1, Math.ceil((total || 0) / (pageSize || 10)));
    }

    /** 把 current 夹取到 [1, pageLimit] */
    #clampCurrent(current: number, total: number, pageSize: number): number {
        return Math.min(Math.max(1, this.#toInt(current, 1)), this.#pageLimit(total, pageSize));
    }

    /**
     * 供展示、高亮、禁用态与页码计算统一使用的有效当前页。
     * 越界时以钳制值为准，避免"展示页 1、高亮页 9"的漂移。
     */
    getEffectiveCurrent(): number {
        return this.#clampCurrent(this.$data.current, this.$data.total, this.$data.pageSize);
    }

    #emitChange(current: number, pageSize: number): void {
        this.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true,
                detail: { current, pageSize },
            }),
        );
    }

    /**
     * 暴露 current 属性，使外部可通过 event.target.current 访问
     */
    get current(): number {
        return this.$data.current;
    }

    set current(value: number) {
        const normalized = Math.max(1, this.#toInt(value, this.$data.current || 1));
        if (normalized === this.$data.current) return;
        this.$data.current = normalized;
        // 框架初始化/attribute 同步/属性升级期间不派发业务事件
        if (this.isSyncingProps) return;
        this.#emitChange(normalized, this.$data.pageSize);
    }

    /**
     * 暴露 pageSize 属性
     */
    get pageSize(): number {
        return this.$data.pageSize;
    }

    set pageSize(value: number) {
        const normalized = Math.max(1, this.#toInt(value, this.$data.pageSize || 10));
        if (normalized === this.$data.pageSize) return;
        this.$data.pageSize = normalized;
        // pageSize 变化后当前页可能越界，需要夹取
        const clamped = this.#clampCurrent(this.$data.current, this.$data.total, normalized);
        if (clamped !== this.$data.current) this.$data.current = clamped;
        // 框架初始化/attribute 同步/属性升级期间不派发业务事件
        if (this.isSyncingProps) return;
        this.#emitChange(clamped, normalized);
    }

    /**
     * 暴露 total 属性。total 变化后当前页可能越界，需要夹取并同步到事件 detail。
     */
    get total(): number {
        return this.$data.total;
    }

    set total(value: number) {
        const previous = this.$data.current;
        const normalized = Math.max(0, this.#toInt(value, this.$data.total || 0));
        if (normalized === this.$data.total) return;
        this.$data.total = normalized;
        const clamped = this.#clampCurrent(previous, normalized, this.$data.pageSize);
        if (clamped !== previous) this.$data.current = clamped;
        // 框架初始化/attribute 同步/属性升级期间不派发业务事件
        if (this.isSyncingProps || clamped === previous) return;
        this.#emitChange(clamped, this.$data.pageSize);
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
        classes['pagination--simple'] = !!this.$data.simple;
        return classes;
    }

    /**
     * 获取 prev class 对象
     */
    getPrevClasses(): Record<string, boolean> {
        return {
            'pagination__item--disabled': this.$data.disabled || this.getEffectiveCurrent() <= 1,
        };
    }

    /**
     * 获取 next class 对象
     */
    getNextClasses(): Record<string, boolean> {
        return {
            'pagination__item--disabled': this.$data.disabled || this.getEffectiveCurrent() >= this.totalPages,
        };
    }

    /**
     * 上一页 / 下一页的焦点顺序
     *
     * 到达边界后与 aria-disabled 保持一致，从 Tab 序列中移除；
     * 返回字符串以避免数字 -1 与默认 tabIndex 相等而被渲染层跳过写 attribute。
     */
    getPrevTabIndex(): string {
        return this.$data.disabled || this.getEffectiveCurrent() <= 1 ? '-1' : '0';
    }

    getNextTabIndex(): string {
        return this.$data.disabled || this.getEffectiveCurrent() >= this.totalPages ? '-1' : '0';
    }

    /**
     * 获取 item class 对象
     */
    getItemClasses(page: number | string): Record<string, boolean> {
        return {
            'pagination__item--active': page === this.getEffectiveCurrent(),
        };
    }

    mounted(): void {
        this.refresh();
        this.$data.jumperValue = '';
    }

    /**
     * 每页条数选项。
     *
     * 当前 pageSize 必须出现在选项里：否则 <select> 中没有任何 option 带 selected，
     * 浏览器会回退选中第一项，出现「下拉显示 10 条/页、实际每页 2 条」的错位。
     * 这里按最新 pageSize / pageSizeOptions 实时计算，属性后续变化也能同步，
     * 且不写回 $data，避免触发额外的渲染循环。
     */
    getPageSizeOptions(): number[] {
        const fallback = [10, 20, 50, 100];
        const parsed = safeJsonParse<unknown>(this.$data.pageSizeOptions, fallback);
        const options = Array.isArray(parsed)
            ? parsed.map(Number).filter(value => Number.isFinite(value) && value > 0)
            : fallback;
        const current = this.$data.pageSize || 10;
        return Array.from(new Set([...options, current])).sort((a, b) => a - b);
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
    calculateVisiblePages(): (number | string)[] {
        const current = this.getEffectiveCurrent();
        const total = this.totalPages;
        const pages: (number | string)[] = [];

        if (this.$data.simple) {
            // 简单模式：只保留首页、当前页、末页，中间缺口用省略号压缩
            const candidates = [1, current, total].filter(page => page >= 1 && page <= total);
            const unique = Array.from(new Set(candidates)).sort((a, b) => a - b);
            unique.forEach((page, index) => {
                if (index > 0 && page - unique[index - 1] > 1) {
                    pages.push('...');
                }
                pages.push(page);
            });
            return pages;
        }

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

        return pages;
    }

    /**
     * 页码点击
     */
    handlePageClick(page: number): void {
        if (this.$data.disabled) return;

        const target = this.#toInt(page, this.$data.current || 1);
        if (target < 1 || target > this.#pageLimit(this.$data.total, this.$data.pageSize)) return;
        if (target === this.$data.current) return;

        this.$data.current = target;
        this.#emitChange(target, this.$data.pageSize);
    }

    /**
     * 页码键盘激活（Enter / Space）
     */
    handlePageKeydown(page: number, event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.handlePageClick(page);
    }

    /**
     * 上一页
     */
    handlePrev(): void {
        if (this.$data.disabled) return;

        const current = this.getEffectiveCurrent();
        if (current <= 1) return;

        this.handlePageClick(current - 1);
    }

    /**
     * 上一页键盘激活（Enter / Space）
     */
    handlePrevKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.handlePrev();
    }

    /**
     * 下一页
     */
    handleNext(): void {
        if (this.$data.disabled) return;

        const current = this.getEffectiveCurrent();
        if (current >= this.totalPages) return;

        this.handlePageClick(current + 1);
    }

    /**
     * 下一页键盘激活（Enter / Space）
     */
    handleNextKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.handleNext();
    }

    /**
     * 每页条数改变
     *
     * 事件契约：change 与 size-change 各派发一次，detail 均为
     * `{ current, pageSize }`。show-size-change 作为兼容别名保留（已废弃）。
     */
    handleSizeChange(event: Event): void {
        if (this.$data.disabled) return;

        const select = event.target as HTMLSelectElement;
        const nextPageSize = Math.max(1, this.#toInt(select.value, this.$data.pageSize || 10));

        // 与当前 pageSize 相同时视为无变化，不派发任何事件
        if (nextPageSize === this.$data.pageSize) return;

        this.$data.pageSize = nextPageSize;
        this.$data.current = 1;

        const detail = { current: 1, pageSize: nextPageSize };
        this.#emitChange(detail.current, detail.pageSize);
        this.emit('size-change', detail);
        // 兼容旧监听：与 size-change 完全等价，后续版本将移除
        this.emit('show-size-change', detail);
    }

    /**
     * 快速跳转
     */
    handleJumperKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter') return;
        // 避免跳页输入框在 form 内触发提交
        event.preventDefault();

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

        const current = this.getEffectiveCurrent();
        const newPage = current + step;
        if (newPage >= 1 && newPage <= this.totalPages) {
            this.handlePageClick(newPage);
            this.$data.jumperValue = String(newPage);
        }
    }

    /**
     * 快速跳转步进键盘激活（Enter / Space）
     */
    handleJumperStepKeydown(step: number, event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.handleJumperStep(step);
    }

    /**
     * 设置当前页
     */
    public setCurrent(current: number): void {
        this.$data.current = Math.max(1, this.#toInt(current, this.$data.current || 1));
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
