/**
 * 首页视图
 */

import { CustomElement } from '../../../src/runtime/component/decorators';
import BaseElement from '../../../src/runtime/component/base-element';
import template from './home.html?raw';

@CustomElement({
    tagName: 'docs-home',
    template,
})
export class DocsHome extends BaseElement {
    async showMessage(): Promise<void> {
        const { Message } = await import('../../../src/components/commands/message');
        Message.success('欢迎使用 Solely UI！');
    }

    async showModal(): Promise<void> {
        const { Modal } = await import('../../../src/components/commands/modal');
        Modal.info({
            title: '欢迎使用',
            content: 'Solely UI 是一个轻量级的 Web Components 组件库',
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

export default DocsHome;
