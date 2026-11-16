/**
 * Solely Slider 组件
 * 滑动输入条组件，用于在范围内选择数值
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { parseBooleanAttribute } from '../../../shared/boolean';
import type { SliderProps } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

/** manifest default 工厂的宿主能力（value 默认值依赖 range / min） */
interface SliderDefaultHost {
    $data: { min?: number; range?: boolean };
    getAttribute(name: string): string | null;
    hasAttribute(name: string): boolean;
}

/**
 * value 默认值：单值模式为 min，range 模式为 [min, min]。
 * 工厂直接读取 attribute，避免受 manifest 中 prop 的遍历顺序影响。
 */
function resolveValueDefault(host: SliderDefaultHost): number | [number, number] {
    const attrMin = host.getAttribute('min');
    const dataMin = host.$data.min;
    let min = 0;
    if (typeof dataMin === 'number' && Number.isFinite(dataMin)) {
        min = dataMin;
    } else if (attrMin !== null && Number.isFinite(Number(attrMin))) {
        min = Number(attrMin);
    }
    const range = host.$data.range ?? parseBooleanAttribute(host.getAttribute('range'));
    return range ? [min, min] : min;
}

@CustomElement({
    tagName: 'solely-slider',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'value', type: 'number', default: (host: SliderDefaultHost) => resolveValueDefault(host) },
        { name: 'min', type: 'number', default: 0 },
        { name: 'max', type: 'number', default: 100 },
        { name: 'step', type: 'number', default: 1 },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'tooltipVisible', type: 'boolean', default: true },
        { name: 'range', type: 'boolean', default: false },
        { name: 'marks', type: 'boolean', default: false },
        { name: 'marksData', type: 'object', default: {} },
        { name: 'vertical', type: 'boolean', default: false },
        { name: 'block', type: 'boolean', default: false },
        { name: 'ariaLabel', type: 'string', default: '滑动输入条' },
    ],
})
class SolelySlider extends BaseElement<
    SliderProps & {
        isDragging: boolean;
        parsedMarks: Array<{ value: number; label: string; style: string }>;
    }
