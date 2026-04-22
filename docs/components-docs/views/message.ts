import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import { Message } from '../../../src/components/commands/message';
import template from './message.html?raw';

interface DocsData {
    messageLog: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadingInstance?: any;
}

@CustomElement({
    tagName: 'docs-message',
    template,
})
export class DocsMessage extends BaseElement<DocsData> {
    constructor() {
        super({
            messageLog: [],
        });
    }

    private addLog(message: string): void {
        this.$data.messageLog = [...this.$data.messageLog.slice(-4), message];
        this.refresh();
    }

    showInfo(): void {
        const instance = Message.info('这是一条信息提示');
        this.addLog('显示信息提示');
    }

    showSuccess(): void {
        Message.success('操作成功完成', 3000);
        this.addLog('显示成功提示');
    }

    showWarning(): void {
        Message.warning('请注意操作安全');
        this.addLog('显示警告提示');
    }

    showError(): void {
        Message.error('操作失败，请重试');
        this.addLog('显示错误提示');
    }

    showLoading(): void {
        this.$data.loadingInstance = Message.loading('正在加载中...');
        this.addLog('显示加载中提示');
    }

    hideLoading(): void {
        if (this.$data.loadingInstance) {
            this.$data.loadingInstance.close();
            this.$data.loadingInstance = undefined;
            this.addLog('隐藏加载中提示');
        }
    }

    showCustomDuration(): void {
        Message.success('这条提示将持续5秒', 5000);
        this.addLog('显示5秒时长的提示');
    }

    showPersistent(): void {
        const instance = Message.open({
            content: '这条提示不会自动关闭，需手动关闭',
            type: 'info',
            duration: 0,
            closable: true,
            onClose: () => {
                this.addLog('手动提示已关闭');
            },
        });
        this.addLog('显示不自动关闭的提示');
    }

    showWithDescription(): void {
        Message.open({
            content: '操作成功',
            description: '您的数据已成功保存到服务器',
            type: 'success',
            duration: 5000,
        });
        this.addLog('显示带描述的提示');
    }

    showCustomIcon(): void {
        const customIcon = document.createElement('span');
        customIcon.textContent = '★';
        customIcon.style.fontSize = '16px';

        Message.open({
            content: '自定义图标消息',
            icon: customIcon,
            duration: 3000,
        });
        this.addLog('显示自定义图标消息');
    }

    updateMessage(): void {
        const instance = Message.loading('正在加载中...');
        this.addLog('显示加载中...');

        setTimeout(() => {
            instance.update({ content: '加载完成！', description: '数据已更新' });
            this.addLog('消息已更新');

            // 2秒后自动关闭
            setTimeout(() => {
                instance.close();
                this.addLog('消息已关闭');
            }, 2000);
        }, 2000);
    }

    destroyAll(): void {
        Message.destroy();
        this.$data.loadingInstance = undefined;
        this.addLog('已销毁所有消息');
    }

    configMessage(): void {
        Message.config({
            duration: 5000,
            maxCount: 3,
            top: 50,
        });
        Message.info('全局配置已更新：持续5秒，最多3条，距顶部50px');
        this.addLog('全局配置已更新');
    }
}
