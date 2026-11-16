/**
 * Solely FAB (Floating Action Button) 悬浮按钮组件
 * 固定在页面某个位置的悬浮操作按钮
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { normalizeSize, type SizeInput } from '../../../shared/size';
import type { FabProps, FabRefs, FabPosition, FabSize } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

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
    /** 统一尺寸语义：middle / default 归一为 medium */
    get size(): FabSize {
        return normalizeSize(this.$data.size);
    }

    set size(value: SizeInput) {
        this.$data.size = normalizeSize(value);
    }

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
     * 组件挂载后
     */
    mounted(): void {
        this.refresh();
    }

    /**
     * 获取 FAB 内联样式
     */
    getFabStyles(): Record<string, string> {
        const styles: Record<string, string> = {};

        // 偏移距离（0 是合法值，不能用 || 回退到默认值）
        const offsetX = this.$data.offsetX;
        const offsetY = this.$data.offsetY;
        styles['--fab-offset-x'] = `${Number.isFinite(offsetX) ? offsetX : 24}px`;
        styles['--fab-offset-y'] = `${Number.isFinite(offsetY) ? offsetY : 24}px`;

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
        this.setVisible(true);
    }

    /**
     * 隐藏 FAB
     */
    public hide(): void {
        this.setVisible(false);
    }

    /**
     * 切换显示/隐藏
     */
    public toggle(): void {
        this.setVisible(!this.$data.visible);
    }

    /**
     * 统一处理可见性：隐藏会加上 aria-hidden，必须先移走焦点。
     * 否则点击隐藏（hideOnClick）时按钮仍持有焦点，Chrome 会拦下 aria-hidden 并告警。
     */
    private setVisible(next: boolean): void {
        if (!next) {
            const button = this.$refs.buttonRef as HTMLElement | undefined;
            const active = (this.shadowRoot ?? document).activeElement;
            if (button && active === button) button.blur();
        }
        this.$data.visible = next;
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
    public focus(options?: FocusOptions): void {
        this.$refs.buttonRef?.focus(options);
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
