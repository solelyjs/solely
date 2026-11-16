/**
 * Solely Badge 组件
 * 徽标数组件，用于显示数字、小红点或状态点
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { oneOf } from '../../../shared/enum';
import type { BadgeProps, BadgeStatus } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

@CustomElement({
    tagName: 'solely-badge',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'count', type: 'number', default: 0 },
        { name: 'dot', type: 'boolean', default: false },
        { name: 'overflowCount', type: 'number', default: 99 },
        { name: 'status', type: 'string', default: '' },
        { name: 'text', type: 'string', default: '' },
        { name: 'offset', type: 'string', default: '' },
        { name: 'color', type: 'string', default: '' },
    ],
})
class SolelyBadge extends BaseElement<BadgeProps> {
    /** 状态类型（非法值回退 default） */
    getStatus(): BadgeStatus {
        return oneOf(this.$data.status, ['success', 'processing', 'default', 'error', 'warning'], 'default');
    }

    /**
     * 获取 status dot class 对象
     */
    getStatusDotClasses(): Record<string, boolean> {
        return { [`badge__status-dot--${this.getStatus()}`]: true };
    }

    /**
     * 解析 offset 偏移量，支持 "[x, y]" 数组、"x, y"、"x y" 等写法
     */
    private parseOffset(): [number, number] | null {
        const raw = this.$data.offset as unknown;

        if (Array.isArray(raw)) {
            const x = Number(raw[0]);
            const y = Number(raw[1]);
            if (raw.length < 2 || !Number.isFinite(x) || !Number.isFinite(y)) return null;
            return [x, y];
        }

        if (typeof raw !== 'string' || !raw.trim()) return null;

        const numbers = raw.match(/[-+]?(?:\d+\.?\d*|\d*\.\d+)/g);
        if (!numbers || numbers.length < 2) return null;

        const x = Number(numbers[0]);
        const y = Number(numbers[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

        return [x, y];
    }

    /**
     * 获取数字/小红点的内联样式（颜色 + offset 偏移）
     */
    getIndicatorStyle(): Record<string, string> {
        const styles: Record<string, string> = {};

        if (this.$data.color) {
            styles.backgroundColor = this.$data.color;
        }

        const offset = this.parseOffset();
        if (offset) {
            // 默认定位是 translate(50%, -50%)，在其基础上叠加 offset 像素
            styles.transform = `translate(calc(50% + ${offset[0]}px), calc(-50% + ${offset[1]}px))`;
        }

        return styles;
    }

    /**
     * 组件挂载后
     */
    mounted(): void {
        this.refresh();
    }

    /**
     * 设置数字
     */
    public setCount(count: number): void {
        this.$data.count = count;
    }

    /**
     * 增加数字
     */
    public increase(delta = 1): void {
        this.$data.count += delta;
    }

    /**
     * 减少数字
     */
    public decrease(delta = 1): void {
        this.$data.count = Math.max(0, this.$data.count - delta);
    }

    /**
     * 显示小红点
     */
    public showDot(): void {
        this.$data.dot = true;
    }

    /**
     * 隐藏小红点
     */
    public hideDot(): void {
        this.$data.dot = false;
    }
}

export default SolelyBadge;
export { SolelyBadge };
