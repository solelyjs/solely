import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import { Drawer } from '../../../src/components/commands/drawer';
import template from './drawer.html?raw';

interface DocsData {
    drawerLog: string[];
}

@CustomElement({
    tagName: 'docs-drawer',
    template,
})
export class DocsDrawer extends BaseElement<DocsData> {
    constructor() {
        super({
            drawerLog: [],
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
}
