/**
 * 介绍页面视图
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './intro.html?raw';

// 定义组件数据类型
interface DocsIntroData {
    activeTab: 'npm' | 'yarn' | 'pnpm';
}

@CustomElement({
    tagName: 'docs-intro',
    template,
})
export class DocsIntro extends BaseElement<DocsIntroData> {
    constructor() {
        super({
            activeTab: 'npm',
        });
    }

    private installCommands = {
        npm: 'npm install solely',
        yarn: 'yarn add solely',
        pnpm: 'pnpm add solely',
    };

    getInstallCode(): string {
        return this.installCommands[this.$data.activeTab];
    }

    switchTab(tab: 'npm' | 'yarn' | 'pnpm'): void {
        this.$data.activeTab = tab;
        this.refresh();
    }

    async showMessage(): Promise<void> {
        const { Message } = await import('../../../src/components/commands/message');
        Message.success('欢迎使用 Solely UI！');
    }

    async showModal(): Promise<void> {
        const { Modal } = await import('../../../src/components/commands/modal');
        Modal.info({
            title: '欢迎使用',
            content: 'Solely UI 是一个轻量级的 Web Components 组件库',
            onOk: () => {
                // eslint-disable-next-line no-console
                console.log('用户点击了确定');
            },
        });
    }

    async showDrawer(): Promise<void> {
        const { Drawer } = await import('../../../src/components/commands/drawer');
        Drawer.open({
            title: '抽屉组件',
            content: 'Solely UI 提供了丰富的命令式组件',
            placement: 'right',
        });
    }
}

export default DocsIntro;
