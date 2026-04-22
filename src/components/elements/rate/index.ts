/**
 * Solely Rate 组件
 * 评分组件，用于展示或设置评分
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { RateProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-rate',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'value', type: 'number', default: 0 },
        { name: 'count', type: 'number' },
        { name: 'allowHalf', type: 'boolean', default: false },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'allowClear', type: 'boolean', default: false },
        { name: 'character', type: 'string' },
        { name: 'readonly', type: 'boolean', default: false },
    ],
})
class SolelyRate extends BaseElement<RateProps & { hoverValue: number | undefined; starCount: number[] }> {
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
        if (this.$data.disabled || this.$data.readonly) return;
        this.setValue(newValue);
    }

    /**
     * 获取 star class 对象
     */
    getStarClasses(i: number): Record<string, boolean> {
        const hoverValue = this.$data.hoverValue;
        const value = this.$data.value || 0;
        const currentValue = hoverValue !== undefined ? hoverValue : value;

        return {
            'rate__star--full': i <= currentValue,
            'rate__star--half': !!this.$data.allowHalf && i - 0.5 === currentValue,
            'rate__star--zero': i > currentValue,
        };
    }

    mounted(): void {
        this.$data.hoverValue = undefined;
        this.generateStarCount();
    }

    /**
     * 生成星星数量数组
     */
    generateStarCount(): void {
        const count = this.$data.count || 5;
        this.$data.starCount = Array.from({ length: count }, (_, i) => i + 1);
    }

    /**
     * 点击评分
     */
    handleClick(index: number): void {
        if (this.$data.disabled || this.$data.readonly) return;

        const newValue = this.$data.allowHalf ? this.$data.hoverValue || index : index;

        // 如果允许清除且点击的是当前值，则清除
        if (this.$data.allowClear && newValue === this.$data.value) {
            this.$data.value = 0;
        } else {
            this.$data.value = newValue;
        }

        this.$data.hoverValue = undefined;

        // 手动派发原生 change 事件
        this.dispatchEvent(
            new Event('change', {
                bubbles: true,
                composed: true,
            }),
        );
    }

    /**
     * 鼠标进入
     */
    handleMouseEnter(index: number): void {
        if (this.$data.disabled || this.$data.readonly) return;

        this.$data.hoverValue = index;
    }

    /**
     * 鼠标离开
     */
    handleMouseLeave(): void {
        if (this.$data.disabled || this.$data.readonly) return;

        this.$data.hoverValue = undefined;
    }

    /**
     * 设置评分值
     */
    public setValue(value: number): void {
        this.$data.value = value;
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
