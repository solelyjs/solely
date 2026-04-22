/**
 * Solely Skeleton 组件
 * 骨架屏组件，用于在内容加载时显示占位图
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { SkeletonProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-skeleton',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'active', type: 'boolean', default: false },
        { name: 'avatar', type: 'boolean', default: false },
        { name: 'avatarShape', type: 'string', default: 'circle' },
        { name: 'avatarSize', type: 'number', default: 40 },
        { name: 'title', type: 'boolean', default: false },
        { name: 'titleWidth', type: 'string', default: '' },
        { name: 'paragraphRows', type: 'number', default: 3 },
        { name: 'loading', type: 'boolean', default: true },
    ],
})
class SolelySkeleton extends BaseElement<SkeletonProps> {
    /**
     * 获取 skeleton class 对象
     */
    getSkeletonClasses(): Record<string, boolean> {
        return {
            'is-active': !!this.$data.active,
        };
    }

    /**
     * 获取 avatar class 对象
     */
    getAvatarClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};
        if (this.$data.avatarShape) {
            classes[`skeleton__avatar--${this.$data.avatarShape}`] = true;
        }
        return classes;
    }

    /**
     * 开始加载
     */
    public startLoading(): void {
        this.$data.loading = true;
    }

    /**
     * 结束加载
     */
    public finishLoading(): void {
        this.$data.loading = false;
    }

    /**
     * 设置加载状态
     */
    public setLoading(loading: boolean): void {
        this.$data.loading = loading;
    }
}

export default SolelySkeleton;
export { SolelySkeleton };
