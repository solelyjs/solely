/**
 * Solely Alert 组件
 * 警告提示组件，用于页面内展示重要的提示信息
 */

import { BaseElement, CustomElement } from '../../../runtime/component';
import type { AlertProps } from './types';
import styles from './style.css?inline';
import template from './index.html?raw';

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
     * 关闭事件处理
     */
    handleClose(): void {
        this.$data.closing = true;

        // 触发关闭回调
        this.emit('close');

        // 动画结束后从 DOM 移除
        setTimeout(() => {
            this.remove();
        }, 300);
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
