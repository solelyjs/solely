/**
 * Solely Progress 组件
 * 进度条组件，支持线性和圆形两种类型
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { ProgressProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-progress',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'line' },
        { name: 'percent', type: 'number', default: 0 },
        { name: 'status', type: 'string', default: 'normal' },
        { name: 'showInfo', type: 'boolean', default: true },
        { name: 'strokeWidth', type: 'number', default: 8 },
        { name: 'width', type: 'number', default: 120 },
        { name: 'format', type: 'string', default: '' },
    ],
})
class SolelyProgress extends BaseElement<ProgressProps> {
    /**
     * 获取 progress class 对象
     */
    getProgressClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.type) {
            classes[`progress--${this.$data.type}`] = true;
        }
        return classes;
    }

    /**
     * 获取 inner class 对象
     */
    getInnerClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.status) {
            classes[`progress__inner--${this.$data.status}`] = true;
        }
        return classes;
    }

    /**
     * 获取 circle path class 对象
     */
    getCirclePathClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.status) {
            classes[`progress__circle-path--${this.$data.status}`] = true;
        }
        return classes;
    }

    /**
     * 获取限制在 0-100 之间的百分比
     */
    get clampedPercent(): number {
        return Math.max(0, Math.min(100, this.$data.percent || 0));
    }

    /**
     * 获取圆形进度条的周长
     */
    get circleCircumference(): number {
        const width = this.$data.width || 120;
        const strokeWidth = this.$data.strokeWidth || 6;
        const radius = (width - strokeWidth) / 2;
        return 2 * Math.PI * radius;
    }

    /**
     * 获取圆形进度条的偏移量
     */
    get circleOffset(): number {
        return this.circleCircumference * (1 - this.clampedPercent / 100);
    }

    /**
     * 获取显示的文本
     */
    getText(): string {
        if (this.$data.status === 'success') {
            return '✓';
        }
        if (this.$data.status === 'exception') {
            return '✕';
        }
        return `${Math.round(this.clampedPercent)}%`;
    }

    /**
     * 设置进度
     */
    public setPercent(percent: number): void {
        this.$data.percent = percent;
    }

    /**
     * 获取进度
     */
    public getPercent(): number {
        return this.clampedPercent;
    }
}

export default SolelyProgress;
export { SolelyProgress };
