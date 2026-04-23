import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import { Modal } from '../../../src/components/commands/modal';
import template from './modal.html?raw';

interface DocsData {
    modalLog: string[];
    elementModalLog: string[];
}

@CustomElement({
    tagName: 'docs-modal',
    template,
})
export class DocsModal extends BaseElement<DocsData> {
    constructor() {
        super({
            modalLog: [],
            elementModalLog: [],
        });
    }

    private addLog(message: string): void {
        this.$data.modalLog = [...this.$data.modalLog.slice(-4), message];
        this.refresh();
    }

    openBasicModal(): void {
        const modal = Modal.open({
            title: '基础对话框',
            content: '这是一个基础的对话框示例',
            onOk: () => {
                this.addLog('用户点击了确定');
            },
            onCancel: () => {
                this.addLog('用户点击了取消');
            },
        });
        this.addLog('对话框已打开');
    }

    openConfirmModal(): void {
        Modal.confirm({
            title: '确认操作',
            content: '您确定要执行此操作吗？',
            onOk: () => {
                this.addLog('用户确认了操作');
            },
            onCancel: () => {
                this.addLog('用户取消了操作');
            },
        });
        this.addLog('确认对话框已打开');
    }

    openDeleteConfirm(): void {
        Modal.confirm({
            title: '删除确认',
            content: '此操作将永久删除数据，是否继续？',
            okText: '删除',
            cancelText: '取消',
            okType: 'danger',
            onOk: () => {
                this.addLog('用户确认删除');
            },
            onCancel: () => {
                this.addLog('用户取消删除');
            },
        });
        this.addLog('删除确认对话框已打开');
    }

    openInfoModal(): void {
        Modal.info({
            title: '信息提示',
            content: '这是一条信息提示',
            onOk: () => {
                this.addLog('用户确认了信息');
            },
        });
        this.addLog('信息对话框已打开');
    }

    openSuccessModal(): void {
        Modal.success({
            title: '操作成功',
            content: '您的操作已成功完成',
            onOk: () => {
                this.addLog('用户确认了成功信息');
            },
        });
        this.addLog('成功对话框已打开');
    }

    openWarningModal(): void {
        Modal.warning({
            title: '警告提示',
            content: '请注意操作风险',
            onOk: () => {
                this.addLog('用户确认了警告信息');
            },
        });
        this.addLog('警告对话框已打开');
    }

    openErrorModal(): void {
        Modal.error({
            title: '操作失败',
            content: '操作过程中出现错误',
            onOk: () => {
                this.addLog('用户确认了错误信息');
            },
        });
        this.addLog('错误对话框已打开');
    }

    openCustomModal(): void {
        Modal.open({
            title: '自定义对话框',
            content: '这是一个自定义内容的对话框，可以包含任意 HTML 内容',
            width: 600,
            maskClosable: false,
            onOk: () => {
                this.addLog('自定义对话框确定');
            },
            onCancel: () => {
                this.addLog('自定义对话框取消');
            },
        });
        this.addLog('自定义对话框已打开');
    }

    openAsyncModal(): void {
        Modal.open({
            title: '异步操作对话框',
            content: '点击确定将执行异步操作，操作完成后才会关闭',
            okText: '提交',
            onOk: async () => {
                this.addLog('开始异步操作...');
                await new Promise(resolve => setTimeout(resolve, 1500));
                this.addLog('异步操作完成，对话框已关闭');
            },
            onCancel: () => {
                this.addLog('用户取消了异步操作');
            },
        });
        this.addLog('异步操作对话框已打开');
    }

    openCustomButtonsModal(): void {
        Modal.open({
            title: '自定义按钮对话框',
            content: '这个对话框有三个自定义按钮',
            buttons: [
                {
                    text: '取消',
                    type: 'default',
                    onClick: () => {
                        this.addLog('点击了取消');
                    },
                },
                {
                    text: '稍后处理',
                    type: 'default',
                    onClick: () => {
                        this.addLog('点击了稍后处理');
                    },
                },
                {
                    text: '立即处理',
                    type: 'primary',
                    onClick: () => {
                        this.addLog('点击了立即处理');
                    },
                },
            ],
        });
        this.addLog('自定义按钮对话框已打开');
    }

