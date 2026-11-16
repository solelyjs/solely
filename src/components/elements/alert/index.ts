/**
 * Solely Alert 组件
 * 警告提示组件，用于页面内展示重要的提示信息
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import { oneOf } from '../../../shared/enum';
import { STATUS_ICON_BY_TYPE, STATUS_ICON_PATHS } from '../../../shared/icons';
import type { AlertProps, AlertType } from './types';
import styles from './style.css?inline';
import template from './index.html?solely';

@CustomElement({
    tagName: 'solely-alert',
    template,
    styles: styles,
    shadowDOM: { use: true, mode: 'open' },
    props: [
        { name: 'type', type: 'string', default: 'info' },
        { name: 'message', type: 'string', default: '' },
        { name: 'description', type: 'string', default: '' },
        { name: 'closable', type: 'boolean', default: false },
        { name: 'showIcon', type: 'boolean', default: false },
        { name: 'icon', type: 'string', default: null },
        { name: 'block', type: 'boolean', default: false },
        { name: 'autoClose', type: 'number', default: 0 },
    ],
})
class SolelyAlert extends BaseElement<AlertProps & { closing: boolean }> {
    /** 自动关闭定时器 */
    private autoCloseTimer?: number;
    /** 关闭动画结束后的移除定时器 */
    private removeTimer?: number;
    /** 上一次生效的 autoClose 值，用于识别属性/属性变化 */
    private lastAutoClose: number | null = null;
    /** 监听 light DOM 插槽内容变化，驱动图标重渲染 */
    private iconSlotObserver?: MutationObserver;
    /** 自动关闭计时起点，用于 hover / focus 暂停后计算剩余时间 */
    private autoCloseStartedAt?: number;
    /** 暂停时可继续消耗的剩余时间 */
    private autoCloseRemaining?: number;

    /** 提示类型（非法值回退 info） */
    getType(): AlertType {
        return oneOf(this.$data.type, ['info', 'success', 'warning', 'error'], 'info');
    }

    /**
     * 获取 alert class 对象
     */
    getAlertClasses(): Record<string, boolean> {
        return {
            [`alert--${this.getType()}`]: true,
            'is-closing': this.$data.closing,
            'alert--block': !!this.$data.block,
        };
    }

    /**
     * 获取内置状态图标的 SVG path（线性图标，配合 .solely-linear-icon 使用）
     */
    getIcon(type: AlertProps['type']): string {
        const name = STATUS_ICON_BY_TYPE[type] ?? 'info';
        return STATUS_ICON_PATHS[name];
    }

    /**
     * 图标是否渲染：
     * showIcon=false 优先关闭；icon="" 且未提供 icon 插槽时也不渲染。
     */
    shouldRenderIcon(): boolean {
        if (!this.$data.showIcon) return false;
        if (this.$data.icon === '') return this.hasIconSlot();
        return true;
    }

    /** 用户自定义的图标文本（未设置时为空，改由内置线性 SVG 承载） */
    getIconText(): string {
        return this.$data.icon ?? '';
    }

    /** 是否传了自定义图标文本 */
    hasCustomIcon(): boolean {
        return typeof this.$data.icon === 'string' && this.$data.icon.length > 0;
    }

    /**
     * 是否提供了 icon 插槽内容
     * 直接读取 light DOM：icon="" 未渲染图标包装时 shadow DOM 里还没有对应 slot，
     * 无法通过 slotchange 感知插槽内容，因此以宿主子节点为准。
     */
    private hasIconSlot(): boolean {
        return !!this.querySelector('[slot="icon"]');
    }

    /**
     * 组件挂载后
     */
    mounted(): void {
        this.refresh();

        // 监听 light DOM 的插槽内容增删，保证 icon="" 下补充插槽也能显示图标
        this.iconSlotObserver = new MutationObserver(() => this.refresh());
        this.iconSlotObserver.observe(this, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['slot'],
        });

        // 关闭动画期间节点被移动：重新挂载后继续完成移除，避免永久停留在 closing 状态
        if (this.$data.closing) {
            this.scheduleRemoval();
        } else {
            this.scheduleAutoClose();
        }

        // 记录已生效的配置，避免随后的首次 updated() 重复排期
        this.lastAutoClose = this.getAutoCloseDelay();
    }

    /**
     * 属性或 property 变化后重新计算自动关闭定时器
     */
    updated(): void {
        const delay = this.getAutoCloseDelay();
        if (delay === this.lastAutoClose) return;

        this.lastAutoClose = delay;
        // 正在关闭过程中时不再重新开定时器
        if (!this.$data.closing) {
            this.scheduleAutoClose();
        }
    }

    /**
     * 获取归一化后的自动关闭延时（非法值或 <= 0 视为不自动关闭）
     */
    private getAutoCloseDelay(): number {
        const delay = Number(this.$data.autoClose);
        return Number.isFinite(delay) && delay > 0 ? delay : 0;
    }

    /**
     * 按 autoClose 延时自动关闭；事件被 preventDefault() 时不会移除组件
     */
    private scheduleAutoClose(delay = this.getAutoCloseDelay()): void {
        this.clearAutoCloseTimer();

        if (delay <= 0) return;

        this.autoCloseRemaining = delay;
        this.autoCloseStartedAt = Date.now();
        this.autoCloseTimer = setTimeout(() => {
            this.autoCloseTimer = undefined;
            this.autoCloseRemaining = undefined;
            this.handleClose('auto');
        }, delay) as unknown as number;
    }

    /**
     * hover / focus 期间暂停自动关闭，并记录剩余时间（WCAG 2.2.1 可暂停）
     */
    handlePauseAutoClose(): void {
        if (!this.autoCloseTimer || this.$data.closing) return;
        const elapsed = this.autoCloseStartedAt ? Date.now() - this.autoCloseStartedAt : 0;
        this.autoCloseRemaining = Math.max(0, (this.autoCloseRemaining ?? 0) - elapsed);
        this.clearAutoCloseTimer();
    }

    /**
     * 指针/焦点离开后，用剩余时间继续倒计时
     */
    handleResumeAutoClose(): void {
        if (this.$data.closing || !this.autoCloseRemaining || this.getAutoCloseDelay() <= 0) return;
        this.scheduleAutoClose(this.autoCloseRemaining);
    }

    /** focusout 只在焦点真正离开组件时恢复计时 */
    handleFocusOut(event: FocusEvent): void {
        const next = event.relatedTarget as Node | null;
        if (next && (this.contains(next) || this.shadowRoot?.contains(next))) return;
        this.handleResumeAutoClose();
    }

    /**
     * 排期关闭动画结束后的节点移除
     */
    private scheduleRemoval(): void {
        this.clearRemoveTimer();

        this.removeTimer = setTimeout(() => {
            this.removeTimer = undefined;
            this.remove();
        }, 300) as unknown as number;
    }

    private clearAutoCloseTimer(): void {
        if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = undefined;
        }
    }

    private clearRemoveTimer(): void {
        if (this.removeTimer) {
            clearTimeout(this.removeTimer);
            this.removeTimer = undefined;
        }
    }

    unmounted(): void {
        this.clearAutoCloseTimer();
        this.clearRemoveTimer();
        this.iconSlotObserver?.disconnect();
        this.iconSlotObserver = undefined;
    }

    /**
     * 关闭事件处理
     * close 事件为可取消事件：监听方调用 event.preventDefault() 可阻止关闭（含自动关闭）
     * @param source - 关闭来源：用户点击 / 自动关闭
     */
    handleClose(source: 'user' | 'auto' = 'user'): void {
        if (this.$data.closing) return;

        const allowed = this.dispatchEvent(
            new CustomEvent('close', {
                bubbles: true,
                composed: true,
                cancelable: true,
                detail: { source },
            }),
        );

        // preventDefault() 阻止关闭：不启动移除动画，也不残留定时器
        if (!allowed) {
            this.clearAutoCloseTimer();
            return;
        }

        this.clearAutoCloseTimer();
        this.$data.closing = true;
        this.scheduleRemoval();
    }

    /**
     * 关闭按钮键盘事件（Enter / Space 等价于点击）
     */
    handleCloseKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleClose();
        }
    }

    /**
     * 设置消息内容
     */
    public setMessage(message: string): void {
        this.$data.message = message;
    }

    /**
     * 设置类型
     */
    public setType(type: AlertType): void {
        this.$data.type = type;
    }
}

export default SolelyAlert;
export { SolelyAlert };
