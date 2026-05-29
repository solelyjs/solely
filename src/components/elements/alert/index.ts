/**
 * Solely Alert 组件
 * 警告提示组件，用于页面内展示重要的提示信息
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { AlertProps } from './types';
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
        { name: 'block', type: 'boolean', default: false },
    ],
})
class SolelyAlert extends BaseElement<AlertProps & { closing: boolean }> {
    private closeTimer?: number;

    /**
     * 获取 alert class 对象
     */
    getAlertClasses(): Record<string, boolean> {
        return {
            [`alert--${this.$data.type}`]: !!this.$data.type,
            'is-closing': this.$data.closing,
            'alert--block': !!this.$data.block,
        };
    }

    /**
     * 获取图标
     */
    getIcon(type: AlertProps['type']): string {
        const icons: Record<string, string> = {
            info: 'ℹ',
            success: '✓',
            warning: '⚠',
            error: '✕',
        };
        return icons[type] || icons.info;
    }

    /**
     * 组件挂载后
     */
    mounted(): void {
        this.refresh();
    }

    unmounted(): void {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
            this.closeTimer = undefined;
        }
    }

    /**
     * 关闭事件处理
     */
    handleClose(): void {
        this.$data.closing = true;

        // 触发关闭回调
        this.emit('close');

        this.closeTimer = setTimeout(() => {
            this.remove();
        }, 300) as unknown as number;
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
    public setType(type: AlertProps['type']): void {
        this.$data.type = type;
    }
}

export default SolelyAlert;
export { SolelyAlert };
