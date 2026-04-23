import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import { Drawer } from '../../../src/components/commands/drawer';
import template from './drawer.html?raw';

interface DocsData {
    drawerLog: string[];
    elementDrawerLog: string[];
}

@CustomElement({
    tagName: 'docs-drawer',
    template,
})
export class DocsDrawer extends BaseElement<DocsData> {
    constructor() {
        super({
            drawerLog: [],
            elementDrawerLog: [],
        });
    }

    private addLog(message: string): void {
        this.$data.drawerLog = [...this.$data.drawerLog.slice(-4), message];
        this.refresh();
    }

    openDrawer(): void {
        Drawer.open({
            title: '基础抽屉',
            content: '这是一个基础的抽屉组件示例',
            placement: 'right',
            onClose: () => {
                this.addLog('抽屉已关闭');
            },
        });
        this.addLog('抽屉已打开');
    }

    openLeftDrawer(): void {
        Drawer.open({
            title: '左侧抽屉',
            content: '从左侧打开的抽屉',
            placement: 'left',
            width: 250,
        });
        this.addLog('左侧抽屉已打开');
    }

    openRightDrawer(): void {
        Drawer.open({
            title: '右侧抽屉',
            content: '从右侧打开的抽屉',
            placement: 'right',
            width: 300,
        });
        this.addLog('右侧抽屉已打开');
    }

    openTopDrawer(): void {
        Drawer.open({
            title: '顶部抽屉',
            content: '从顶部打开的抽屉',
            placement: 'top',
            height: 200,
        });
        this.addLog('顶部抽屉已打开');
    }

    openBottomDrawer(): void {
        Drawer.open({
            title: '底部抽屉',
            content: '从底部打开的抽屉',
            placement: 'bottom',
            height: 300,
        });
        this.addLog('底部抽屉已打开');
    }

    openNoMaskDrawer(): void {
        Drawer.open({
            title: '无遮罩抽屉',
            content: '没有遮罩层的抽屉',
            placement: 'right',
            mask: false,
        });
        this.addLog('无遮罩抽屉已打开');
    }

    openNoClosableDrawer(): void {
        Drawer.open({
            title: '不可关闭抽屉',
            content: '没有关闭按钮的抽屉，只能通过代码关闭',
            placement: 'right',
            closable: false,
            maskClosable: false,
            onClose: () => {
                this.addLog('抽屉已关闭');
            },
        });
        this.addLog('不可关闭抽屉已打开（3秒后自动关闭）');
        setTimeout(() => {
            Drawer.destroy();
            this.addLog('已销毁所有抽屉');
        }, 3000);
    }

    openCustomDrawer(): void {
        Drawer.open({
            title: '自定义抽屉',
            content: '自定义内容和样式的抽屉',
            placement: 'right',
            width: 400,
            maskClosable: false,
            bodyStyle: { padding: '24px', backgroundColor: '#f5f5f5' },
            onClose: () => {
                this.addLog('自定义抽屉已关闭');
            },
        });
        this.addLog('自定义抽屉已打开');
    }

    updateDrawer(): void {
        const drawer = Drawer.open({
            title: '可更新的抽屉',
            content: '这是初始内容，宽度为 300px',
            width: 300,
            onClose: () => {
                this.addLog('可更新抽屉已关闭');
            },
        });
        this.addLog('可更新抽屉已打开（3秒后更新）');

        setTimeout(() => {
            drawer.update({
                title: '已更新',
                content: '内容已更新，宽度已改为 500px',
                width: 500,
                bodyStyle: { backgroundColor: '#f5f5f5' },
            });
            this.addLog('抽屉已更新');
        }, 3000);
    }

    configDrawer(): void {
        Drawer.config({
            width: 500,
            maskClosable: false,
        });
        Drawer.open({
            title: '全局配置已更新',
            content: '默认宽度已改为 500px，且不可点击遮罩关闭',
            onClose: () => {
                this.addLog('配置后的抽屉已关闭');
            },
        });
        this.addLog('全局配置已更新');
    }

    destroyAllDrawers(): void {
        Drawer.destroy();
        this.addLog('已销毁所有抽屉');
    }

    private addElementLog(message: string): void {
        this.$data.elementDrawerLog = [...this.$data.elementDrawerLog.slice(-4), message];
        this.refresh();
    }

    openElementDrawer(): void {
        const btn = this.$refs.drawerTriggerBtn as HTMLElement;
        console.log('通过 Element 组件触发:', btn);

        Drawer.open({
            title: 'Element 触发',
            content: '通过 Solely Button 组件触发的抽屉',
            placement: 'right',
            onClose: () => {
                this.addElementLog('Element 触发：抽屉已关闭');
            },
        });
        this.addElementLog('通过 Element Button 打开抽屉');
    }

    openDrawerWithElementContent(): void {
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <p>可以在 Drawer 内容中使用 Solely 组件：</p>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <solely-tag type="primary">标签1</solely-tag>
                    <solely-tag type="success">标签2</solely-tag>
                    <solely-tag type="warning">标签3</solely-tag>
                </div>
                <div style="padding: 12px; background: var(--solely-bg-color-secondary); border-radius: 4px;">
                    <code>content</code> 参数支持传入 HTMLElement
                </div>
                <solely-button type="primary" block>确定</solely-button>
            </div>
        `;

        Drawer.open({
            title: 'Element 作为内容',
            content: content,
            placement: 'right',
            width: 400,
            onClose: () => {
                this.addElementLog('自定义内容：抽屉已关闭');
            },
        });
        this.addElementLog('打开带自定义 Element 内容的抽屉');
    }

    openCustomDomDrawer(): void {
        // 完全自定义 DOM 内容
        const customContent = document.createElement('div');
        customContent.innerHTML = `
            <div style="padding: 16px;">
                <h3 style="margin: 0 0 16px 0; font-size: 18px;">用户详情</h3>
                <div style="display: flex; gap: 16px; margin-bottom: 20px; align-items: center;">
                    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, var(--solely-primary), var(--solely-success)); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: 500;">张</div>
                    <div>
                        <div style="font-weight: 500; font-size: 16px; margin-bottom: 4px;">张三</div>
                        <div style="color: var(--solely-text-secondary); font-size: 13px;">zhangsan@example.com</div>
                        <div style="margin-top: 8px;">
                            <span style="display: inline-block; padding: 2px 8px; background: var(--solely-success-bg); color: var(--solely-success); border-radius: 4px; font-size: 12px;">已认证</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <solely-button type="primary" style="flex: 1;">编辑资料</solely-button>
                    <solely-button type="default" style="flex: 1;">关闭</solely-button>
                </div>
            </div>
        `;

        Drawer.open({
            title: '自定义 DOM 内容',
            content: customContent,
            placement: 'right',
            width: 400,
            onClose: () => {
                this.addElementLog('自定义 DOM：抽屉已关闭');
            },
        });
        this.addElementLog('打开完全自定义 DOM 内容的抽屉');
    }
}