> {
    /** Tooltip 文本格式化函数（属性赋值方式使用，如 `el.tooltipFormatter = v => v + '%'`） */
    tooltipFormatter?: (value: number) => string;

    railElement?: HTMLElement;
    /** range 模式下当前拖拽的滑块索引（0 起始 / 1 结束） */
    private dragIndex = 0;
    /** 本次拖拽开始时的值，用于判断 mouseup / touchend 是否需要派发 change */
    private dragStartValue?: number | [number, number];
    private dragMoveHandler?: (e: MouseEvent) => void;
    private dragUpHandler?: () => void;
    private touchMoveHandler?: (e: TouchEvent) => void;
    private touchEndHandler?: () => void;

    /**
     * 获取 slider class 对象
     */
    getSliderClasses(): Record<string, boolean> {
        return {
            'slider--vertical': !!this.$data.vertical,
            'is-disabled': !!this.$data.disabled,
        };
    }

    /**
     * 暴露 value 属性，使外部可通过 event.target.value 访问
     * range 模式下返回 [起始值, 结束值]
     */
    get value(): number | [number, number] {
        return this.getValue();
    }

    set value(newValue: number | number[]) {
        // 框架初始化 / attribute → state 同步属于内部写入，不能被 disabled 拦截：
        // 否则 <solely-slider disabled value="50"> 会因属性顺序（disabled 先于 value）丢掉初始值。
        // 交互层的拦截由 handleMouseDown / handleTouchStart / 键盘处理各自负责。
        if (!this.isSyncingProps && this.$data.disabled) return;
        this.setValue(newValue);
    }

    /**
     * 是否为双滑块范围模式
     */
    isRange(): boolean {
        return !!this.$data.range;
    }

    /**
     * 归一化 range 值：裁剪到 [min, max] 并保证升序
     */
    getRangeValues(): [number, number] {
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        const raw = this.$data.value;
        const source = Array.isArray(raw) ? raw : [min, raw ?? min];
        const clamp = (n: number) => Math.max(min, Math.min(max, Number(n)));
        const first = clamp(source[0] ?? min);
        const second = clamp(source[1] ?? max);
        return first <= second ? [first, second] : [second, first];
    }

    /**
     * 归一化单个值
     */
    private normalizeValue(value: number): number {
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        if (!Number.isFinite(value)) return min;
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Tooltip 文本（支持 tooltipFormatter 自定义格式化）
     */
    getTooltipText(value: number): string {
        return this.tooltipFormatter ? String(this.tooltipFormatter(value)) : String(value);
    }

    /**
     * range 模式下的滑块索引列表
     */
    getHandleIndexes(): number[] {
        return this.isRange() ? [0, 1] : [0];
    }

    /**
     * 指定滑块的数值（range 模式下按索引，单值模式恒为当前值）
     */
    getHandleValue(index: number): number {
        return this.isRange() ? this.getRangeValues()[index] : (this.getValue() as number);
    }

    /**
     * 滑块上的 mousedown：阻止冒泡到轨道，避免重复解析拖拽目标
     */
    handleHandleMouseDown(event: MouseEvent, index: number): void {
        event.stopPropagation();
        this.handleMouseDown(event, index);
    }

    /**
     * 滑块上的 touchstart：阻止冒泡到轨道
     */
    handleHandleTouchStart(event: TouchEvent, index: number): void {
        event.stopPropagation();
        this.handleTouchStart(event, index);
    }

    /**
     * 获取 handle class 对象
     */
    getHandleClasses(): Record<string, boolean> {
        return {
            'slider__handle--dragging': !!this.$data.isDragging,
        };
    }

    mounted(): void {
        this.$data.isDragging = false;

        // range 模式下 value 必须是数组；单值传入时补成 [min, min]
        if (this.$data.range && !Array.isArray(this.$data.value)) {
            const min = this.$data.min ?? 0;
            this.$data.value = [min, min];
        }

        this.refresh();
        this.railElement = this.shadowRoot?.querySelector('.slider__rail') as HTMLElement;
    }

    unmounted(): void {
        this.cleanupDragListeners();
    }

    /** 记录拖拽起始值（深拷贝数组，避免后续原地修改影响比较） */
    private rememberDragStart(): void {
        const current = this.getValue();
        this.dragStartValue = Array.isArray(current) ? [current[0], current[1]] : current;
    }

    /**
     * 结束拖拽：仅当值相对起始值发生变化时派发一次 change，
     * 单击轨道但未移动（松手回到原值）不再派发空 change。
     */
    private finishDrag(): void {
        const start = this.dragStartValue;
        this.dragStartValue = undefined;
        if (start === undefined) return;

        const current = this.getValue();
        const changed = Array.isArray(start)
            ? !Array.isArray(current) || start[0] !== current[0] || start[1] !== current[1]
            : Array.isArray(current) || start !== current;
        if (!changed) return;

        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    private cleanupDragListeners(): void {
        if (this.dragMoveHandler) {
            document.removeEventListener('mousemove', this.dragMoveHandler);
            this.dragMoveHandler = undefined;
        }
        if (this.dragUpHandler) {
            document.removeEventListener('mouseup', this.dragUpHandler);
            this.dragUpHandler = undefined;
        }
        if (this.touchMoveHandler) {
            document.removeEventListener('touchmove', this.touchMoveHandler);
            this.touchMoveHandler = undefined;
        }
        if (this.touchEndHandler) {
            document.removeEventListener('touchend', this.touchEndHandler);
            this.touchEndHandler = undefined;
        }
    }

    updated(): void {
        this.updateAriaAttributes();
    }

    private updateAriaAttributes(): void {
        const range = this.isRange();
        const railEl = this.shadowRoot?.querySelector('.slider__rail') as HTMLElement | null;
        if (railEl) {
            railEl.setAttribute('aria-disabled', this.$data.disabled ? 'true' : 'false');
            if (range) {
                // range 模式下轨道只是分组容器，数值语义由各滑块承担
                railEl.removeAttribute('aria-valuenow');
                railEl.removeAttribute('aria-valuemin');
                railEl.removeAttribute('aria-valuemax');
                railEl.removeAttribute('aria-valuetext');
            }
        }

        const handles = Array.from(this.shadowRoot?.querySelectorAll('.slider__handle') || []) as HTMLElement[];
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        handles.forEach((handleEl, index) => {
            if (!range) {
                // 单滑块模式下滑块只是视觉手柄，避免与轨道形成重复的 slider 语义
                handleEl.removeAttribute('aria-valuenow');
                handleEl.removeAttribute('aria-valuemin');
                handleEl.removeAttribute('aria-valuemax');
                handleEl.removeAttribute('aria-valuetext');
                handleEl.removeAttribute('aria-disabled');
                handleEl.removeAttribute('aria-orientation');
                return;
            }
            const value = this.getRangeValues()[index];
            handleEl.setAttribute('aria-valuenow', String(value));
            handleEl.setAttribute('aria-valuemin', String(min));
            handleEl.setAttribute('aria-valuemax', String(max));
            handleEl.setAttribute('aria-valuetext', this.getTooltipText(value));
            handleEl.setAttribute('aria-disabled', this.$data.disabled ? 'true' : 'false');
        });
    }

    /**
     * 轨道的 tabindex：range 模式（分组容器）与禁用态都不进入 Tab 序列
     */
    getRailTabindex(): string {
        return this.$data.disabled || this.isRange() ? '-1' : '0';
    }

    /**
     * 单滑块模式下的无障碍名称
     */
    getAriaLabel(): string {
        return (this.$data.ariaLabel as string) || '滑动输入条';
    }

    /**
     * 轨道节点的 aria-valuenow（range 模式下由各滑块自行描述，轨道不再是 slider）
     */
    getAriaValueNow(): number | undefined {
        return this.isRange() ? undefined : (this.getValue() as number);
    }

    /**
     * 轨道节点的 aria-valuetext
     */
    getAriaValueText(): string {
        if (this.isRange()) {
            const [start, end] = this.getRangeValues();
            return `${this.getTooltipText(start)} - ${this.getTooltipText(end)}`;
        }
        return this.getTooltipText(this.getValue() as number);
    }

    /**
     * 获取解析后的刻度标记
     * marksData 的值可以是字符串 / 数字，也可以是 { label, style } 对象
     */
    getParsedMarks(): Array<{ value: number; label: string; style: string }> {
        if (!this.$data.marks) {
            return [];
        }

        try {
            const marks = this.$data.marksData;
            // 属性路径的历史数据可能是 JSON 字符串，非对象时直接视为无刻度
            if (!marks || typeof marks !== 'object') {
                return [];
            }
            return Object.entries(marks)
                .map(([value, item]) => {
                    const markValue = parseFloat(value);
                    if (Number.isNaN(markValue)) return null;
                    if (item && typeof item === 'object') {
                        const detail = item as { label?: unknown; style?: unknown };
                        return {
                            value: markValue,
                            label: String(detail.label ?? value),
                            style: String(detail.style ?? ''),
                        };
                    }
                    return { value: markValue, label: String(item), style: '' };
                })
                .filter((item): item is { value: number; label: string; style: string } => item !== null);
        } catch {
            return [];
        }
    }

    /**
     * 刻度标签附加样式（来自 marksData 的 { style }）
     */
    getMarkLabelStyle(mark: { style: string }): string {
        return mark.style || '';
    }

    /**
     * 刻度是否处于激活区间（range 模式下为两滑块之间）
     */
    isMarkActive(value: number): boolean {
        if (this.isRange()) {
            const [start, end] = this.getRangeValues();
            return value >= start && value <= end;
        }
        const single = Array.isArray(this.$data.value)
            ? (this.$data.value[0] ?? this.$data.min ?? 0)
            : (this.$data.value ?? this.$data.min ?? 0);
        return value <= single;
    }

    /**
     * 获取轨道样式（range 模式下是两滑块之间的区间）
     */
    getTrackStyle(): string {
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        if (this.isRange()) {
            const [start, end] = this.getRangeValues();
            const startPercent = max === min ? 0 : ((start - min) / (max - min)) * 100;
            const endPercent = max === min ? 0 : ((end - min) / (max - min)) * 100;
            if (this.$data.vertical) {
                return `bottom: ${startPercent}%; height: ${endPercent - startPercent}%;`;
            }
            return `left: ${startPercent}%; width: ${endPercent - startPercent}%;`;
        }
        const percent = this.getPercent();
        if (this.$data.vertical) {
            return `height: ${percent}%;`;
        }
        return `width: ${percent}%;`;
    }

    /**
     * 获取滑块样式（range 模式下按索引取对应滑块）
     */
    getHandleStyle(index?: number): string {
        if (this.isRange()) {
            const min = this.$data.min ?? 0;
            const max = this.$data.max ?? 100;
            const [start, end] = this.getRangeValues();
            const value = index === 1 ? end : start;
            const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
            return this.$data.vertical ? `bottom: ${percent}%;` : `left: ${percent}%;`;
        }
        const percent = this.getPercent();
        if (this.$data.vertical) {
            return `bottom: ${percent}%;`;
        }
        return `left: ${percent}%;`;
    }

    /**
     * 获取刻度标记样式
     */
    getMarkStyle(value: number): string {
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
        if (this.$data.vertical) {
            return `bottom: ${percent}%;`;
        }
        return `left: ${percent}%;`;
    }

    /**
     * 获取百分比
     */
    getPercent(): number {
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        const raw = Array.isArray(this.$data.value) ? this.$data.value[0] : this.$data.value;
        const value = Math.max(min, Math.min(max, raw ?? min));
        if (max === min) return 0;
        return ((value - min) / (max - min)) * 100;
    }

    private railRect?: DOMRect;

    /**
     * 判断拖拽应作用于哪个滑块（range 模式下取距离指针更近的滑块）
     */
    private resolveDragIndex(event: MouseEvent | Touch, index?: number): number {
        if (!this.isRange()) return 0;
        if (typeof index === 'number') return index;

        const rect = this.railElement?.getBoundingClientRect();
        if (!rect) return 0;

        const percent = this.$data.vertical
            ? 1 - (event.clientY - rect.top) / rect.height
            : (event.clientX - rect.left) / rect.width;
        const clamped = Math.max(0, Math.min(1, percent)) * 100;
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        const [start, end] = this.getRangeValues();
        const startPercent = max === min ? 0 : ((start - min) / (max - min)) * 100;
        const endPercent = max === min ? 0 : ((end - min) / (max - min)) * 100;

        return Math.abs(clamped - startPercent) <= Math.abs(clamped - endPercent) ? 0 : 1;
    }

    /**
     * 鼠标按下
     */
    handleMouseDown(event: MouseEvent, index?: number): void {
        if (this.$data.disabled) return;

        event.preventDefault();
        this.$data.isDragging = true;
        this.dragIndex = this.resolveDragIndex(event, index);
        this.rememberDragStart();

        if (this.railElement) {
            this.railRect = this.railElement.getBoundingClientRect();
        }

        this.updateValueFromRect(event);

        this.cleanupDragListeners();

        this.dragMoveHandler = (e: MouseEvent) => {
            if (this.$data.isDragging) {
                this.updateValueFromRect(e);
            }
        };

        this.dragUpHandler = () => {
            this.$data.isDragging = false;
            this.railRect = undefined;
            this.cleanupDragListeners();
            this.finishDrag();
        };

        document.addEventListener('mousemove', this.dragMoveHandler);
        document.addEventListener('mouseup', this.dragUpHandler);
    }

    /**
     * 触摸开始
     */
    handleTouchStart(event: TouchEvent, index?: number): void {
        if (this.$data.disabled) return;
        if (event.touches.length === 0) return;

        event.preventDefault();
        this.$data.isDragging = true;
        this.dragIndex = this.resolveDragIndex(event.touches[0], index);
        this.rememberDragStart();

        if (this.railElement) {
            this.railRect = this.railElement.getBoundingClientRect();
        }

        this.updateValueFromRect(event.touches[0]);

        this.cleanupDragListeners();

        this.touchMoveHandler = (e: TouchEvent) => {
            if (this.$data.isDragging && e.touches.length > 0) {
                this.updateValueFromRect(e.touches[0]);
            }
        };

        this.touchEndHandler = () => {
            this.$data.isDragging = false;
            this.railRect = undefined;
            this.cleanupDragListeners();
            this.finishDrag();
        };

        document.addEventListener('touchmove', this.touchMoveHandler);
        document.addEventListener('touchend', this.touchEndHandler);
    }

    /**
     * 键盘操作
     *
     * - ArrowRight / ArrowUp：增加一个 step
     * - ArrowLeft / ArrowDown：减少一个 step
     * - Home：跳到最小值
     * - End：跳到最大值
     */
    handleKeyDown(event: KeyboardEvent): void {
        if (this.$data.disabled) return;
        // range 模式下键盘事件由各滑块自己处理，避免冒泡到轨道后重复响应
        if (event.target !== event.currentTarget) return;
        if (this.isRange()) return;

        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        if (max === min) return;

        const step = this.$data.step || 1;
        const current = this.getValue() as number;
        let next: number;

        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowUp':
                next = current + step;
                break;
            case 'ArrowLeft':
            case 'ArrowDown':
                next = current - step;
                break;
            case 'Home':
                next = min;
                break;
            case 'End':
                next = max;
                break;
            default:
                return;
        }

        event.preventDefault();

        const clamped = this.snapToStep(next, step, min, max);
        if (clamped === current) return;

        this.$data.value = clamped;
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    /**
     * 获取 step 的小数位数，用于消除浮点误差
     */
    private getStepDecimals(step: number): number {
        const text = String(step);
        const exponentIndex = text.indexOf('e-');
        if (exponentIndex !== -1) {
            const fraction = text.slice(0, exponentIndex).split('.')[1]?.length ?? 0;
            return fraction + Number(text.slice(exponentIndex + 2));
        }
        return text.split('.')[1]?.length ?? 0;
    }

    /**
     * 按 step 网格对齐并限制在 [min, max] 内（与拖拽路径一致，并消除浮点误差）
     */
    private snapToStep(rawValue: number, step: number, min: number, max: number): number {
        const bounded = Math.max(min, Math.min(max, rawValue));
        const snapped = Math.round(bounded / step) * step;
        const decimals = Math.min(this.getStepDecimals(step), 20);
        const normalized = Number(snapped.toFixed(decimals));
        return Math.max(min, Math.min(max, normalized));
    }

    /**
     * 从缓存的 rect 更新值（性能优化版本）
     */
    updateValueFromRect(event: MouseEvent | Touch): void {
        if (!this.railRect) {
            // 如果没有缓存的 rect，使用原始方法
            this.updateValue(event);
            return;
        }

        const rect = this.railRect;
        const percent = this.$data.vertical
            ? 1 - (event.clientY - rect.top) / rect.height
            : (event.clientX - rect.left) / rect.width;

        this.applyPercent(percent);
    }

    /**
     * 更新值（原始方法，用于点击等单次操作）
     */
    updateValue(event: MouseEvent | Touch): void {
        // 确保 railElement 存在
        if (!this.railElement) {
            this.railElement = this.shadowRoot?.querySelector('.slider__rail') as HTMLElement;
        }
        if (!this.railElement) return;

        const rect = this.railElement.getBoundingClientRect();
        const percent = this.$data.vertical
            ? 1 - (event.clientY - rect.top) / rect.height
            : (event.clientX - rect.left) / rect.width;

        this.applyPercent(percent);
    }

    /**
     * 按指针位置百分比应用数值（单值 / 双滑块共用）
     */
    private applyPercent(percent: number): void {
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        const step = this.$data.step || 1;
        const clampedPercent = Math.max(0, Math.min(1, percent));
        const rawValue = min + clampedPercent * (max - min);
        const newValue = this.snapToStep(rawValue, step, min, max);

        if (this.isRange()) {
            const [start, end] = this.getRangeValues();
            let bounded = newValue;
            // 起始滑块不得越过结束滑块，反之亦然
            if (this.dragIndex === 0) {
                bounded = Math.min(bounded, end);
            } else {
                bounded = Math.max(bounded, start);
            }
            const next: [number, number] = this.dragIndex === 0 ? [bounded, end] : [start, bounded];
            const current = this.$data.value;
            if (!Array.isArray(current) || current[0] !== next[0] || current[1] !== next[1]) {
                this.$data.value = next;
                this.dispatchEvent(
                    new Event('input', {
                        bubbles: true,
                        composed: true,
                    }),
                );
            }
            return;
        }

        const current = Array.isArray(this.$data.value) ? this.$data.value[0] : this.$data.value;
        // 只有当值真正改变时才更新和派发事件
        if (current !== newValue) {
            this.$data.value = newValue;

            // 同时派发 input 事件用于实时更新
            this.dispatchEvent(
                new Event('input', {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    }

    /**
     * range 模式下单个滑块的键盘操作
     */
    handleRangeKeyDown(event: KeyboardEvent, index: number): void {
        if (this.$data.disabled) return;

        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        const step = this.$data.step || 1;
        const [start, end] = this.getRangeValues();
        const current = index === 0 ? start : end;
        // 起始滑块上限是结束值，结束滑块下限是起始值
        const lower = index === 0 ? min : start;
        const upper = index === 0 ? end : max;

        let rawNext: number;
        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowUp':
                rawNext = current + step;
                break;
            case 'ArrowLeft':
            case 'ArrowDown':
                rawNext = current - step;
                break;
            case 'Home':
                rawNext = lower;
                break;
            case 'End':
                rawNext = upper;
                break;
            default:
                return;
        }

        event.preventDefault();

        const next = this.snapToStep(Math.max(lower, Math.min(upper, rawNext)), step, min, max);
        if (next === current) return;

        this.$data.value = index === 0 ? [next, end] : [start, next];
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    /**
     * 设置值
     */
    public setValue(value: number | number[]): void {
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        if (this.isRange() && Array.isArray(value)) {
            const first = this.normalizeValue(Number(value[0]));
            const second = this.normalizeValue(Number(value[1]));
            this.$data.value = first <= second ? [first, second] : [second, first];
            return;
        }
        const single = Array.isArray(value) ? Number(value[0]) : Number(value);
        this.$data.value = Math.max(min, Math.min(max, this.normalizeValue(single)));
    }

    /**
     * 获取值
     */
    public getValue(): number | [number, number] {
        if (this.isRange()) {
            return this.getRangeValues();
        }
        const raw = Array.isArray(this.$data.value) ? this.$data.value[0] : this.$data.value;
        return this.normalizeValue(Number(raw ?? this.$data.min ?? 0));
    }
}

export default SolelySlider;
export { SolelySlider };