    openMaskClosableModal(): void {
        Modal.open({
            title: '可点击遮罩关闭',
            content: '点击遮罩层可以关闭此对话框',
            maskClosable: true,
            onOk: () => {
                this.addLog('用户点击了确定');
            },
            onCancel: () => {
                this.addLog('用户点击了遮罩或取消');
            },
        });
        this.addLog('可点击遮罩关闭的对话框已打开');
    }

    updateModal(): void {
        const modal = Modal.open({
            title: '可更新的对话框',
            content: '这是初始内容，宽度为 400px',
            width: 400,
            okText: '更新内容',
            onOk: () => {
                modal.update({
                    title: '已更新',
                    content: '内容已更新，宽度已改为 600px',
                    width: 600,
                    className: 'updated-modal',
                    style: { backgroundColor: '#f5f5f5' },
                });
                this.addLog('对话框内容、宽度、样式已更新');
            },
        });
        this.addLog('可更新的对话框已打开');
    }

    configModal(): void {
        Modal.config({
            width: 600,
            okText: '确认',
            cancelText: '关闭',
        });
        Modal.info({
            title: '全局配置已更新',
            content: '默认宽度600px，确定按钮文字为"确认"',
        });
        this.addLog('全局配置已更新');
    }

    destroyAll(): void {
        Modal.destroy();
        this.addLog('已销毁所有对话框');
    }

    private addElementLog(message: string): void {
        this.$data.elementModalLog = [...this.$data.elementModalLog.slice(-4), message];
        this.refresh();
    }

    openElementModal(): void {
        const btn = this.$refs.modalTriggerBtn as HTMLElement;
        console.info('通过 Element 组件触发:', btn);

        Modal.open({
            title: 'Element 触发',
            content: '通过 Solely Button 组件触发的对话框',
            onOk: () => {
                this.addElementLog('Element 触发：用户点击了确定');
            },
            onCancel: () => {
                this.addElementLog('Element 触发：用户点击了取消');
            },
        });
        this.addElementLog('通过 Element Button 打开对话框');
    }

    openModalWithElementContent(): void {
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <p>可以在 Modal 内容中使用 Solely 组件：</p>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <span style="color: var(--solely-primary);">★</span>
                    <span>支持自定义 HTML 内容</span>
                </div>
                <div style="padding: 12px; background: var(--solely-bg-color-secondary); border-radius: 4px;">
                    <code>content</code> 参数支持传入 HTMLElement
                </div>
            </div>
        `;

        Modal.open({
            title: 'Element 作为内容',
            content: content,
            width: 480,
            onOk: () => {
                this.addElementLog('自定义内容：用户点击了确定');
            },
        });
        this.addElementLog('打开带自定义 Element 内容的对话框');
    }

    openCustomDomModal(): void {
        // 完全自定义内容，无默认图标
        const customContent = document.createElement('div');
        customContent.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 32px;">✅</span>
                    <div>
                        <div style="font-size: 16px; font-weight: 500; margin-bottom: 4px;">操作成功</div>
                        <div style="color: var(--solely-text-secondary); font-size: 14px;">您的数据已成功保存到服务器</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <span style="display: inline-flex; align-items: center; gap: 4px;
                    padding: 4px 8px; background: var(--solely-bg-color-secondary);
                    border-radius: 4px; font-size: 12px;">
                        <span style="width: 6px; height: 6px;
                        background: var(--solely-success); border-radius: 50%;"></span>
                        已同步
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 4px;
                    padding: 4px 8px; background: var(--solely-bg-color-secondary);
                    border-radius: 4px; font-size: 12px;">
                        <span style="width: 6px; height: 6px;
                        background: var(--solely-primary); border-radius: 50%;"></span>
                        已备份
                    </span>
                </div>
            </div>
        `;

        // 使用 showIcon: false 去掉默认图标
        Modal.open({
            title: '自定义 DOM 内容（无默认图标）',
            content: customContent,
            width: 480,
            showIcon: false, // 去掉默认图标
            showCancel: false,
            okText: '知道了',
            onOk: () => {
                this.addElementLog('自定义 DOM：用户点击了确定');
            },
        });
        this.addElementLog('打开无默认图标的自定义 DOM 对话框');
    }
}
