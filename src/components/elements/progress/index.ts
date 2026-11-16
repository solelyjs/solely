/**
 * Solely Progress 组件
 * 进度条组件，支持线性和圆形两种类型
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { oneOf } from '../../../shared/enum';
import { STATUS_ICON_PATHS } from '../../../shared/icons';
import type { ProgressProps, ProgressStatus, ProgressType } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

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
        { name: 'label', type: 'string', default: '' },
    ],
})
class SolelyProgress extends BaseElement<ProgressProps> {
    /** 进度条类型（非法值回退 line） */
    getType(): ProgressType {
        return oneOf(this.$data.type, ['line', 'circle'], 'line');
    }

    /** 进度条状态（非法值回退 normal） */
    getStatus(): ProgressStatus {
        return oneOf(this.$data.status, ['normal', 'success', 'exception', 'active'], 'normal');
    }

    getProgressClasses(): Record<string, boolean> {
        return { [`progress--${this.getType()}`]: true };
    }

    /**
     * 获取 inner class 对象（normal 为默认样式，不输出修饰类）
     */
    getInnerClasses(): Record<string, boolean> {
        const status = this.getStatus();
        return status === 'normal' ? {} : { [`progress__inner--${status}`]: true };
    }

    /**
     * 获取 circle path class 对象
     */
    getCirclePathClasses(): Record<string, boolean> {
        const status = this.getStatus();
        return status === 'normal' ? {} : { [`progress__circle-path--${status}`]: true };
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

    /** 成功 / 异常状态改用线性 SVG 图标 */
    hasStatusIcon(): boolean {
        const status = this.getStatus();
        return status === 'success' || status === 'exception';
    }

    getStatusIconPath(): string {
        return this.getStatus() === 'success' ? STATUS_ICON_PATHS.check : STATUS_ICON_PATHS.close;
    }

    /**
     * 获取显示的文本（成功 / 异常由线性图标承载，这里返回空串避免重复输出字符）
     */
    getText(): string {
        const status = this.getStatus();
        if (status === 'success' || status === 'exception') {
            return '';
        }

        const percent = Math.round(this.clampedPercent);
        const format = this.$data.format as string | ((percent: number) => string);

        // 兼容通过 JS 属性传入格式化函数（attribute 只能传出字符串模板）
        if (typeof format === 'function') {
            return format(percent);
        }

        // 字符串模板：{percent} 会被替换为不含 % 的数值
        if (typeof format === 'string' && format.trim()) {
            return format.replace(/\{percent\}/g, String(percent));
        }

        return `${percent}%`;
    }

    /**
     * 获取读屏使用的文本值
     * 仅圆形进度条补充 aria-valuetext（线性进度条由 aria-valuenow + 百分比语义表达）
     */
    getAriaValueText(): string | undefined {
        const status = this.getStatus();
        if (status === 'success') return '完成';
        if (status === 'exception') return '失败';
        if (this.getType() !== 'circle') return undefined;
        return `${Math.round(this.clampedPercent)}%`;
    }

    /**
     * 组件挂载后
     */
    mounted(): void {
        this.refresh();
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
