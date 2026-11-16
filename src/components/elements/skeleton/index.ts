/**
 * Solely Skeleton 组件
 * 骨架屏组件，用于在内容加载时显示占位图
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { oneOf } from '../../../shared/enum';
import type { SkeletonProps, SkeletonAvatarShape, SkeletonAvatarPosition } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

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
        { name: 'avatarPosition', type: 'string', default: 'left' },
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
        return { [`skeleton__avatar--${this.getAvatarShape()}`]: true };
    }

    /** 头像形状（非法值回退 circle） */
    getAvatarShape(): SkeletonAvatarShape {
        return oneOf(this.$data.avatarShape, ['circle', 'square'], 'circle');
    }

    /** 头像位置（非法值回退 left） */
    getAvatarPosition(): SkeletonAvatarPosition {
        return oneOf(this.$data.avatarPosition, ['left', 'right'], 'left');
    }

    /**
     * 组件挂载后
     */
    mounted(): void {
        this.refresh();
        this.updateAriaBusy();
    }

    updated(): void {
        this.updateAriaBusy();
    }

    /**
     * 同步 aria-busy，向辅助技术说明当前区域仍在加载
     */
    private updateAriaBusy(): void {
        this.setAttribute('aria-busy', this.$data.loading ? 'true' : 'false');
    }

    /**
     * 获取 header class 对象
     */
    getHeaderClasses(): Record<string, boolean> {
        return {
            'skeleton__header--right': this.getAvatarPosition() === 'right',
        };
    }

    /**
     * 标题占位宽度：纯数字（number 或数字字符串）补 `px`，其余按 CSS 值原样使用。
     */
    getTitleWidthStyle(): string {
        const width = this.$data.titleWidth;
        if (!width) return '';
        return /^\d+(\.\d+)?$/.test(String(width).trim()) ? `width: ${String(width).trim()}px` : `width: ${width}`;
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
