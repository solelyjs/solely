/**
 * Solely Rate 组件
 * 评分组件，用于展示或设置评分
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { RateProps } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

@CustomElement({
    tagName: 'solely-rate',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'value', type: 'number', default: 0 },
        { name: 'count', type: 'number', default: 5 },
        { name: 'allowHalf', type: 'boolean', default: false },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'allowClear', type: 'boolean', default: false },
        { name: 'character', type: 'string', default: '★' },
        { name: 'readonly', type: 'boolean', default: false },
        { name: 'tooltips', type: 'string' },
    ],
})
class SolelyRate extends BaseElement<RateProps & { hoverValue: number | undefined; starCount: number[] }> {
    /** 是否处于按住拖动中（纯内部交互状态，不参与响应式数据） */
    private dragging = false;
    /** 拖动过程中的最新预览值 */
    private dragValue?: number;
    /** 拖动结束后紧随其后的 click 需吞掉，避免重复提交或误触发 allowClear */
    private suppressClick = false;
    private clearSuppressTimer?: ReturnType<typeof setTimeout>;

    /**
     * 获取 rate class 对象
     */
    getRateClasses(): Record<string, boolean> {
        return {
            'is-disabled': !!this.$data.disabled,
            'is-readonly': !!this.$data.readonly,
        };
    }

    /**
     * 暴露 value 属性，使外部可通过 event.target.value 访问
     */
    get value(): number {
        return this.$data.value || 0;
    }

    set value(newValue: number) {
        // 框架初始化 / attribute → state 同步属于内部写入，不能被 readonly / disabled 拦截：
        // 否则 <solely-rate readonly value="4.5"> 会因属性顺序（readonly 先于 value）丢掉初始值。
        // 交互层的拦截由 handleClick / handleKeyDown / 指针事件各自负责。
        if (!this.isSyncingProps && (this.$data.disabled || this.$data.readonly)) return;
        this.setValue(newValue);
    }

    /**
     * 归一化星星总数：负数 / 非数字 / 小数都收敛为非负整数
     */
    private resolveCount(): number {
        const raw = Number(this.$data.count ?? 5);
        return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 5;
    }

    /**
     * 归一化当前评分：裁剪到 [0, count]，避免 value > count 时视觉与 ARIA 不一致
     */
    private resolveValue(): number {
        const raw = Number(this.$data.value ?? 0);
        const count = this.resolveCount();
        return Number.isFinite(raw) ? Math.max(0, Math.min(count, raw)) : 0;
    }

    /**
     * 把实际存储的分值收敛到 [0, count]。
     * 之前只在渲染时用 resolveValue 裁剪，`value` / `getValue()` 仍会返回越界值，
     * 与视觉、ARIA 不一致；这里统一落库，保证 API 读取与展示同源。
     */
    private clampValue(): void {
        const current = Number(this.$data.value ?? 0);
        if (!Number.isFinite(current)) {
            this.$data.value = 0;
            return;
        }
        const clamped = Math.max(0, Math.min(this.resolveCount(), current));
        if (clamped !== current) this.$data.value = clamped;
    }

    /**
     * roving tabindex：只有对应当前评分的星（向上取整）进入 Tab 序列
     * 禁用时整组移出 Tab 序列（原生禁用 radio 不可聚焦）
     */
    getStarTabindex(i: number): string {
        if (this.$data.disabled) return '-1';

        const count = this.resolveCount();
        if (count === 0) return '-1';

        const value = this.resolveValue();
        const active = Math.min(count, Math.max(1, Math.ceil(value)));
        return i === active ? '0' : '-1';
    }

    /**
     * 星星的 aria-checked（半星向上取整归到对应整星；0 分时无选中项）
     */
    getStarAriaChecked(i: number): string {
        const value = this.resolveValue();
        if (value <= 0) return 'false';
        return i === Math.ceil(value) ? 'true' : 'false';
    }

    /**
     * 每颗星的提示文案
     */
    getTooltip(i: number): string {
        const raw = this.$data.tooltips;
        if (!raw) return `${i} 分`;
        let list: string[] = [];
        const trimmed = raw.trim();
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                list = Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
            } catch {
                list = [];
            }
        } else {
            list = trimmed.split(',').map(item => item.trim());
        }
        return list[i - 1] || `${i} 分`;
    }

    /**
     * 获取 star class 对象
     */
    getStarClasses(i: number): Record<string, boolean> {
        const hoverValue = this.$data.hoverValue;
        const value = this.resolveValue();
        const currentValue = hoverValue !== undefined ? hoverValue : value;

        return {
            'rate__star--full': i <= currentValue,
            'rate__star--half': !!this.$data.allowHalf && i - 0.5 === currentValue,
            'rate__star--zero': i > currentValue,
        };
    }

    mounted(): void {
        this.dragging = false;
        this.dragValue = undefined;
        // 初始属性（如 value="9"）可能超出 count，先归一化再渲染
        this.clampValue();
        this.refresh();
        this.$data.hoverValue = undefined;
        this.generateStarCount();
    }

    unmounted(): void {
        this.dragging = false;
        this.dragValue = undefined;
        if (this.clearSuppressTimer) {
            clearTimeout(this.clearSuppressTimer);
            this.clearSuppressTimer = undefined;
        }
        this.suppressClick = false;
    }

    updated(): void {
        this.updateAriaAttributes();
        // count 变更后同步星星数量
        if ((this.$data.starCount || []).length !== this.resolveCount()) {
            this.generateStarCount();
        }
    }

    private updateAriaAttributes(): void {
        const rateEl = this.shadowRoot?.querySelector('.rate') as HTMLElement;
        if (rateEl) {
            // radiogroup 只承担分组语义：aria-valuenow / min / max 不是该 role 的合法属性，
            // 当前分值由容器 aria-label 与各 radio 的 aria-checked 表达。
            rateEl.removeAttribute('aria-valuenow');
            rateEl.removeAttribute('aria-valuemin');
            rateEl.removeAttribute('aria-valuemax');
            rateEl.setAttribute('aria-disabled', this.$data.disabled ? 'true' : 'false');
            rateEl.setAttribute('aria-readonly', this.$data.readonly ? 'true' : 'false');
        }
    }

    /**
     * 生成星星数量数组
     */
    generateStarCount(): void {
        this.$data.starCount = Array.from({ length: this.resolveCount() }, (_, i) => i + 1);
        // count 调小后原分值可能越界，同步收敛
        this.clampValue();
    }

    /**
     * 指针所在的评分值（allowHalf 时左半边为半星）
     */
    private resolvePointerValue(index: number, event: MouseEvent): number {
        if (!this.$data.allowHalf) return index;

        const target = event.currentTarget as HTMLElement | null;
        const rect = target?.getBoundingClientRect();
        const width = rect?.width || target?.offsetWidth || 0;
        // 拿不到几何信息（如非布局环境）时不猜测半星，按整星处理
        if (!rect || width <= 0) return index;

        const offset = event.clientX - rect.left;
        if (!Number.isFinite(offset)) return index;

        return offset / width < 0.5 ? index - 0.5 : index;
    }

    /**
     * 容器级指针位置 → 评分值：跨星连续取值，口径与点击一致（allowHalf 下左半边为半星）
     * 拿不到布局信息（如非布局环境）时返回 undefined，回退到点击逻辑。
     */
    private resolveDragValue(event: PointerEvent): number | undefined {
        const stars = Array.from(this.shadowRoot?.querySelectorAll('.rate__star') || []) as HTMLElement[];
        const count = stars.length;
        if (count === 0) return undefined;

        const rects = stars.map(star => star.getBoundingClientRect());
        if (rects.every(rect => !rect.width)) return undefined;

        const x = event.clientX;
        if (!Number.isFinite(x)) return undefined;
        // 拖出左 / 右边界：0 分 / 满分，拖动过程中也能一路滑到两端
        if (x <= rects[0].left) return 0;
        if (x >= rects[count - 1].right) return count;

        let index = count;
        let rect = rects[count - 1];
        for (let n = 0; n < count; n++) {
            // 落在某颗星内，或落在两星之间的间隙（归入右侧星，避免预览断档）
            if (x <= rects[n].right) {
                index = n + 1;
                rect = rects[n];
                break;
            }
        }

        if (!rect.width) return index;
        if (!this.$data.allowHalf) return index;
        return (x - rect.left) / rect.width < 0.5 ? Math.max(0.5, index - 0.5) : index;
    }

    /**
     * 按下开始拖动：预览当前位置分值，并捕获指针以支持拖出组件范围
     */
    handlePointerDown(event: PointerEvent): void {
        if (this.$data.disabled || this.$data.readonly || event.button !== 0) return;

        const initial = this.resolveDragValue(event);
        if (initial === undefined) return;

        this.capturePointer(event, true);
        this.dragging = true;
        this.dragValue = initial;
        this.$data.hoverValue = initial;
    }

    /**
     * 拖动中：按指针位置连续预览
     */
    handlePointerMove(event: PointerEvent): void {
        if (!this.dragging || this.$data.disabled || this.$data.readonly) return;

        const next = this.resolveDragValue(event);
        if (next === undefined || next === this.dragValue) return;
        this.dragValue = next;
        this.$data.hoverValue = next;
    }

    /**
     * 松开：提交最终分值（只派发一次 change）
     */
    handlePointerUp(event: PointerEvent): void {
        if (!this.dragging) return;
        this.finishDrag(event, this.resolveDragValue(event) ?? this.dragValue, true);
    }

    /**
     * 指针取消：撤销预览，不提交
     */
    handlePointerCancel(event: PointerEvent): void {
        if (!this.dragging) return;
        this.finishDrag(event, undefined, false);
    }

    /** 捕获 / 释放指针，保证拖出组件后仍能收到 move / up */
    private capturePointer(event: PointerEvent, capture: boolean): void {
        const container = event.currentTarget as HTMLElement | null;
        const pointerId = event.pointerId;
        if (!container || typeof pointerId !== 'number') return;

        try {
            if (capture) {
                container.setPointerCapture?.(pointerId);
            } else if (container.hasPointerCapture?.(pointerId)) {
                container.releasePointerCapture?.(pointerId);
            }
        } catch {
            // 环境不支持指针捕获时忽略，仍可按点击 / 容器内的拖动工作
        }
    }

    /** 结束拖动：清状态、撤销预览、按需提交 */
    private finishDrag(event: PointerEvent, value: number | undefined, commit: boolean): void {
        this.dragging = false;
        this.dragValue = undefined;
        this.capturePointer(event, false);

        // pointerup 之后浏览器还会补一次 click，吞掉以免重复提交 / 误触发 allowClear；
        // 定时器兜底：拖到组件外松手时可能没有 click 派发，不能让标记一直留着。
        this.suppressClick = true;
        if (this.clearSuppressTimer) clearTimeout(this.clearSuppressTimer);
        this.clearSuppressTimer = setTimeout(() => {
            this.suppressClick = false;
            this.clearSuppressTimer = undefined;
        }, 0);

        if (commit && value !== undefined) {
            const step = this.$data.allowHalf ? 0.5 : 1;
            let next = value <= 0 ? (this.$data.allowClear ? 0 : step) : value;
            next = Math.max(0, Math.min(this.resolveCount(), next));
            if (this.$data.allowClear && next === this.$data.value) next = 0;

            this.$data.hoverValue = undefined;
            if (next !== this.$data.value) {
                this.$data.value = next;
                this.dispatchChangeEvent();
            }
            return;
        }

        this.$data.hoverValue = undefined;
    }

    /**
     * 点击评分
     */
    handleClick(index: number, event?: MouseEvent): void {
        // 本次点击已由 pointerdown / pointerup 拖动序列处理
        if (this.suppressClick) {
            this.suppressClick = false;
            return;
        }
        if (this.$data.disabled || this.$data.readonly) return;

        let newValue = event ? this.resolvePointerValue(index, event) : index;
        if (!event && this.$data.allowHalf) {
            newValue = this.$data.hoverValue ?? index;
        }

        // 如果允许清除且点击的是当前值，则清除
        if (this.$data.allowClear && newValue === this.$data.value) {
            newValue = 0;
        }

        this.$data.hoverValue = undefined;

        // 事件契约：值未变化时不派发 change
        if (newValue === this.$data.value) return;

        this.$data.value = newValue;
        this.dispatchChangeEvent();
    }

    /**
     * 鼠标进入
     */
    handleMouseEnter(index: number): void {
        if (this.dragging || this.$data.disabled || this.$data.readonly) return;

        this.$data.hoverValue = index;
    }

    /**
     * 鼠标移动（allowHalf 时按指针在星内的左右半边高亮半星 / 整星）
     */
    handleMouseMove(index: number, event: MouseEvent): void {
        // 拖动期间由容器级 pointermove 统一解析，避免半星预览被单星 mousemove 覆盖
        if (this.dragging || this.$data.disabled || this.$data.readonly) return;
        this.$data.hoverValue = this.resolvePointerValue(index, event);
    }

    /**
     * 鼠标离开
     */
    handleMouseLeave(): void {
        if (this.dragging || this.$data.disabled || this.$data.readonly) return;

        this.$data.hoverValue = undefined;
    }

    handleKeyDown(event: KeyboardEvent): void {
        if (this.$data.disabled || this.$data.readonly) return;

        const count = this.resolveCount();
        if (count === 0) return;
        const currentValue = this.resolveValue();
        const step = this.$data.allowHalf ? 0.5 : 1;
        let newValue: number;

        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowUp':
                newValue = Math.min(count, currentValue + step);
                break;
            case 'ArrowLeft':
            case 'ArrowDown':
                newValue = Math.max(0, currentValue - step);
                break;
            case 'Home':
                // Home 跳到可选最小值：不允许清除时最小为 1 星，而不是把评分清空
                newValue = this.$data.allowClear ? 0 : Math.min(1, count);
                break;
            case 'End':
                newValue = count;
                break;
            case 'Enter':
            case ' ':
            case 'Spacebar': {
                const index = Number((event.target as HTMLElement | null)?.dataset?.index);
                if (!index) return;
                newValue = Math.min(count, index);
                break;
            }
            default:
                return;
        }

        event.preventDefault();

        // 事件契约：到边界后继续按方向键不派发 change
        if (newValue === this.$data.value) return;

        this.$data.value = newValue;
        this.$data.hoverValue = undefined;
        this.dispatchChangeEvent();
        this.focusStar(newValue);
    }

    /**
     * 把焦点移到当前评分对应的星
     */
    private focusStar(value: number): void {
        const count = this.resolveCount();
        if (count === 0) return;
        const active = Math.min(count, Math.max(1, Math.ceil(value)));
        const stars = Array.from(this.shadowRoot?.querySelectorAll('.rate__star') || []) as HTMLElement[];
        stars[active - 1]?.focus();
    }

    private dispatchChangeEvent(): void {
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 设置评分值
     */
    public setValue(value: number): void {
        const raw = Number(value);
        if (!Number.isFinite(raw)) {
            this.$data.value = 0;
            return;
        }
        // 与展示 / ARIA 同口径收敛，避免 API 写入越界值后读取与视觉不一致
        this.$data.value = Math.max(0, Math.min(this.resolveCount(), raw));
    }

    /**
     * 获取评分值
     */
    public getValue(): number {
        return this.$data.value;
    }
}

export default SolelyRate;
export { SolelyRate };
