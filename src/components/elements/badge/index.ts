/**
 * Solely Badge 组件
 * 徽标数组件，用于显示数字、小红点或状态点
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { BadgeProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

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
        { name: 'title', type: 'string', default: '' },
        { name: 'offset', type: 'string', default: '' },
        { name: 'color', type: 'string', default: '' },
    ],
})
class SolelyBadge extends BaseElement<BadgeProps> {
    /**
     * 获取 badge class 对象
     */
    getBadgeClasses(): Record<string, boolean> {
        return {
            'badge--zero': this.$data.count === 0 && !this.$data.dot,
        };
    }

    /**
     * 获取 status dot class 对象
     */
    getStatusDotClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.status) {
            classes[`badge__status-dot--${this.$data.status}`] = true;
        }
        return classes;
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
