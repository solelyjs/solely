/**
 * Solely FAB (Floating Action Button) 悬浮按钮组件
 * 固定在页面某个位置的悬浮操作按钮
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { FabProps, FabRefs, FabPosition } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

@CustomElement({
    tagName: 'solely-fab',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'primary' },
        { name: 'size', type: 'string', default: 'medium' },
        { name: 'shape', type: 'string', default: 'circle' },
        { name: 'position', type: 'string', default: 'bottom-right' },
        { name: 'offsetX', type: 'number', default: 24 },
        { name: 'offsetY', type: 'number', default: 24 },
        { name: 'disabled', type: 'boolean', default: false },
        { name: 'icon', type: 'string', default: '' },
        { name: 'visible', type: 'boolean', default: true },
        { name: 'hideOnClick', type: 'boolean', default: false },
        { name: 'zIndex', type: 'number', default: 1000 },
        { name: 'absolute', type: 'boolean', default: false },
    ],
})
class SolelyFab extends BaseElement<FabProps, FabRefs> {
    /**
     * 获取 FAB class 对象
     */
    getFabClasses(): Record<string, boolean> {
        const classes: Record<string, boolean> = {};

        // 类型
        classes[`fab--${this.$data.type || 'primary'}`] = true;

        // 尺寸映射
        const size = this.$data.size || 'medium';
        if (size === 'small') {
            classes['fab--sm'] = true;
        } else if (size === 'large') {
            classes['fab--lg'] = true;
        } else {
            classes['fab--md'] = true;
        }

        // 形状
        classes[`fab--${this.$data.shape || 'circle'}`] = true;

        // 位置
        classes[`fab--${this.$data.position || 'bottom-right'}`] = true;

        // 状态
        classes['fab--hidden'] = !this.$data.visible;
        classes['fab--absolute'] = !!this.$data.absolute;

        return classes;
    }

    /**
     * 获取 FAB 内联样式
     */
    getFabStyles(): Record<string, string> {
        const styles: Record<string, string> = {};

        // 偏移距离
        styles['--fab-offset-x'] = `${this.$data.offsetX || 24}px`;
        styles['--fab-offset-y'] = `${this.$data.offsetY || 24}px`;

        // z-index
        if (this.$data.zIndex) {
            styles['z-index'] = String(this.$data.zIndex);
        }

        return styles;
    }

    /**
     * 检查是否有图标插槽内容
     */
    hasIconSlot(): boolean {
        return this.querySelector('[slot="icon"]') !== null;
    }

    /**
     * 点击事件处理
     */
    handleClick(event: MouseEvent): void {
        if (this.$data.disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // 如果设置了点击隐藏
        if (this.$data.hideOnClick) {
            this.hide();
        }
    }

    /**
     * 显示 FAB
     */
    public show(): void {
        this.$data.visible = true;
    }

    /**
     * 隐藏 FAB
     */
    public hide(): void {
        this.$data.visible = false;
    }

    /**
     * 切换显示/隐藏
     */
    public toggle(): void {
        this.$data.visible = !this.$data.visible;
    }

    /**
     * 设置位置
     */
    public setPosition(position: FabPosition): void {
        this.$data.position = position;
    }

    /**
     * 设置偏移
     */
    public setOffset(x: number, y: number): void {
        this.$data.offsetX = x;
        this.$data.offsetY = y;
    }

    /**
     * 聚焦按钮
     */
    public focus(): void {
        this.$refs.buttonRef?.focus();
    }

    /**
     * 失焦按钮
     */
    public blur(): void {
        this.$refs.buttonRef?.blur();
    }
}

export default SolelyFab;
export { SolelyFab };
