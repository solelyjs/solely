/**
 * Solely Slider 组件
 * 滑动输入条组件，用于在范围内选择数值
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { SliderProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-slider',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'value', type: 'number' },
        { name: 'min', type: 'number' },
        { name: 'max', type: 'number' },
        { name: 'step', type: 'number' },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'tooltipVisible', type: 'boolean', default: true },
        { name: 'marks', type: 'boolean', default: false },
        { name: 'marksData', type: 'object', default: {} },
        { name: 'vertical', type: 'boolean', default: false },
        { name: 'block', type: 'boolean', default: false },
    ],
})
class SolelySlider extends BaseElement<
    SliderProps & {
        isDragging: boolean;
        parsedMarks: Array<{ value: number; label: string }>;
    }
> {
    railElement?: HTMLElement;

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
     */
    get value(): number {
        return this.$data.value ?? this.$data.min ?? 0;
    }

    set value(newValue: number) {
        if (this.$data.disabled) return;
        this.setValue(newValue);
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

        // 设置默认值
        if (this.$data.min === undefined) this.$data.min = 0;
        if (this.$data.max === undefined) this.$data.max = 100;
        if (this.$data.step === undefined) this.$data.step = 1;
        if (this.$data.value === undefined) this.$data.value = this.$data.min;
    }

    protected afterMount(): void {
        this.railElement = this.shadowRoot?.querySelector('.slider__rail') as HTMLElement;
    }

    /**
     * 获取解析后的刻度标记
     */
    getParsedMarks(): Array<{ value: number; label: string }> {
        if (!this.$data.marks) {
            return [];
        }

        try {
            const marks = this.$data.marksData || {};
            return Object.entries(marks).map(([value, label]) => ({
                value: parseFloat(value),
                label: String(label),
            }));
        } catch {
            return [];
        }
    }

    /**
     * 获取轨道样式
     */
    getTrackStyle(): string {
        const percent = this.getPercent();
        if (this.$data.vertical) {
            return `height: ${percent}%;`;
        }
        return `width: ${percent}%;`;
    }

    /**
     * 获取滑块样式
     */
    getHandleStyle(): string {
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
        const percent = ((value - min) / (max - min)) * 100;
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
        const value = Math.max(min, Math.min(max, this.$data.value ?? min));
        return ((value - min) / (max - min)) * 100;
    }

    private railRect?: DOMRect;

    /**
     * 鼠标按下
     */
    handleMouseDown(event: MouseEvent): void {
        if (this.$data.disabled) return;

        event.preventDefault();
        this.$data.isDragging = true;

        // 缓存轨道位置，避免每次移动都重新计算
        if (this.railElement) {
            this.railRect = this.railElement.getBoundingClientRect();
        }

        this.updateValueFromRect(event);

        const handleMouseMove = (e: MouseEvent) => {
            if (this.$data.isDragging) {
                this.updateValueFromRect(e);
            }
        };

        const handleMouseUp = () => {
            this.$data.isDragging = false;
            this.railRect = undefined;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            // 拖拽结束时派发 change 事件
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    /**
     * 触摸开始
     */
    handleTouchStart(event: TouchEvent): void {
        if (this.$data.disabled) return;
        if (event.touches.length === 0) return;

        event.preventDefault();
        this.$data.isDragging = true;

        // 缓存轨道位置
        if (this.railElement) {
            this.railRect = this.railElement.getBoundingClientRect();
        }

        this.updateValueFromRect(event.touches[0]);

        const handleTouchMove = (e: TouchEvent) => {
            if (this.$data.isDragging && e.touches.length > 0) {
                this.updateValueFromRect(e.touches[0]);
            }
        };

        const handleTouchEnd = () => {
            this.$data.isDragging = false;
            this.railRect = undefined;
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);

            // 拖拽结束时派发 change 事件
            this.dispatchEvent(
                new Event('change', {
                    bubbles: true,
                    composed: true,
                }),
            );
        };

        document.addEventListener('touchmove', handleTouchMove);
        document.addEventListener('touchend', handleTouchEnd);
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
        let percent: number;

        if (this.$data.vertical) {
            percent = 1 - (event.clientY - rect.top) / rect.height;
        } else {
            percent = (event.clientX - rect.left) / rect.width;
        }

        percent = Math.max(0, Math.min(1, percent));

        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        const rawValue = min + percent * (max - min);
        const step = this.$data.step || 1;
        const value = Math.round(rawValue / step) * step;

        const newValue = Math.max(min, Math.min(max, value));

        // 只有当值真正改变时才更新
        if (this.$data.value !== newValue) {
            this.$data.value = newValue;

            // 派发 input 事件用于实时更新
            this.dispatchEvent(
                new Event('input', {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
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
        let percent: number;

        if (this.$data.vertical) {
            percent = 1 - (event.clientY - rect.top) / rect.height;
        } else {
            percent = (event.clientX - rect.left) / rect.width;
        }

        percent = Math.max(0, Math.min(1, percent));

        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        const rawValue = min + percent * (max - min);
        const step = this.$data.step || 1;
        const value = Math.round(rawValue / step) * step;

        const newValue = Math.max(min, Math.min(max, value));

        // 只有当值真正改变时才更新和派发事件
        if (this.$data.value !== newValue) {
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
     * 设置值
     */
    public setValue(value: number): void {
        const min = this.$data.min ?? 0;
        const max = this.$data.max ?? 100;
        this.$data.value = Math.max(min, Math.min(max, value));
    }

    /**
     * 获取值
     */
    public getValue(): number {
        return this.$data.value ?? this.$data.min ?? 0;
    }
}

export default SolelySlider;
export { SolelySlider };
